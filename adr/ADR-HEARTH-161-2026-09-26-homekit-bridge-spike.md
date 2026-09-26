# ADR-HEARTH-161: HomeKit bridge spike (Homebridge + LG webOS plugin on the Pi)
Date: 2026-09-26
Status: Draft, spike only. Sean approved the spike on 2026-09-26. Nothing is a systemd unit.

## Context
Research concluded: HomeKit only via HAP, not Matter (Apple Home does not support TV/speaker/video-player Matter device types). Goal: Siri / Control Center / Remote widget control of household TVs without opening Hearth.

## What was built (Pi, `~/homebridge-spike/`, nothing in any repo)
- Node 22.23.2, npm prefix `~/homebridge-spike/npm-global` (no sudo). Homebridge 2.4.0 (HAP-NodeJS 2.2.2) + homebridge-lgwebos-tv 4.5.5.
- Config: bridge "Hearth Spike", port 51826, bind wlan0 only (not ap0), random PIN. Plugin: LG 75UN7370PUE (webOS 5.0, fw 04.64.00) at 192.168.1.218, displayType 1 (Television), sslWebSocket true, inputs from device, volume displayType 3 (TV speaker).
- Plugin pairing with the TV worked in the run (an Allow was accepted on the TV; key saved under `data/lgwebosTv/`).
- The plugin publishes the TV as an EXTERNAL accessory (its own HAP server, random port, own pairing, same PIN). So Sean pairs the TV accessory directly; the empty bridge is not needed.
- mDNS verified: both `_hap._tcp` records seen via a raw multicast query (avahi-browse is not installed). avahi-daemon active; Homebridge's ciao responder coexists on 5353.
- Prototype: `hap-nodejs-prototype/tv.js`, a HAP-NodeJS Television (Active, RemoteKey, TelevisionSpeaker) that POSTs to the runner `/execute`. Syntax-checked only; capability names other than powerOn/volumeUp are unverified against the runner. Not run against the TV.

## Findings
1. The LG TV itself already advertises `_hap._tcp` ("LG webOS TV 5683", unpaired, sf=1): webOS 5 has NATIVE HomeKit. Adding it directly in Apple Home needs no Pi, no bridge, no plugin, and survives the Pi being down. Its feature set is limited (power, input, AirPlay; no Hearth-only features) and it is un-tested here. The plugin's `disableTvService` exists to avoid duplicating it.
2. Homebridge route works technically: TV appears with power, inputs, speaker; volume only through hardware buttons in the Remote widget (HomeKit limitation; Siri cannot set volume or input).
3. Per-TV external accessory means each TV is a separate pairing (fine, avoids the TV-inside-a-bridge rejection).
4. Only LG has a mature plugin among the household TVs; Sony/Samsung/Roku each need their own plugin or the custom route.

## Risks
- Second HAP accessory on a random port; no firewall on the Pi (ufw/nft absent), so reachability is fine on wlan0, but the port changes only if persist data is deleted.
- Kids' network (ap0, 10.20.30.0/24) cannot see mDNS from the LAN; a reflector would be needed (not built, not touching hostapd/NetworkManager per adr/0183).
- Home hub (Apple TV) required for remote access and automations.
- The Pi is a single point of failure for the Homebridge route; native LG HomeKit is not.
- Homebridge runs with the TV pairing key in `data/lgwebosTv/` (keep out of backups/repos).
- Prototype route duplicates what Hearth's runner does; production would need runner auth (loopback unauthenticated).

## Decision (proposed, pending Sean's phone test)
- Try native LG HomeKit first for LG TVs; use Homebridge only where native is missing or too limited.
- Keep custom HAP-NodeJS + runner as the option if Hearth-specific commands (Activities, scenes) must surface in Home.
- No systemd unit until Sean pairs and approves; then a new `homekit-spike.service` (own unit, no changes to existing services).

## Stop
`kill $(cat ~/homebridge-spike/homebridge.pid)`; delete `~/homebridge-spike/data/persist` to reset pairing. Then unpair in Home app.
