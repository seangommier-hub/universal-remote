# ADR-HEARTH-021: Persist and reuse the LG pairing key

**Date:** 2026-09-10
**Status:** Accepted

## Context

Sean, directly, after using the real app on his phone: "find a way to make
this so that i only have to approve one time and it is forever remembered
by the tv." He was re-hitting the on-screen Allow/Deny pairing prompt on
repeated connects, which shouldn't be necessary — the whole point of
SSAP's client-key handshake is that a TV remembers an approved client.

Traced the actual cause: `LgWebOsClient.connect()` DOES receive a
client-key from the TV on every successful pairing (`message.payload["client-key"]`,
extracted inside `handleMessage`) — but the outer `Promise` executor's
register-specific `resolve` callback was declared as a zero-arg arrow
function (`resolve: () => { ...; resolve(); }`), silently discarding the
payload argument it was called with. Nothing was ever available to
persist, and every `connect()` call sent only the bare
`PAIRING_MANIFEST` with no previously-known key — so from the TV's side,
every connection looked like a brand-new, unrecognized client, and it
prompted accordingly. Verified against the reference implementation this
driver already cites (`hobbyquaker/lgtv2`): sending a known client-key
back alongside the manifest is exactly how that library skips
re-prompting on a returning client.

## Decision

- `LgWebOsClient.connect()` now returns `Promise<string | undefined>`
  (was `Promise<void>`), resolving with whatever client-key the TV
  confirms.
- `LgWebOsConfig` gains an optional `clientKey`. When set, `connect()`
  includes it in the register payload (`{ ...PAIRING_MANIFEST, "client-key": key }`)
  alongside the manifest, not instead of it.
- `LgWebOsDriver.requireConfig()` reads `device.config.clientKey` if
  present and passes it through. `doConnect()` writes whatever key
  `client.connect()` resolves with back onto `device.config.clientKey` —
  an in-place mutation of the same `Device` object every other part of
  the app already holds a reference to (App.tsx's `devices` array, the
  open remote screen's `screen.device`), consistent with how `config` is
  already treated as a loosely-typed mutable record elsewhere in this
  codebase.
- That mutation alone doesn't reach disk. `App.tsx`'s `reconnectAllDevices`
  and `handleReconnect` (previously: connect and nothing else) now also
  call a new `saveDeviceQuietly()` helper after every successful
  `connect()`, not just at initial pairing time
  (`handleDeviceAdded`/`handleRenameDevice` already did, and now share the
  same helper instead of three near-identical try/catch blocks). Cheap,
  idempotent no-op for every driver whose config didn't change.

## Rationale

Mutating `device.config` in place rather than threading a new return
value through the `DeviceDriver` interface avoids touching Sony/Samsung/
Roku's `connect()` signatures for a fix that's LG-specific right now —
the other three drivers have no equivalent persistent-token concept
confirmed yet (Samsung's Tizen protocol is a real candidate for the same
treatment, but that needs its own protocol verification before touching
it — not assumed here just because the shape rhymes).

Re-saving after every reconnect (not only at pairing time) is what
actually satisfies "forever remembered" — a key learned during, say, the
app-foreground reconnect listener (ADR-HEARTH-017) needs to reach disk
the same as one learned at initial pairing, or it only survives until the
app is killed.

## Consequences

- 102/102 tests passing (2 new: `LgWebOsClient` sending a known key back
  and getting it confirmed; `LgWebOsDriver` writing a received key into
  `device.config`). Two existing tests updated
  (`toBeUndefined()` → `toBe("<key>")`) since `connect()`'s return type
  changed. `tsc --noEmit` clean.
- A device paired before this fix has no stored key yet — its next
  connect re-prompts once more (expected, unavoidable), then stores the
  key from then on.
- Not yet confirmed against the real TV that a second connect truly skips
  the prompt — the mock-driven tests prove the wire format matches the
  reference implementation, not that this specific TV's firmware honors
  it. Next real checkpoint: Sean reconnecting a second time without
  seeing the Allow/Deny prompt again.
- If Samsung's protocol turns out to have an equivalent persistent-token
  mechanism, it should get its own ADR when actually verified — not
  bolted on here by assumption.

## Update 2026-09-10 (same day, later): confirmed live — the TV can forget a saved key

Real-hardware finding, diagnosed live with Sean on his 75" LG TV. He
reported "Reconnect" doing nothing; walked through it step by step:

1. Added a diagnostic log (`LgWebOsDriver.doConnect`) stating plainly
   whether a saved client-key exists before each connect attempt — direct
   evidence instead of guessing from symptoms.
2. Confirmed via that log: a saved client-key **does** exist for this TV
   (this ADR's mechanism has worked before) and **is** being sent.
3. The connection still timed out waiting for pairing approval anyway —
   the TV is not honoring its own previously-issued key. Concluded: the
   TV's own trust list has been cleared since (a firmware update, a
   factory reset, or clearing "connected devices" in its settings) — nothing
   Hearth's persistence logic did wrong, and nothing a retry or a code fix
   here can work around. The one-time physical approval is unavoidable
   again, exactly as it would be for a true first pairing.

This is a real, distinct failure mode from "never paired yet," so
`LgWebOsClient.connect()`'s timeout error message now says which one
happened, instead of one generic message for both: a saved-but-rejected
key gets "This TV isn't recognizing a previous pairing anymore (its own
settings may have been reset or updated) — accept the on-screen prompt to
re-approve it," a genuine first-time pairing keeps the original "accept
the on-screen prompt and try again." 2 new tests (fake timers, both
branches); 164/164 total, `tsc --noEmit` clean.

