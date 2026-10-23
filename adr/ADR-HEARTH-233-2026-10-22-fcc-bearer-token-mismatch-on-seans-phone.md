# ADR-HEARTH-233: Found, not fixed — Sean's phone's saved FCC token is being rejected server-side

**Date:** 2026-10-22
**Status:** Diagnosed, not resolved by code. Needs Sean to re-verify the connection in Settings.

## Context

After shipping ADR-HEARTH-232's Keychain fix, a sibling session relayed that Sean's power on/off
also stopped working, even while the app showed the LG TV as "connected." Investigated directly
against the Pi rather than guessing further.

## Investigation

Sean's phone's own client log (`~/.hearth-client-logs/b1b1a43e*.jsonl`) shows 86 occurrences of
`"Family Command Center rejected the saved token."` spanning **2026-10-21 23:43 through
2026-10-23 02:28** — a standing, 24+ hour problem, not something ADR-232's fix caused or could fix
(that fix is about a *locked-phone* exception never reaching the server at all; this is the server
actively answering 401).

Ruled out server-side causes directly, from the Pi itself:
- `HEARTH_API_TOKEN` in `.env.local` is **byte-identical** (SHA-256 compared) to the Oct 20 backups
  — never rotated.
- Called `/api/integrations/hearth/devices`, `/wake-on-lan`, and `/relay/http` directly with that
  exact current token (`curl` from the Pi, both `localhost` and the LAN IP) — **all three return
  200**, including a real Wake-on-LAN packet actually sent to the LG TV's MAC.
- `isHearthSourceLockedOut`/rate-limiting only applies to Cloudflare-tunneled (public) requests
  (`cf-connecting-ip` present); LAN calls are exempt by design (adr/0186 in family-command-center)
  — not a lockout explanation for a LAN-connected phone.
- `src/lib/hearth/phone-tokens.json` on the Pi is completely empty — no per-phone token has ever
  been issued to any phone, so this isn't a stale/revoked personal token either; Sean's phone is
  necessarily presenting (or meant to present) the legacy shared token.
- No code path found that silently rewrites the saved token in the background; `joinHousehold.ts`'s
  `saveRedeemed()` (the only place besides manual Settings entry that writes a new token) only
  runs on an explicit, user-confirmed invite redemption.

**Conclusion:** the server and its token are correct and working. The token value saved on Sean's
phone (`expo-secure-store`, key `hearth.fcc.token`) does not match it — a genuine client-side
pairing/credential mismatch, not a bug in `wsRelayFallback.ts`/`httpRelayFallback.ts`/
`wakeOnLan.ts`/`fccJsonRequest.ts` or the server's auth check. Exactly why his phone's saved copy
drifted from the server's value could not be determined from the evidence available (no code path
found that would explain it); it may predate this investigation entirely.

**Why this explains "powerOn broke too":** `LgWebOsDriver.executeCommand`'s `powerOn` case calls
`executeWakeOnLan()` → `sendWakeOnLan()`, which needs this exact token to reach Family Command
Center — it has nothing to do with the TV's own WebSocket connection, so "the TV shows connected"
does not imply powerOn can work. `powerOff` (`ssap://system/turnOff`) goes over the TV's own
already-open socket and does **not** need this token at all — no evidence was found of that path
failing in isolation; if it's still broken after the fix below, it needs its own fresh diagnosis
from logs captured at the time, which requires the Keychain fix (ADR-232) to have actually reached
the phone first (see Resolution).

## Resolution

Not a code fix. **Sean needs to re-verify the Family Command Center connection in Hearth's
Settings** (re-enter the address/token, or re-scan the pairing QR) — the existing
`verifyAndSaveFamilyCommandCenterConfig()` flow tests the token against a real request before
saving it, so a successful re-save guarantees a matching token going forward. This is a credential
action only Sean can perform (ADR-GLOBAL-008/credential boundary) — not a multi-step technical
procedure, one screen in Settings.

Also: ADR-232's fix only reaches the phone once the app actually reloads the new JS bundle
(`expo-updates` checks on a cold launch). Sean's log still shows the pre-fix update ID
(`1.1.0+01a1663e`) as of this writing — force-quitting and reopening the app is needed before any
of ADR-232's effects (or a retest of powerOff) are meaningful.
