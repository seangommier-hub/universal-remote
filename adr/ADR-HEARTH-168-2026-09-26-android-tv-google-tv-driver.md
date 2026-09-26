# ADR-HEARTH-168: Google TV / Android TV driver over Android TV Remote v2, relayed by the Pi

**Date:** 2026-09-26
**Status:** Accepted and built. Not exercised against real Android TV hardware (none was on the LAN).

## Context

ADR-HEARTH-158 (Tier 3) ranks Google TV / Android TV as the next native driver after Home Assistant, and rules out
Fire TV over ADB as fragile (ADR-HEARTH-048). Google TV, Chromecast with Google TV, Nvidia Shield and Sony/TCL/Hisense
Google TVs, and Fire TV models that run the service, speak the Android TV Remote v2 protocol (TLS ports 6466/6467, a
6-character on-screen pairing code). The maintained implementation is the python package `androidtvremote2`. React Native
has no mature client for it, so the Pi does the protocol work, exactly as it does for Apple TV (pyatv) and PS5 (playactor).

## Decisions

1. **Pi-proxied CLI driver, modeled on the Apple TV driver.** `src/drivers/tv/androidtv/` holds `AndroidTvClient.ts`
   (Pi relay client), `androidTvKeys.ts` (capability-to-key table and declared capabilities) and `AndroidTvDriver.ts`.
   Pi side (Family Command Center adr/0197): a python bridge in a venv with routes `androidtv/pair/start`, `pair/finish`,
   `command`, `status`, all behind `requireKnownDevice` (adr/0196) and a strict allowlist.
2. **The certificate never reaches the app.** The Pi stores the client certificate in `~/.config/hearth-androidtv`
   (mode 700, files 600), outside git. `device.config` holds only `ipAddress` and `hwaddr`.
3. **Honest capabilities:** power, volumeUp, volumeDown, mute, directionalNavigation, select, home, back, playPause,
   launchApp (netflix, hulu, primeVideo, youtube by service name, or any Android package id via `appId`), textEntry.
   Not declared: setVolume (Remote v2 has only volume keys), setChannel, inputSelection, menu, channel keys (no
   dependable meaning on a streamer). textEntry depends on the TV's own keyboard focus and is unverified.
4. **Power.** Read real state first; press POWER only when needed (the key toggles). A TV that refuses the connection
   is treated as fully off: send Wake-on-LAN to the `hwaddr` saved at pairing (else looked up by IP) and start the
   shared wake burst (ADR-HEARTH-144) with the `waking` value (ADR-164). WoL only works when the TV's Wake on LAN /
   Wake on Cast setting is on; the setup checklist says so, and some models cannot be woken over Wi-Fi at all.
5. **Reliability conventions.** Backoff with jitter (2s doubling to 30s), self-heal a moved TV by MAC then name (with MAC
   backfill), in-flight connect de-duplication, generation counters so a late result after `disconnect` is dropped,
   bounded request timeouts (16s for status/keys, 30s for pairing). A failed key press marks the TV disconnected and
   starts the backoff loop. A `409 not_paired` from the Pi sets `values.pairingRequired`, marks the TV disconnected and is
   NOT retried (retrying cannot fix it).
6. **Guided pairing reuses `PairingSession` (ADR-155).** `AddAndroidTvDeviceScreen` has three stages: address, code, and
   a time-boxed confirmation. `androidTvPairing.ts` holds the pure steps (code normalisation to 6 hex characters;
   finish, build the device with the TV's own lower-case colon MAC, connect to prove control). Copy for a wrong code,
   an expired session and an unreachable TV lives in `pairingCopy.ts`.
7. **Discovery.** New brand `androidtv` ("Google TV / Android TV", `custom-screen`, needs the Pi). The Pi recognizes
   `_androidtvremote2._tcp` over mDNS as a certain signal and it beats `_googlecast._tcp`, so a Chromecast with Google TV
   becomes an Add row for this brand instead of the volume-only Chromecast driver. The vendor-text pattern matches only
   "Android TV", "Google TV" and Shield names so an Android phone's `android-...` hostname is not mistaken for a TV.
8. **Contract suite.** `AndroidTvDriver` has an adapter in `src/drivers/contract/adapters.ts` with no exemptions.

## Verified vs not verified

- Verified: app tsc clean; jest for the driver, client, pairing steps, copy, registry, discovery rows, request timeouts and
  the shared driver contract suite (the only failing suite, `runner/shims/shims.test.ts`, is a `ws` mismatch in the
  shared node_modules junction and does not touch this work). On the Pi: tsc and the full vitest suite pass; the bridge's
  error paths and directory/file permissions were checked; the deployed routes answer 401 / 403 / 400 / 404 / 502 as
  designed, including a real Node-to-Python round trip that returned a structured timeout for the Sony TV on the LAN.
- Not verified: mDNS discovery of an Android TV (the Pi saw no `_androidtvremote2._tcp` or Cast responders), pairing,
  keys, app launch, text entry, status, Wake-on-LAN and the on-device screen, because no Google TV / Android TV was on
  the network. First real TV will exercise all of these; expect small fixes (MAC format, current-app naming, launch links).

## Consequences

- Each call is a fresh 1 to 2 s connection on the Pi (no subscription), the same latency profile as Apple TV.
- Pair codes expire with the Pi session after two minutes; the screen's Try again restarts pairing for a fresh code.
- Fire TV works only on models that advertise the Remote v2 service; ADR-048's ADB conclusion still stands for the rest.