Still blocked on the same real-hardware checkpoint as before — a human
physically accepting the prompt on the TV — this update only makes the
diagnosis and the resulting message clearer, not the underlying
requirement optional.

## Update 2026-09-10 (same day, later still): the actual reason "allowed it 15 times" kept happening

Sean, directly, after the above: "yes i have ALLOWED IT like 15 times, i
don't want to again." The "TV cleared its trust list" diagnosis above
explained one bad night, not fifteen repeats — that pointed at a real
bug in Hearth's own persistence, not the TV.

Traced it: this ADR's original fix only re-saves `device.config` from two
call sites — `App.tsx`'s `reconnectAllDevices()` and `handleReconnect()`
— both of which call `driver.connect(device)` directly and then
`saveDeviceQuietly(device)` right after. But ADR-HEARTH-017's later
auto-reconnect work gave every TV/Hue driver its own internal
`scheduleReconnect()` loop that calls `this.connect(device)` on *itself*,
entirely inside the driver, whenever a connection drops unexpectedly —
this path never runs through App.tsx at all. Any client-key learned
during one of those autonomous background retries (the single most
common way a TV actually reconnects day-to-day — WiFi blips, TV standby,
router hiccups — far more common than a user tapping "Reconnect")
mutated `device.config` in memory exactly as designed, then was silently
dropped the next time the app reloaded. From Sean's side this looked
identical to the TV forgetting its key: the on-screen prompt returning
over and over, no matter how many times he accepted it.

Fixed at the one place every reconnect path — manual tap, initial
`reconnectAllDevices()` at startup, the AppState foreground listener, and
every driver's own `scheduleReconnect()` — already converges: the shared
`StateStore` bridge (`stateStoreBridge.ts`, ADR-HEARTH-020).
`bridgeDeviceState()` now takes an optional `onConnected(device)` callback,
fired exactly once on a genuine `disconnected/unknown -> connected`
transition (guarded by an `initialized` flag so a device that's already
connected at wiring time doesn't spuriously fire, and so repeated
`"connected"` updates from ordinary successful commands don't re-fire).
`App.tsx`'s `attachStateBridge()` now passes `saveDeviceQuietly` as that
callback — one line, covering all four reconnect paths uniformly instead
of teaching each driver about persistence individually. The two existing
direct `saveDeviceQuietly()` calls in `reconnectAllDevices`/`handleReconnect`
are now redundant with this but harmless (idempotent, best-effort) — left
in place rather than removed, since removing them buys nothing and adds
risk for no reason.

183/183 tests passing (3 new: fires once on a real transition, does not
re-fire on repeated already-connected updates, fires again after a
disconnect/reconnect cycle — matching a driver's own autonomous retry).
`tsc --noEmit` clean.

This should make the LG TV's next re-pairing (via `EditDeviceAddressScreen`
at its current address, or a fresh on-screen accept if the TV really did
clear its trust list) the **last** one required — any key it hands back
from that point on, through any reconnect path, now actually reaches
disk.
