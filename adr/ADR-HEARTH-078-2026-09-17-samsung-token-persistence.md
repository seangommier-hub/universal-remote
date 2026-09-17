# ADR-HEARTH-078: Samsung Tizen never persisted its pairing token — every reconnect re-prompted

**Date:** 2026-09-17
**Status:** Accepted, implemented

## Context

Sean, restated again the same day as ADR-HEARTH-077's banner-copy fix: "if a tv connection
exists, and has been authed and used, then until the tv turns off, the connection should be able
to be somewhat persistent and not have a day of reconnecting the same way a natural remote does."

ADR-HEARTH-077 (same day, earlier) investigated this and concluded the reconnect *scheduling*
architecture was already correct — indefinite backoff retry, foreground-resume, network-change
detection all already fire automatically (ADR-HEARTH-017/075) — and fixed the disconnected
banner's copy, which read as a dead end when the app was actually already retrying in the
background. That fix is real and correct as far as it goes, but it doesn't touch a separate
question: when a retry actually reaches the TV, does reconnecting require a fresh physical
approval tap, or does it skip straight to connected? That's a per-driver protocol question, not a
scheduling one — checked directly, not assumed answered by ADR-077's own investigation, which
cited ADR-017 (retry scheduling) rather than ADR-021 (LG's pairing-key reuse).

**Real, confirmed gap found in `SamsungTizenClient.ts`**: LG's driver solved this exact problem
back on 2026-09-10 (ADR-HEARTH-021) — the TV issues a client-key on first approval, and replaying
it on a later connection lets the TV recognize the client silently, no prompt. The Samsung Tizen
protocol has the identical mechanism (a `token` in the `ms.channel.connect` event's data,
replayable as a `?token=` query param — confirmed against this file's own cited reference
implementation, `xchwarze/samsung-tv-ws-api`) — but `SamsungTizenClient.connect()` never read the
token out of the connect event, never stored it, and never sent one back. Its own
`CONNECT_TIMEOUT_MS` constant even said outright: `// the TV requires a physical on-screen
approval tap` — treated as unconditionally true, when LG's driver had already proven six weeks
earlier that it's only true for a genuinely first-time pairing. Every single Samsung reconnect —
every background retry, every app-foreground resume, every network-change trigger — was silently
re-triggering a full pairing prompt on the TV, indefinitely, for as long as the household owns a
Samsung Tizen TV. This is very plausibly the literal, concrete cause of "a day of reconnecting,"
not just a messaging problem.

## Decision

Mirrored `LgWebOsClient`/`LgWebOsDriver`'s exact, already-proven pattern (ADR-HEARTH-021), not
reinvented:

- `SamsungTizenConfig` gains an optional `token`. When set, `connect()` appends
  `&token=<token>` to the connection URL alongside the existing `name=` param.
- `connect()`'s return type changes `Promise<void>` → `Promise<string | undefined>`, resolving
  with whatever token the `ms.channel.connect` event's `data.token` carries — falling back to the
  already-known token (not `undefined`) when the TV recognizes a returning client silently
  without re-issuing one, so a known-good token is never dropped just because the TV didn't repeat
  it.
- The timeout's error message now distinguishes a genuine first-time pairing ("Timed out waiting
  for pairing approval...") from a saved-but-since-rejected token ("This TV isn't recognizing a
  previous pairing anymore...") — identical wording/logic split to LG's.
- `SamsungTizenDriver.requireConfig()` reads `device.config.token` and passes it through;
  `doConnect()` writes back whatever token `connectClient()` resolves with, the same
  `if (token && device.config) { device.config.token = token; }` shape LG uses — including through
  the MAC-based re-discovery retry path, not just the primary connect attempt.
- Added the same diagnostic log line LG's driver has: states directly in the log whether this
  connect attempt has a saved token (silent) or will need a fresh on-screen approval (first pairing).

Deliberately did **not** touch the reconnect-scheduling logic (ADR-HEARTH-017) or the banner copy
(ADR-HEARTH-077) — both already correct; this closes a different, protocol-level gap underneath
them.

## Verification

4 new tests: `SamsungTizenClient.test.ts` (resolves with a TV-issued token on first pairing; sends
a known token back as a query param and keeps it even when the TV doesn't repeat it),
`SamsungTizenDriver.test.ts` (persists a freshly-learned token onto `device.config`; a saved token
survives a reconnect where the TV doesn't reissue one). Full suite: 34 suites / 354 tests pass,
`tsc --noEmit` clean.

**Not verified against a real Samsung TV** — no physical device available this session. The real
checkpoint: a household with a paired Samsung TV should see the on-screen approval prompt appear
exactly once, ever (barring the TV itself clearing its trust list — the same honest exception
ADR-HEARTH-021 documents for LG), not on every background reconnect.

## Consequences

- Samsung TVs now have parity with LG's already-working "approve once, never again" behavior.
- Sony (stateless HTTP + a fixed pre-shared key, no per-connection handshake) and Roku (typically
  unauthenticated local ECP) were checked and don't have this class of gap at all — there's no
  pairing ceremony to skip in the first place for either protocol, confirmed by reading their
  clients rather than assumed from the driver shape rhyming.
- If Sean's actual TV is neither LG nor Samsung, this fix doesn't address his specific hardware —
  worth confirming which TV(s) are actually in use before assuming this closes the complaint
  completely.
