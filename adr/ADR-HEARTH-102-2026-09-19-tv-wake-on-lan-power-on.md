# ADR-HEARTH-102: TV power-on-from-off via Wake-on-LAN

**Date:** 2026-09-19
**Status:** Accepted, implemented

## Context

Sean, directly: "why can i not turn tvs on when they are off," then "let's focus on finding a
solve for the lg and other tv turning on." All three TV drivers (LG webOS, Samsung Tizen, Sony
BRAVIA) control their TVs over a live network connection to the TV itself (an SSAP WebSocket, a
Tizen remote-control WebSocket, and per-request REST calls, respectively) — none of these
protocols can reach a TV that's genuinely powered off, since a fully-off TV's network interface
isn't listening on any of those ports at all. `LgWebOsDriver.ts` already documented this exact gap
in a code comment (only `powerOff` was ever declared, "waking one requires Wake-on-LAN, which is a
separate, unimplemented mechanism" — see ADR-HEARTH-006).

Wake-on-LAN (WoL) is the standard, decades-old fix for exactly this: a "magic packet" (6 bytes of
`0xFF` followed by the target's own MAC address repeated 16 times) broadcast over UDP — any network
interface with WoL enabled wakes on receiving it, regardless of the TV's own remote-control
protocol. This was already built and live-tested earlier the same day on Family Command Center's
side (`src/lib/network/wake-on-lan.ts` there, relayed through
`/api/integrations/hearth/wake-on-lan`, confirmed via a real `{"sent":true}` response against the
LG TV's actual MAC `F8:B9:5A:43:7E:3E`) — runs server-side for the same reason every other
UDP-broadcast mechanism in this project does (SSDP, PS5's DDP/OAuth wake): `react-native-udp`
doesn't support Expo SDK 57's mandatory New Architecture, confirmed broken earlier in this same
session (ADR-HEARTH-099's addendum).

This ADR covers the Hearth-side client (`src/core/network/wakeOnLan.ts`, a thin fetch wrapper
mirroring every other relay client's `loadFamilyCommandCenterConfig()` pattern) and wiring it into
all three TV drivers — the part that actually closes the gap Sean asked about.

## Decision

Each driver gets Wake-on-LAN wired in at the exact point where "no live connection" is already its
own existing signal for "can't reach this TV" — rather than adding a new state or a separate
"is it off" probe:

- **LgWebOsDriver.ts**: `powerOn` is now a declared capability (previously undeclared entirely).
  `executeCommand` branches on it *before* the existing `if (!client) throw` check, since a
  fully-off TV never has a client. Resolves the TV's MAC from `device.config.hwaddr` (already
  saved by discovery/reconnect self-healing) or a fresh `findMacByIp` lookup, backfills it onto
  `device.config` if it was missing, then calls `sendWakeOnLan`.
- **SamsungTizenDriver.ts**: `power` was already a single on/off toggle capability sent as
  `KEY_POWER` over the same WebSocket every other command uses. `executeCommand`'s existing
  `if (!client)` branch now special-cases `power` to call the same Wake-on-LAN fallback instead of
  throwing "not connected" — every other capability still requires a live connection unchanged.
- **SonyBraviaDriver.ts**: no persistent connection exists at all (every call is a fresh REST
  request), so "unreachable" surfaces as `applyCommand`'s own `getPowerStatus` call throwing.
  `executeCommand` now catches that, and — only for `power`, and only when the thrown error
  indicates nothing ever answered (a new `isReachabilityFailure` helper explicitly excludes
  `SonyBraviaApiError` and the "returned HTTP `<status>`" error, both of which mean the TV or the
  relay *did* respond, just with a real error) — falls back to the same Wake-on-LAN helper. This
  distinction matters here specifically because Sony's `power` doubles as power-off too: a wrong
  PSK or a genuine device-side rejection must still surface as a real error, not get silently
  swallowed into a misleading `success: true` "sent a WoL packet" response.

All three fallbacks share the same honest framing as the FCC-side sender: no acknowledgment exists
in this protocol, so "the packet was sent" is the return value, never "the TV turned on" — real
state is only confirmed once a normal `connect()`/`refreshState()` succeeds afterward.

## Consequences

- Closes the exact, previously-documented gap in `LgWebOsDriver.ts` and extends the same fix to
  Samsung and Sony for parity, since all three share the identical underlying limitation (their
  remote-control protocol requires the TV to already be reachable on the network).
- A device with no `hwaddr` on file yet (added by hand, IP-only, never seen by Family Command
  Center's discovery scan) gets a clear, actionable error instead of a silent no-op —
  "no known MAC address for Wake-on-LAN yet (it needs to have been seen on the network at least
  once)."
- Sony's `power` fallback is intentionally narrower than LG/Samsung's — it only engages on a
  genuine reachability failure, not any REST error, to avoid masking real configuration problems
  (e.g. a rejected PSK) as a false "success."
- No new native dependency on Hearth's side — `wakeOnLan.ts` is a plain `fetch` wrapper, fully
  OTA-shippable via `eas update`.
- Verified: `npx jest --silent` → 881/881 passing (including new coverage for all three drivers'
  Wake-on-LAN paths, both the success case with a saved MAC and the "no MAC known" failure case;
  Sony additionally covers the "real API error still surfaces normally" case). `npx tsc --noEmit`
  clean.
- **Not yet verified against a TV that is genuinely, fully powered off** — today's live test
  (FCC-side, cited above) sent a real WoL packet successfully, but the LG TV it targeted was
  already on at the time. Confirming an actual off→on wake, on real hardware, is Sean's next test
  once this ships.
