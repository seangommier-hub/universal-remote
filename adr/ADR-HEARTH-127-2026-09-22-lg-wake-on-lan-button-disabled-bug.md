# ADR-HEARTH-127: Fix the LG power button being disabled exactly when Wake-on-LAN was needed

**Date:** 2026-09-22
**Status:** Accepted, implemented, tested

## Context

Sean: "lg still not having wake up functionality." ADR-HEARTH-102 already built a real
Wake-on-LAN path for LG (`LgWebOsDriver.executeWakeOnLan`, relayed through Family Command Center's
own multi-interface magic-packet sender, ADR-HEARTH-110/live-fixed 2026-09-20) specifically because
a fully-off TV has no SSAP socket to be "connected" through. That server-side path was re-verified
this session — `family-command-center`'s `wake-on-lan` route and its underlying `sendWakeOnLan()`
are both intact and correct (broadcasts on every real interface, not just the OS default route).

The actual bug was in the UI, not the network layer: `UniversalTvRemote.tsx`'s merged power button
(`hasSeparatePowerOnOff`, LG only) had `disabled={controlsDisabled}`, where
`controlsDisabled = !isConnected`. A fully-off LG has no live socket, so `isConnected` is always
`false` in exactly the state a user needs to press "power on." `CapabilityButton`'s `disabled` prop
passes straight through to React Native's `Pressable`, which blocks `onPress` entirely — the button
was not merely styled as disabled, it was **structurally unable to fire** `send("powerOn")` at all.
Tapping it did nothing, with no error, no log line, nothing — indistinguishable from a dead button.

A second, related bug compounded this: the command-error banner (`commandError`, set whenever
`commandEngine.execute()` fails) was gated on `{isConnected && commandError}`. Even after fixing the
disabled state, any real failure from `executeWakeOnLan` — no known MAC address yet, Family Command
Center not configured — would still never be shown, since the device is disconnected by definition
during a wake attempt.

## Decision

1. The merged power button's `disabled` now only considers `controlsDisabled` when the next press
   would send `powerOff` (`knownPower === "on"`) — a real SSAP command that does need a live socket.
   When the next press would send `powerOn` (`knownPower` is `"off"` or unknown), the button is
   never disabled by connection state.
2. The standalone `powerOn`-only button (Xbox/PS5, also Wake-on-LAN) had the same
   `disabled={controlsDisabled}` bug and is now never gated on connection at all.
3. The `commandError` banner no longer requires `isConnected` — a failed `powerOn` attempt while
   disconnected is now visible instead of silently swallowed.

The standalone `powerOff`-only button (Roku) and the single `power`-toggle button (Sony/Samsung)
are unchanged — those are real commands over a live connection and correctly stay gated.

## Testing

No dedicated `UniversalTvRemote.tsx` test file exists in this project (consistent with the rest of
its UI-screen coverage — driver logic is unit-tested, screens are not). `npx tsc --noEmit` clean;
full suite 969/969 passing (unaffected — this change touches only UI gating, no driver code).
Server-side Wake-on-LAN path re-verified live: `family-command-center`'s `/api/integrations/hearth/wake-on-lan`
route and `sendWakeOnLan()` are unchanged and correct from ADR-HEARTH-110's live fix.

## Consequences

- The LG (and Xbox/PS5) power-on button now actually fires while the device is off, which is the
  entire reason ADR-HEARTH-102 built a separate Wake-on-LAN path in the first place.
- If a wake attempt still fails for a real reason (no MAC learned yet for this specific device, or
  Family Command Center not configured), that reason is now visible in the command-error banner
  instead of looking identical to "nothing happened" — the next real-hardware test will surface an
  actual error message rather than silence if there's still a downstream issue.
- Not yet re-verified against Sean's real, physically-off LG — the button being un-pressable was a
  sufficient, confirmed explanation (React Native's `Pressable` fully blocks `onPress` when
  `disabled`), but final confirmation needs a real device test.
