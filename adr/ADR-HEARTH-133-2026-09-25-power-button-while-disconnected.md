# ADR-HEARTH-133: Wake buttons must work while a device is disconnected

**Date:** 2026-09-25
**Status:** Accepted, implemented; wake path verified from the Pi, not yet from the phone

## Context

Sean: "connection still isn't persistent and i cannot turn the devices on when they are off."
Checked with the TVs actually off (neither answered ping): a Wake-on-LAN sent from the Pi woke the
LG within 12 seconds, so the network path works. The Den TV (Sony) did not wake; that is the TV's own
Remote Start / network-standby setting, not the app.

Causes found in the app and Pi, all fixed or noted:
1. The Sony/Samsung single `power` button was still `disabled={controlsDisabled}`, the same defect
   ADR-HEARTH-127 fixed for LG's power-on button, though their drivers already fall back to Wake-on-LAN
   when the TV is unreachable.
2. A disconnected device keeps its last state, so an LG that dropped while "on" showed "On", and the
   merged power button then chose `powerOff` and stayed disabled. `knownPower` is now unknown
   whenever the device is not connected.
3. Family Command Center's LAN rate-limit bucket (fixed, FCC adr/0186) and the stopped WebSocket
   relays (restarted; deploy gotcha recorded) made connections and wakes fail all afternoon.

## Consequences

- Any Sony/Samsung/LG power press works with the TV off, provided the MAC is known and the TV
  supports Wake-on-LAN. Wi-Fi-only TVs often need the Remote Start / "Turn on via Wi-Fi" TV setting.
- The status pill no longer claims "On" for a disconnected device.
