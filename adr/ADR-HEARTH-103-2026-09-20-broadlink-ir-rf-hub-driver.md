# ADR-HEARTH-103: Broadlink IR/RF hub driver — taught codes instead of a documented protocol

**Date:** 2026-09-20
**Status:** Accepted, implemented; not yet verified against real hardware

## Context

Sean asked to "keep improving, deploy every agent possible for research" — five parallel research
agents scoped the next round of device integrations (Apple TV, Vizio SmartCast, Nest/Ecobee
thermostats, August/Yale/Schlage smart locks, and a broad device-coverage survey), each judged
against this project's standing rule: never let Hearth/Family Command Center directly receive,
store, or forward a raw account password — an OAuth redirect (PS5's precedent) or a local
PIN/certificate pairing flow (LG/Samsung/Lutron's shape) are both fine.

The survey agent's top pick, which Sean then chose to build first: a **Broadlink RM-series IR/RF
hub**. Unlike every other candidate, it needs no account of any kind — it replays arbitrary
learned infrared/RF codes to whatever *dumb* hardware a household already owns (an old window AC,
a legacy TV/soundbar/receiver, a box fan), extending "universal remote" coverage beyond named
smart-home brands entirely.

Primary-source verification (mirroring the standard this session already applied to PS5/Apple TV):
`mjg59/python-broadlink` (1.5k GitHub stars, backs Home Assistant's own official Broadlink
integration) is the real, current, well-maintained library — it delegates the actual AES-128-CBC
device protocol to the `cryptography` package rather than rolling its own, satisfying this
project's "prefer well-established libraries for cryptography" rule the same way `playactor`
(PS5) and the recommended `pyatv` (Apple TV, research-only so far) do. Verified live on the Pi:
`pip3 install broadlink` succeeded, and its real API was inspected directly
(`broadlink.hello(ip)` → `.auth()` → `.enter_learning()`/`.check_data()`/`.send_data()`), not
assumed from documentation alone.

**A genuinely new fact, not present in any other driver here**: once a Broadlink hub is already on
the household WiFi (set up once via the official Broadlink/e-control app — out of scope for
Hearth), it has **no pairing/auth step at all**. Every single command re-runs `hello()` + `auth()`
fresh, entirely on the local network, with no PSK/client-key/token to capture, store, or ever
expire. This is architecturally simpler than every other paired driver in this project.

## Decision

**Family Command Center**: `scripts/broadlink/broadlink_cli.py`, a thin CLI wrapper (subcommands
`learn`/`send`) driving the real `broadlink` pip library as a managed subprocess — the same
"wrap a well-established library via subprocess" pattern `ps5-client.ts` already established for
`playactor`. `src/lib/network/broadlink-client.ts` spawns it and parses its JSON stdout/stderr.
Two new routes, `/api/integrations/hearth/broadlink/{learn,send}`, same
zod+isAuthorizedHearth+catchApiError shape as every other hearth/* route.

**Hearth**: `BroadlinkClient.ts` is a thin fetch wrapper (mirrors `Ps5Client.ts`).
`BroadlinkIrDriver.ts` is the first driver in this project with a genuinely **dynamic per-device
capability set** rather than a fixed one:

- A learned IR/RF code is a fixed, opaque blob with no parameters, so only **no-argument,
  single-press capabilities** are teachable in this version — `power`, `powerOn`, `powerOff`,
  `volumeUp`, `volumeDown`, `mute`, `channelUp`, `channelDown`, `playPause`, `select`, `back`,
  `home`, `menu` (`BROADLINK_TEACHABLE_CAPABILITIES`). Anything that takes a runtime argument
  (`directionalNavigation`'s direction, `setChannel`'s digit, `setVolume`'s level,
  `inputSelection`'s target, `textEntry`) doesn't fit this model and is out of scope for now.
- `getCapabilities()` (the driver-level "what can this ever support" list, per `DeviceDriver`'s
  own doc comment) returns that full teachable superset. A specific `Device`'s own `capabilities`
  field — already documented on `Device.ts` as "a subset [the driver] may support" and already the
  exact field `CommandEngine.ts` gates every command dispatch on — starts **empty** at add-time and
  grows one entry at a time as the household actually teaches each button. This is the first
  driver to make that "may support a subset" language literally, visibly true instead of every
  instance getting the same fixed list.
- `AddBroadlinkHubScreen.tsx` adds the hub by name + IP only (no pairing, no connect-time probe —
  same "nothing to verify without a real side effect" reasoning as Xbox/PS5). `capabilities: []` at
  creation.
- `TeachBroadlinkCommandScreen.tsx` (reachable from the device's long-press menu — "Teach
  commands," shown only for this driver) lists the teachable set, shows which are already learned,
  and on tapping one, calls `learnCode()`, shows "point the remote at the hub and press the button
  now," and on success stores the returned hex into `device.config.codes[capability]` and appends
  the capability to `device.capabilities`. Persisted after every single successful teach (a new
  `handleDeviceUpdatedInPlace` in App.tsx, distinct from `handleAddressUpdated`, since it must stay
  on the teach screen rather than navigating back to the device list — teaching several buttons in
  one sitting is the whole point).
- `executeCommand` looks up `device.config.codes[capability]`; a capability that hasn't been taught
  yet fails with a clear, specific error ("hasn't learned a code for X yet — teach it from the
  device's menu first") rather than sending garbage or silently no-opping.
- `UniversalTvRemote.tsx` needed **no changes at all** — it already gates every button on
  `device.capabilities.includes(capability)`, so a sparse, growing capability list renders exactly
  the buttons that have been taught, for free.

## Consequences

- Extends Hearth's real device coverage to arbitrary IR/RF hardware with zero cloud dependency and
  zero credential of any kind — the cleanest security posture of any driver in this project so far.
- Establishes a second, deliberately different driver shape (taught/dynamic capabilities vs. fixed
  protocol-derived ones) validated against `DeviceDriver`'s own interface contract, which already
  anticipated this ("a specific Device may support a subset") — not a new pattern bolted on, an
  existing one finally exercised for real.
- RF learning (`sweep_frequency`/`check_frequency`/`find_rf_packet`, only on `rm4pro`-class hubs,
  not `rmmini`) and argument-taking capabilities are explicitly out of scope for this version — a
  real, disclosed limitation, not an oversight.
- Verified end-to-end on Family Command Center against the real network stack (not yet a real
  Broadlink hub): `pip3 install broadlink` succeeded on the Pi; `npx tsc --noEmit` and `npm run
  build` both clean, both new routes present in the route table; a live `curl` against the running
  service returned a real, clean `{"error":"broadlink_cli.py timed out after 10s"}` for an
  unreachable dummy IP — confirming auth, validation, subprocess spawn, and error surfacing all
  work correctly through the whole stack.
- Hearth side: `npx jest --silent` → 890/890 passing (9 new tests across `BroadlinkClient.test.ts`
  and `BroadlinkIrDriver.test.ts`). `npx tsc --noEmit` clean. No native dependency added — fully
  OTA-shippable via `eas update`.
- **Not yet verified against a real Broadlink hub or real learned IR/RF codes** — pending Sean
  actually owning and adding one. The `learn` timeout (20s), the AES handshake, and the exact
  `check_data()`/`send_data()` byte format are all taken from `python-broadlink`'s own source, not
  independently re-derived, consistent with this project's "prefer well-established libraries"
  rule — but a first real learn/send cycle against physical hardware is the honest remaining gap,
  same caveat already carried by Sonos/Denon/Chromecast.
