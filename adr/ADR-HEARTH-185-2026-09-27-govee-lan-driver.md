# ADR-HEARTH-185: Govee LAN-Control light driver

**Date:** 2026-09-27
**Status:** Accepted. Not yet exercised against real Govee hardware (none was on the LAN when built).

## Context

ADR-HEARTH-158 (roadmap) lists Govee as a Tier 3 native driver. This adds on/off, brightness and RGB
color for Govee lights that support Govee's **official local LAN Control API** (not the cloud
API/account) — scoped to models that actually speak it (H6xxx typically, per Govee's own LAN API
docs) and that have "LAN Control" turned on per-device in the Govee Home app. Hearth cannot turn that
setting on remotely, so the setup hint in `brandRegistry.ts` says so explicitly. A model that only
supports Govee's cloud API (account + API key) is out of scope entirely.

### A note on this task's own premise
The task that started this work named `src/drivers/lighting/wiz` as "the closest template" and asked
to check whether Family Command Center routes it through "a dedicated Pi route or a generic UDP
relay." **No Wiz driver exists on this repo's `main`** (confirmed: `git log --all` finds it only on
an unmerged sibling branch, `feat(drivers): Vizio SmartCast, Wiz, LIFX and Shelly drivers
(ADR-HEARTH-165)`, commit `6bf0a89` on `worktree-agent-af0ae0bfeb6dc6468`, not in `main`'s history).
The Pi (family-command-center) side of that same work **is** merged and deployed (adr/0198: Vizio,
Wiz, LIFX routes) — so the Pi is ahead of this app repo for those three brands.

This driver was built directly against Kasa (`KasaPlugDriver`/`KasaClient.ts`), the actual driver on
`main` closest to Govee's shape (FCC-proxied, no persistent socket, self-healing IP). The unmerged
Wiz/LIFX branch also introduced a shared `PerRequestDriver` base class and a `colorConversion.ts`
hue/saturation<->RGB helper that materially overlap with this driver's own state-machine and color
code. Deliberately **not** merged into this change (out of scope for "add a Govee brand," and
importing files from an unmerged sibling branch risks a conflicting reconciliation once ADR-165
itself lands) — `GoveeColor.ts` duplicates that conversion math standalone instead. **Flagging for
Sean:** once ADR-HEARTH-165 merges to `main`, `GoveeLightDriver` should likely be refactored onto the
shared `PerRequestDriver` base (dropping its own copy of the reconnect/generation/self-heal
machinery) and `GoveeColor.ts` folded into the shared `colorConversion.ts`, the same way Wiz/LIFX
already do.

## Protocol (source-verified, not guessed)

Fetched and confirmed 2026-09-27 against:
- https://gist.github.com/mtwilliams5/08ae4782063b57a9b430069044f443f6 (primary: exact JSON shapes)
- https://github.com/wez/govee2mqtt/blob/main/docs/LAN.md (corroborates the port scheme)
- community.govee.com, "Mastering the LAN API Series: LAN API 101" (Govee's own community post,
  corroborates ports/commands via search summary; page itself did not render for direct fetch)
- govee-lan-hass's README (confirms turn/brightness/colorwc have no acknowledgement — "doesn't
  perform immediate read-after-write of the device state after controlling a device")

Devices multicast-scan-discoverable on **UDP 4001**, take `{"msg":{"cmd":...,"data":...}}` commands
on **UDP 4003**, and reply — only `devStatus` has a documented reply — on **UDP 4002**, always,
regardless of the request's own source port (this is why the Pi needed a new exchange helper rather
than reusing Wiz/LIFX's; see adr/0204 on the Pi for the full writeup).

## Decisions

- **Capabilities:** `power`, `setBrightness`, `setColor` — the same three HueLightDriver already
  declares. `setColor` takes the same universal hue (0-360) / saturation (0-100, full value) as Hue,
  converted to 0-255 RGB by `GoveeColor.ts`; colour-temperature mode is out of scope (the Pi's
  `govee/color` route hardcodes `colorTemInKelvin: 0`, never caller-supplied).
- **Routed through Family Command Center**, same proxy shape as Kasa: Expo Go has no raw UDP socket
  module, so `GoveeClient.ts` calls four dedicated Pi routes (`govee/status` GET, `govee/turn`,
  `govee/brightness`, `govee/color` POST) rather than speaking UDP directly.
- **Every write is followed by a status read-back.** Govee's `turn`/`brightness`/`colorwc` have no
  acknowledgement, so `executeCommand` always calls `getStatus` after sending a command — both to
  report the light's real confirmed state (never assumed) and because that read-back is the *only*
  signal this integration has for "no local reply." The Pi's `govee/status` route surfaces that as a
  specific message ("check that LAN Control is turned on... or it may only support Govee's cloud
  API"), passed straight through by `GoveeClient.getStatus` rather than replaced with a generic
  timeout — satisfying the requirement that a missing local reply never look like a plain network
  timeout.
- **Self-healing IP** via `findCurrentIpByMac`/`findCurrentIpByName`/`findMacByIp`, identical to
  `KasaPlugDriver.ts` (ADR-HEARTH-126) — not the newer `findCurrentIpByIdentity` (TV-socket drivers
  only today), to match the actual precedent for this driver's shape.
- **Discovery:** `brandRegistry.ts` gets a `govee` `BrandEntry` (`ip-only`, `needsFcc: false` —
  matching Kasa's existing convention that this field gates the add/pairing flow, not whether the
  driver itself proxies through FCC at runtime), vendor pattern `/govee/i`. `deviceKind.ts`'s
  lighting pattern gets `govee` alongside `hue`/`lifx`/`nanoleaf`/`philips`. Govee's own multicast
  scan (port 4001) is not wired into any discovery pipeline — see adr/0204 on the Pi for why that's
  a separate, larger change.
- **Contract suite:** added to `DRIVER_ADAPTERS` (`adapters.ts`) with a Kasa-shaped fake responder.
  Passes the full shared contract suite with **zero exemptions** — no known behavioral gaps versus
  the connection contract every other driver is held to.

## Consequences / what's real vs. unverified
- **Verified:** `npx tsc --noEmit` and the full Jest suite pass (all Govee unit tests, the shared
  driver-contract suite's `GoveeLightDriver` cases, and `brandRegistry.test.ts`'s registry-consistency
  checks) on this branch. The Pi-side routes (adr/0204) are live and deployed; `401`/`403` verified
  against the running service.
- **Not verified:** no real Govee device was available on this network. The protocol, the LAN Control
  toggle requirement, and the "no ack for writes" behavior all come from the sources cited above, not
  from a real bulb.
- **Not done:** color-temperature mode, effects/scenes, multi-zone/segment control (none of these are
  part of Govee's basic LAN API for the models this driver targets), and Govee's own active multicast
  discovery (see above).

## Verification
- `npx tsc --noEmit`: clean.
- `npx jest --silent --testPathIgnorePatterns="node_modules"`: full suite green except the
  pre-existing, unrelated `runner/shims/shims.test.ts` `ws`/`WebSocketServer` failure (present before
  this change, not touched by it).
- `GoveeColor.test.ts`, `GoveeClient.test.ts`, `GoveeLightDriver.test.ts`: 26 tests, all passing,
  including the shared driver-contract suite's Govee cases.
