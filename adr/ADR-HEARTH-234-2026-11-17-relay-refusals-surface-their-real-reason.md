# ADR-HEARTH-234: Relay refusals surface their real reason; finish the Keychain-safe config sweep

**Date:** 2026-11-17
**Status:** Accepted, implemented, tested
**Follows:** ADR-HEARTH-014, ADR-HEARTH-231, ADR-HEARTH-232, ADR-HEARTH-233

## Context

Sean, directly: "understand why the hearth app isn't connecting to the lg tv and has issues
connecting with devices", then "fix it". No Pi access from this session, so this was diagnosed
from both repos (this one and family-command-center), not from live logs.

The LG is the one device that can never connect directly from the phone: iOS cannot trust its
`wss://3001` certificate (ADR-HEARTH-014), so every LG connection goes through Family Command
Center's WS relay. Anything wrong on that path stops the LG completely, while Sony/Roku keep
partly working over their direct LAN routes.

Two code problems found on that path:

1. **Relay refusals were reported as TV pairing problems.** The relay
   (`scripts/hearth-relay/relay-ws-server.js` in family-command-center) accepts the WebSocket
   first and validates it afterward, so a refusal arrives as a *close* on an already-open socket:
   `4001` bad token, `4003` target not a known device, `4004` port not allowed, `4008` the TV
   didn't answer within 10s, `1011` internal error. `LgWebOsClient`'s and `SamsungTizenClient`'s
   handshakes attached no `onclose` until after a successful register, so that close was
   ignored. The register timeout then fired 8s later with "This TV isn't recognizing a previous
   pairing anymore… accept the on-screen prompt", pointing at the TV when the real cause was the
   phone's token (the open ADR-HEARTH-233 problem) or the TV being off its network.
2. **ADR-HEARTH-232's known follow-up was still open.** `fccJsonRequest.ts` (PS5, Broadlink,
   Chromecast, Apple TV, Android TV) and the inline relay code in Kasa, Govee, Alexa plug,
   SmartThings, Xbox, Android TV and the Ring/FCC camera path still called the raw
   `loadFamilyCommandCenterConfig()`. With the phone locked or the app in the background, it
   throws a native KeyChainException instead of resolving into the normal "try again" path.

## Decision

- `wsRelayFallback.ts` exports `describeHandshakeClose(event, target)` and `RelayRefusedError`:
  it maps the relay's codes to plain messages ("Family Command Center rejected this phone's saved
  token — re-verify the connection in Settings…", "…couldn't reach the TV — it may be off, asleep,
  or off its Wi-Fi network", etc.), and treats any other close as "the connection closed before
  the TV answered", not a pairing problem.
- The LG and Samsung handshakes attach an `onclose` that rejects immediately with that error. A
  close that happens after the TV already showed an approval prompt still says so. The client's
  *own* deliberate `socket.close()` calls (register timeout, TV-reported error, Samsung denial)
  detach the handler first, so they keep their existing, correct messages.
- The remaining driver/network call sites switch to `loadFamilyCommandCenterConfigSafely()`.
  Each already had a correct `null`-config branch, the same contract ADR-HEARTH-232 relied on.
  UI screens and discovery code that read the config directly were left alone: they aren't on
  any device-connection path and most already wrap the read themselves (ADR-HEARTH-196).

## Not fixed by code (Sean's actions)

- **The ADR-HEARTH-233 token mismatch**, if it is still there: Settings → Family Command Center →
  re-verify (or re-scan the QR). With this change, it now shows up as that exact message instead of
  a misleading TV pairing message, so it's easy to confirm.
- **The Pi's Wi-Fi** (family-command-center adr/0282): the Kids Wi-Fi (`ap0`, 10.20.30.x, where
  the LG has lived) shares the Pi's one radio, which must stay on the same channel as its 5 GHz
  uplink; the router changes channels on its own. The ALFA adapter / channel pin is still undecided.
  A TV that drops for this reason now reports "couldn't reach the TV" (4008), not pairing.

## Testing

- New: `LgWebOsClient.test.ts` (5): 4001 fails immediately with the token message (no 8s
  timer left pending), 4008, 4003, plain close, and silence still giving the existing timeout
  message. `SamsungTizenClient.test.ts` (+1) for 4001. `MockWebSocket` gains `simulateClose(code, reason)`.
- Mocks retargeted to `loadFamilyCommandCenterConfigSafely` in the 13 driver test files whose
  production code now calls it, plus `runtime/fccCameraSync.test.ts`; `driverContract.test.ts`
  provides both.
- `tsc --noEmit` clean. Jest, run per directory (the cloud runner restarts on one big run):
  src/drivers, src/core, src/discovery, src/runtime, src/ui, src/web, src/demo — all passing.
- Needs an EAS update to reach the phones (JS-only, no native change).
