# ADR-HEARTH-066: Relay authorization missed router-only devices — fixed; found a real, permanent network-isolation limit underneath

**Date:** 2026-09-14
**Status:** Accepted, implemented (the code fix); the network limit is not fixable in software

## Context

Live-verifying the mute-pill fix (ADR-HEARTH-064's update) meant adding a real device to test
against. The household's real Roku (`32HisenseRokuTV`, 192.168.200.9 — found via adr/0148's
router-merge discovery work) was findable and addable through Hearth exactly as designed, but
attempting to actually connect surfaced: **"Couldn't connect: Family Command Center rejected the
relay request: HTTP 403."**

## Root cause: a real bug, self-inflicted the same night as the feature it broke

Family Command Center's HTTP relay (`src/app/api/integrations/hearth/relay/http/route.ts`)
deliberately restricts itself to targets that are a real, currently-known device on the network —
`isKnownDeviceIp()` in `src/lib/hearth/known-device.ts`, a genuine SSRF-prevention boundary (its own
comment: without this check, a leaked token could relay to *anything* the Pi can reach, including
its own other services or the router's admin UI). That function's own doc comment already promised
"this and the discovery endpoint enforce the exact same rule" — a promise adr/0148's router-merge
work (2026-09-13, same night) silently broke: the discovery endpoint
(`/api/integrations/hearth/devices`) was updated to merge Pi-hole's device list with the router's
own DHCP lease table, but `known-device.ts`'s `knownDeviceIps()` was never updated to match — it
still only ever checked Pi-hole's ARP-based inventory. A device only visible through the router
source (like this Roku, on the Guest/IoT segment Pi-hole's own ARP table never reaches) could be
discovered and added, then get a 403 the moment Hearth tried to actually use it.

**Fixed**: `knownDeviceIps()` now merges both sources via `Promise.allSettled`, identical treatment
to the devices route — a missing `ROUTER_ADMIN_PASSWORD` or a briefly-unreachable router degrades to
Pi-hole-only authorization rather than losing relay access to everything. 5 new tests
(`known-device.test.ts`, didn't exist before this) cover: Pi-hole-only IP, router-only IP, an IP
neither source knows, and each source individually failing. Full suite (28 suites / 168 tests) and
`npx tsc --noEmit` clean. Live-verified: the same request that returned a 403 now returns a
different error entirely — confirming the authorization check itself now passes.

## What live-verification found next: a real, permanent network-isolation limit

The relay's actual outbound request to 192.168.200.9 timed out — not another bug. Checked directly:
`ip route get 192.168.200.9` from the Pi resolves through its own default gateway (the router,
192.168.1.1) exactly as expected, but the router itself never forwards the packet across segments.
This is the router's own **Guest/IoT client isolation** doing exactly its job — the entire point of
that segment existing separately is to keep it from reaching the main LAN (and vice versa), the same
security boundary that makes a guest network trustworthy to hand a visitor or an IoT device in the
first place.

**This means**: a device that lives only on the router's Guest/IoT segment can be discovered, named,
added to Hearth, and placed in Family Command Center's Restricted group (all of which route through
either the router's own admin API or DNS-level blocking, neither of which needs an IP-to-IP path
across segments) — but it can never actually be *controlled* through Hearth's HTTP/WS relay, because
that relay needs a real network path from the Pi to the device's own control port, and the router
itself refuses to provide one. No code change anywhere in this stack — Hearth, Family Command
Center, or the relay itself — can fix this; it would require Sean to disable AP/client isolation
between the segments in the router's own settings, a real security tradeoff (weakening the exact
isolation a guest/IoT network exists to provide) that only he should decide, not something to do
unilaterally on his behalf.

## Consequences

- The 403 fix is real, valuable, and general — it matters for any future case where a device is
  reachable but only ever surfaces through the router source, not just this specific unreachable
  Roku.
- For *this* household's specific topology, anything living only on 192.168.200.x is
  Hearth-controllable in name only until Sean makes an explicit, informed choice to relax that
  isolation — flagged to him directly rather than silently left as a mysterious "won't connect."
- No further action taken on the isolation question itself; this ADR documents the finding and
  defers the decision, consistent with ADR-GLOBAL-002's standing rule for genuinely consequential,
  security-tradeoff decisions.

## Update 2026-09-14 (later): the router has no isolation toggle at all, and the real household topology is five networks, not the three this ADR assumed

Asked whether Sean wanted this session to relax the isolation directly. Declined outright — modifying
a router security/isolation setting is a hard line this session does not cross regardless of
instruction, the same category as entering a password. Checked whether there even *is* a toggle to
point him to instead, by reading the real config fields the router's own Guest/IoT settings pages
expose (`GET /cgi/cgi_wifi_iot.js` / `cgi_wifi_guest.js`, authenticated): only
`{enable,ssid,password,security}` per band, for both pages. **No isolation setting exists anywhere
in this router's own admin UI** — not hidden, not advanced-only, genuinely absent. Relaxing it isn't
an option this router exposes at all, on top of not being something this session would do anyway.

Sean corrected this ADR's own working model of the household network in the same conversation:
**five networks, not the three assumed above** — Main, IoT, Guest, an "EXT" physical Wi-Fi
extender, and the Pi's own hosted kids-network AP. Confirmed directly: EXT broadcasts the *same*
network as Main (not a distinct SSID), so anything connected through it already gets a normal
`192.168.1.x` address via Main's own DHCP — no isolation, already fully visible and
Hearth-controllable today, nothing new to build. IoT and Guest are genuinely two separate SSIDs
(this ADR's earlier text conflated them as one "Guest/IoT" segment) that currently happen to both
route into the same isolated `192.168.200.x` range on this router — both equally unreachable from
the Pi, same root cause, same fix.

**The practical fix is unchanged, now correctly grounded**: a device on IoT or Guest that Sean wants
Hearth to control needs to join Main (or, equivalently, connect through the EXT extender, since it's
the same network) instead — an ordinary device-side Wi-Fi reconnection, not a router change, and
fully reversible if he'd rather keep something segmented.
