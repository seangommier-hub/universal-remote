# ADR-HEARTH-158: Roadmap distilled from the 2026-09-26 research round

**Date:** 2026-09-26
**Status:** Proposed. Items marked DECISION need Sean's answer before work starts.

## Context

Sean asked for deep research on similar apps and where Hearth can improve. Eleven read-only research
agents covered: remote-app competitors, smart-home platforms, iOS native surfaces, connection
reliability, remote-access security, customer voice, UI verification, distribution, a HomeKit bridge,
device coverage, and iOS background behavior. Their reports are the source; claims are cited there.

## Ranked plan

**Tier 1: fix pain that already exists**
1. **TestFlight for the family** (DECISION). Removes UDID registration, rebuilds and the USB/Trust ordeal.
   New person: accept an emailed invite, install TestFlight, tap Install. JS updates still ship OTA on
   one channel. Builds expire after 90 days. Needs a family build profile that keeps the Feeder tab
   (production hides it), Leah as an App Store Connect user, and a migration through Share mine/Load shared.
2. **Web UI verification harness** (in progress, ADR-HEARTH-157). Lets layout claims be checked by looking.
3. **Connection architecture:** Pi holds all device connections; the phone keeps one disposable socket to
   the Pi, races LAN against tunnel, paints cached state instantly, queues taps for ~5s. Migrate one
   brand at a time starting with LG; keep phone-direct as fallback. Needs a keepalive under Cloudflare's
   100s idle limit and per-phone credentials.
4. **Wake reliability:** send WoL as several packets (broadcast and unicast), poll then connect, show a
   "Waking" state; per-brand settings guidance (done in ADR-154).
5. Fix remaining contract-suite bugs (relay-only memory that never recovers, SwitchBot timeout, driver
   retry gaps).

**Tier 2: features competitors prove people want**
6. **Apple Home via a HomeKit bridge on the Pi** (DECISION, 1-week spike). Gives Siri, Control Center,
   lock screen, Watch, and Apple Home automations with no phone update. Siri can only do on/off and
   scenes for TVs; not Matter (Apple Home does not support TV device types).
7. **Activities on the Pi** with schedules and "Bedtime Guard" kid schedules: needs the headless runner
   promoted (6-9 working days) and power-state read-back.
8. **Keep-awake while the remote is open**, live connection pill with one-tap reconnect, VoiceOver and
   Dynamic Type audit, touchpad mode, favorites.
9. **Per-phone tokens and roles** (owner/member/guest, lost-phone revoke, audit log). Phases P0-P3 from the
   security research; the single shared token is the biggest current risk.

**Tier 3: reach**
10. **Home Assistant driver** (one driver unlocks HA's integrations), then native drivers in order:
    Google TV/Android TV, Vizio, Wiz, Shelly, Govee; Fire TV via HA (ADB is fragile, ADR-048).
11. iOS widgets/App Intents/Control Center as one bundled native build (only if the HomeKit route is not
    enough); geofencing and Watch deferred.

## Explicitly not doing now
Matter for TVs; Apple Watch app; geofencing on the phone; Cloudflare Access mTLS on iOS; Fire TV native ADB.

## Consequences
The first two DECISIONs (TestFlight, HomeKit spike) are independent and cheap to start.
