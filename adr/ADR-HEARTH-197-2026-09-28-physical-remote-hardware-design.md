# ADR-HEARTH-197: Physical remote with IR — hardware, firmware, and integration design

**Date:** 2026-09-28
**Status:** Proposed — design only, no code written. Six open questions for Sean block Phase 1 start (see bottom).

## Context

Sean: "start to think about a physical remote with ir sensors [that] uses the same software and
the design for that." This is read-only research plus a design ADR — no application or firmware
code was written, and nothing was purchased.

**What already exists that this design must not duplicate or contradict:**
- Hearth already has an IR path: `BroadlinkIrDriver` (ADR-HEARTH-103) teaches and replays IR/RF
  codes through a Broadlink RM-series hub, via the Pi's `/api/integrations/hearth/broadlink/{learn,send}`
  routes (family-command-center adr/0178). It uses `mjg59/python-broadlink` as a subprocess, needs
  no credential at all, and stores each taught code as a hex blob in `device.config.codes[capability]`
  — capabilities are **taught one at a time**, not a fixed list (`hasDynamicCapabilities`, `DeviceDriver.ts`).
  Only no-argument, single-press capabilities are teachable today: `power`, `powerOn`, `powerOff`,
  `volumeUp`, `volumeDown`, `mute`, `channelUp`, `channelDown`, `playPause`/`selectPlayPause`,
  `select`, `back`, `home`, `menu` (`BROADLINK_TEACHABLE_CAPABILITIES`).
- The Pi already holds all real device connections; the phone keeps one disposable socket to the
  Pi, races LAN against tunnel, paints cached state instantly, and **queues taps for ~5s** rather
  than dead-ending on a dropped connection (ADR-HEARTH-158, tier 1 item 3 — in progress). Today's
  ADR-HEARTH-196 hardened exactly this class of reconnect/persistence gap (unhandled
  `loadFamilyCommandCenterConfig()` rejections). Memory note `feedback_remote_should_feel_natural.md`:
  "Hearth's connection/retry UX must persist indefinitely, never dead-end on a timeout, be purely
  on-demand like a real remote" — that standard applies to this remote too, arguably more literally
  than to the phone app.
- Every `hearth/*` route on the Pi that takes a caller-supplied address is gated by
  `requireKnownDevice(ip)` (family-command-center adr/0196); every route needs a bearer token
  (`isAuthorizedHearth`). ADR-HEARTH-196 (Hearth side) flagged the single shared `HEARTH_API_TOKEN`
  as "the biggest current risk" and ADR-HEARTH-181/189 already moved phones to **per-phone tokens**
  issued at `pair/redeem` (FCC adr/0203) instead of one shared secret. A new physical remote should
  launch directly into that model, not repeat the shared-token mistake for a third client type.
- `selectPlayPause` (ADR-HEARTH-139) is the real capability id for "play, pause and select all on
  the one center button" — LG cannot report play/pause separately from select, so the UI already
  merges them into one button (`UniversalTvRemote.tsx`).
- Brands are described in exactly one place, `discovery/brandRegistry.ts` (ADR-HEARTH-148): a
  `BrandId`, a `BrandAddMode` (`"ip-only" | "inline-fields" | "custom-screen"`), and a driver.
  `"feeder"` and `"broadlink"` are both `"custom-screen"` brands today — a new remote brand follows
  that exact precedent.
- Sean already owns real, relevant hardware from the squirrel-feeder project (personal project,
  `seangommier@gmail.com` identity — kept separate from this professional Hearth work per the
  professional/personal ADR; the remote itself is a Hearth/household tool and stays on the work
  identity for any accounts it needs): an ELEGOO ESP32 kit that, per that project's own
  `adr/0004`, ships **an IR receiver module and an IR emitter module** (misidentified early on as an
  "LED indicator," corrected by reading ELEGOO's own packing list) — both currently unused. He also
  has 3x18650 cells + a Waveshare Solar Power Manager (D), a spare MG90S servo, Dupont jumpers, and a
  Flashforge AD5X 3D printer already in active use (see `reference_shared_ad5x_coordination_protocol.md`).

## 1. Why a physical remote, and what it is for

Three distinct jobs, not one:

1. **Control legacy IR-only devices Hearth cannot reach at all today.** Hearth's drivers all assume
   a LAN API (WebSocket/REST) or a cloud account. A device with no such surface — an old
   TV/receiver/soundbar with only an IR eye — is invisible to Hearth *unless* a Broadlink hub has
   already learned its codes. A physical remote with its own IR emitter is a second way to reach
   that same class of device, and (per the household-labels/room work, ADR-HEARTH-173) a way to
   reach it from a room that doesn't have a Broadlink hub sitting in it.
2. **One-hand physical buttons for the highest-frequency actions** — power, volume, mute, d-pad,
   `selectPlayPause` — without unlocking a phone, opening Hearth, and finding the right device
   card. This is the actual reason people still buy dedicated remotes even when they own a
   smart-remote app: latency and hand-feel, not missing features.
3. **A fallback control path when the phone isn't in hand, or the network/app is down.** This only
   works if the highest-value buttons (IR blast to the legacy TV, specifically) do **not** depend on
   the Pi being reachable — see Section 3's local-first IR argument.

## 2. Hardware research

### Reference design that already exists and works: OMOTE

**OMOTE** (CoretechR, open source, [github.com/CoretechR/OMOTE](https://github.com/CoretechR/OMOTE),
via Hackaday.io) is a real, currently-maintained DIY universal remote that is almost exactly this
project's hardware shape: ESP32-PICO-D4, a 2.8" capacitive touchscreen (320x240, LVGL UI), an IR LED
+ TSSP77038 IR receiver, a LIS3DH accelerometer (wake-on-lift), a 2000 mAh LiPo rated for ~6 months
between charges, WiFi + Bluetooth + IR, and a 3D-printed case with published STL files. It proves
every piece of this design is buildable by one person with normal tools — Sean doesn't need to
design the RF/IR front end from scratch; OMOTE's schematic and firmware are a legitimate starting
reference (not a copy target for Hearth's own Pi-integration logic, which is unique to this
household's architecture).

Hearth's remote is simpler than OMOTE in one respect (no touchscreen needed — physical buttons plus
an optional trackpad area) and more integrated in another (it talks to the Pi's existing
device/Activity model instead of driving IR standalone).

### Microcontroller: ESP32-S3, dev board first

| Option | Price (2026, 1-unit) | Notes |
|---|---|---|
| **Adafruit ESP32-S3 Feather** (4MB/2MB PSRAM, STEMMA QT), [adafruit.com/product/5477](https://www.adafruit.com/product/5477) / 8MB variant [product/5323](https://www.adafruit.com/product/5323) | **$17.50** (10+: $15.75) | Recommended for Phase 1. Dual-core 240MHz, WiFi + BLE, USB-C, **built-in LiPo charging circuit and MAX17048 battery-fuel-gauge chip already on the board** — removes a whole BOM line (no separate TP4056 needed for the dev-board phase). STEMMA QT connector makes adding the AT42QT1070 trackpad or TSOP38238 trivial (no soldering to breadboard rails). |
| Adafruit QT Py ESP32-C3 ([product/5405](https://www.adafruit.com/product/5405)) | ~$7-9 | Smaller/cheaper, single-core RISC-V. Fine for Phase 1 button-only logic; tighter for IR timing-critical code plus a trackpad driver plus WiFi at once — keep as a cost-down option for Phase 2 once firmware size/timing is known, not a Phase 1 default. |
| Bare ESP32-S3-WROOM module + custom PCB | ~$3-5 in module cost alone, **but** requires a PCB design/fab cycle (JLCPCB et al., 1-2 week turnaround, $2-10/board in small qty) plus its own USB-serial and power circuitry that the Feather already gives for free | **Not recommended before Phase 2 is proven.** A custom PCB is the right move once the button/trackpad layout is final and Sean wants a real enclosure fit, not before — exactly the same "prototype on a breadboard before optimizing" order the squirrel feeder itself followed (breadboard phases 1-6, power/enclosure deferred to last). |

**Recommendation:** Adafruit ESP32-S3 Feather for both phases. A custom PCB is a legitimate Phase 3
(post-Phase-2) step once the button/trackpad geometry is locked, not before.

### IR transmitter (send/blast)

- **IR LED**, 940nm, e.g. Adafruit's own 940nm 5mm IR LED ([product #388](https://www.digikey.com/en/products/detail/adafruit-industries-llc/388/17039167), ~$0.50) or Broadcom HR5P-N4CA-00000 (~$0.30-0.93 depending on volume, DigiKey). **Sean already owns an ELEGOO IR emitter module** from the squirrel-feeder kit (`adr/0004` in that project) — start with that at zero incremental cost, swap to a driven discrete LED only if range/angle proves insufficient.
- **Driver transistor**: a bare GPIO cannot push the current a usable IR blast needs (Broadlink/Flirc-style designs all drive the IR LED through a small NPN switching transistor, not directly off the MCU pin). A 2N3904 (~$0.05-0.15 in any real quantity, DigiKey/any distributor) or 2N2222 is the standard, well-documented choice — same "well-established part, don't roll your own" reasoning this project already applies to crypto libraries.
- This mirrors exactly what `python-broadlink` (ADR-HEARTH-103's dependency) drives on the Broadlink hub side of the existing integration — same waveform shape (38kHz carrier, on/off timing), different transmitting hardware.

### IR receiver (learn)

- **TSOP38238** (Vishay, 38kHz demodulating IR receiver), **$0.84** at DigiKey ([product detail](https://www.digikey.com/en/products/detail/vishay-semiconductor-opto-division/TSOP38238/1681362)), the same class of part OMOTE uses (TSSP77038) and the same demodulation Broadlink's own hub performs before its AES-wrapped IR blob ever reaches `python-broadlink`. **Sean already owns an ELEGOO IR receiver module** (same `adr/0004` kit) — again, zero incremental cost for Phase 1/2 learning if that part is a compatible carrier frequency, which the ELEGOO kit's use case (with its own IR remote) strongly suggests it is; confirm the exact part number silkscreened on it before assuming pin-compatibility with a bare TSOP.

### Buttons, d-pad, and trackpad

- **Discrete tactile buttons**, not a scanned matrix, for Phase 1's ~10 buttons (power, vol+/-,
  mute, 4-way d-pad, `selectPlayPause`, back, home) — an ESP32-S3 Feather has more than enough GPIO
  for 10 direct-wired buttons with internal pull-ups; a button matrix only earns its complexity past
  roughly 16 buttons, and this remote's whole design goal (per the task) is a small, high-value
  button set, not a full IR-remote button wall.
- **Capacitive touch for a trackpad mode**, mirroring `CommandCenterRemoteScreen`'s existing
  touchpad-mode concept: Adafruit's **AT42QT1070** 5-pad breakout ([product/1362](https://www.adafruit.com/product/1362)), **$7.50**, standalone mode (no I2C needed, though an I2C variant — MPR121, [product/1982](https://www.adafruit.com/product/1982), $7.95 — gives more pads and richer gesture data over the same STEMMA QT bus the Feather already exposes if 5 pads prove too coarse for swipe gestures). A true X/Y relative-position PS/2 trackpad module ([product/837](https://www.adafruit.com/product/837)) exists but is a heavier integration (PS/2 protocol bit-banging) for a feature phase 2 could ship with discrete swipe zones instead — recommend starting with MPR121/AT42QT1070 discrete zones (up/down/left/right/center swipe regions), not a full mouse-style trackpad, unless Phase 2 usage shows that's not enough.

### Battery

| Option | Cost | Tradeoff |
|---|---|---|
| **LiPo + the Feather's built-in charge circuit** (e.g. Adafruit 3.7V 500mAh, [product/1578](https://www.adafruit.com/product/1578), **$7.95**) | ~$8 | Simplest — the Feather already has the charge IC and fuel gauge on-board, so this is a JST-plug-and-go battery with **zero extra parts**. Rechargeable via the same USB-C port used for flashing. Recommended default. |
| **3x18650 + Waveshare Solar Power Manager (D)**, reusing the exact bundle Sean already owns from the squirrel feeder | $0 incremental (already owned) | Much higher capacity than a remote needs (this bundle was sized for an outdoor, solar-charged feeder, not a handheld); physically bulky for something meant to sit in a hand — better suited to a *charging dock/cradle* for the remote (dock draws off household power to top up a smaller internal LiPo) than to living inside the remote's own shell. Worth reusing the Manager D board for a dock, not for the handheld's own battery. |
| **2x AAA, no charging** | ~$2-4 for a holder + user supplies batteries | Simplest possible build (no charge circuit, no LiPo safety handling), but no rechargeability — a real regression from "acts like the TV remote you already own," most of which are AA/AAA but don't need daily handling the way a phone-replacement device does. Reasonable **Phase 1** shortcut if Sean wants to defer the battery/enclosure question entirely and just prove the software loop on USB power first (see Phase 1 below — no battery at all, USB-tethered, is the actual cheapest and fastest starting point). |

**Recommendation:** Phase 1 skips batteries entirely (USB power on a desk, exactly like the squirrel
feeder's own Phase 1-2). Phase 2 uses the Feather's built-in LiPo charge circuit with a small
(500mAh-1000mAh) LiPo — reuse the 18650/Solar Manager D bundle only if Sean wants a charging dock,
not as the handheld's internal cell.

### Enclosure

- **3D-printed on the AD5X** (Sean's existing printer): matches this household's established
  workflow, gives full control over the exact button/trackpad layout this remote actually needs
  (no off-the-shelf shell will have the right cutouts), and OMOTE's own STLs are a legitimate
  starting geometry to modify rather than designing a handheld ergonomic shape from zero. Cost is
  filament only (a remote-sized shell is well under $1-2 of PLA) plus print time — genuinely free
  given the printer and the existing multi-session AD5X print-queue coordination protocol already
  in place for shared jobs.
- **Off-the-shelf blank remote enclosure** (ABS shells from Alibaba/enclosure vendors, roughly
  $3-10 landed depending on MOQ and shipping): faster to get something in-hand, but generic shells
  are sized for a specific internal PCB footprint and rarely have the right cutout pattern for a
  custom button/trackpad layout without still needing some fabrication (drilling/filing) — likely a
  worse fit than 3D printing given Sean already has a printer and Phase 2's layout is custom by
  definition (trackpad zone, d-pad, etc.).

**Recommendation:** 3D-printed on the AD5X, starting from OMOTE's published enclosure files as a
reference, not built from a blank sheet.

### Phase 1 and Phase 2 BOM summary

| Phase | Parts | Approx. cost |
|---|---|---|
| **Phase 1** (prove the loop) | ESP32-S3 Feather ($17.50) + ~10 tactile buttons (Sean likely already owns these from the ELEGOO kit; ~$3-5 if bought new) + jumpers/breadboard (owned) + USB power (owned) | **~$18-23** |
| **Phase 2** (IR + trackpad + battery + enclosure) | Phase 1 board + IR LED (owned via ELEGOO kit, or ~$0.50 new) + 2N3904 (~$0.10) + TSOP38238 (owned via ELEGOO kit, or $0.84 new) + AT42QT1070 trackpad ($7.50) + 500mAh LiPo ($7.95) + PLA (owned printer, ~$1-2 filament) | **~$27-35 incremental**, **~$45-58 total** |

## 3. Firmware architecture: connectivity and where commands are decided

### The three options, compared

1. **WiFi ESP32 node talking to the Pi** (recommended). The remote joins household WiFi (reusing
   the squirrel feeder's own already-solved WiFi-connect/reconnect pattern — that ESP32 project's
   `adr/0008` already verified real reconnect behavior on this exact class of hardware) and holds a
   persistent connection to the Pi, structurally identical to the phone's own "one disposable
   socket, race LAN against tunnel" design from ADR-HEARTH-158 item 3. It is, from the Pi's point of
   view, just another authenticated client — not a new architecture, a third instance of one that's
   being actively hardened today (ADR-HEARTH-196/197-adjacent work).
2. **Bluetooth peripheral, phone-mediated, no Pi involved.** The remote pairs directly to a phone's
   Hearth app over BLE; the app translates button presses locally and dispatches them the same way a
   tap on-screen would. Rejected as the primary model: it defeats the actual use case in Section 1.3
   ("phone isn't in hand, or the network/app is down") — if the remote can only speak through a
   specific phone's Bluetooth radio, it is useless exactly when it is most wanted (phone locked,
   asleep, in another room, or the Hearth app not foregrounded — iOS backgrounds BLE central roles
   aggressively). It also doesn't fit a shared household: ADR-HEARTH-181/189's whole point is that
   *multiple* phones each have their own standing to control devices; a remote bonded to one specific
   phone's Bluetooth stack re-introduces a single point of failure this project just moved away from.
3. **Standalone WiFi node with no Pi at all** (talks to devices' LAN APIs directly, duplicating
   drivers on the ESP32). Rejected: this would fork the device-connection/credential model
   ADR-HEARTH-158 item 3 is actively centralizing on the Pi (the Pi is meant to hold all real device
   connections so a phone or the tunnel never needs a stored SSDP/pairing credential of its own).
   Re-deriving LG/Sony/HA auth flows in embedded C on an ESP32 duplicates real, already-solved logic
   for no benefit.

### Recommended hybrid: local IR is instant, everything else goes through the Pi

The one thing a WiFi-to-Pi round trip *cannot* beat is a direct IR blast's latency and its
independence from the network being up at all — and IR-controlled legacy devices are also exactly
the devices Hearth has the weakest LAN-based alternative for. So the remote should split by target:

- **Buttons mapped to a taught IR code** (see Section 4): blasted **directly and locally** from the
  remote's own onboard IR LED, using a code cached on the ESP32 itself. No network round trip, no
  dependency on the Pi or WiFi being reachable at the moment of the press — this is what makes it
  behave like "a real remote" per the standing UX requirement, and it is the literal fallback case
  from Section 1.3.
- **Buttons mapped to a LAN/cloud-controlled device or an Activity** (Sonos, Hue, HA, an Apple TV,
  a full multi-step Activity): posted to the Pi as a button-event over the persistent WiFi
  connection, exactly like a phone's tap, and dispatched through the same command path every other
  client uses (see Section 4). These devices have no "point a remote at it" analog in the first
  place — a WiFi round trip is the correct and only mechanism, not a compromise.
- **If the Pi is unreachable when a network-target button is pressed**: queue the press locally on
  the ESP32 (a handful of button-presses' worth of RAM is trivial) and retry for the same ~5s window
  the phone's own tap-queue already uses (ADR-HEARTH-158), then give a distinct failure signal (e.g.
  a status LED blink pattern) rather than silently swallowing the press — never a dead end, matching
  `feedback_remote_should_feel_natural.md` exactly.
- **WiFi setup**: reuse the squirrel feeder's already-working WiFi-connect and reconnect logic as
  the starting point (same household network, same class of hardware, a solved problem in this
  household already) rather than inventing BLE-provisioning from scratch. This is a real Phase 1
  decision, not a detail — see Open Question 2.

### New Pi-side route family: `/api/integrations/hearth/physical-remote/*`

Bearer-authed like every other `hearth/*` route (adr/0196). Proposed shape, following the same
"thin route -> shared lib -> store" pattern every existing hearth/* route already uses:

- `POST /physical-remote/pair` — issues a **per-remote token** at pairing time, the same model
  ADR-HEARTH-181/189/adr/0203 already built for phones (never the shared `HEARTH_API_TOKEN`).
  Revocable exactly like a lost phone's token (same admin list, extended to a second client kind).
- `GET /physical-remote/mapping` — the remote fetches its own button map (button id -> capability +
  deviceId, or button id -> Activity id) on boot/reconnect, so remapping a button in the app takes
  effect without reflashing firmware.
- `POST /physical-remote/button-event` — `{remoteId, buttonId, pressKind}` for a network-target
  button; the Pi resolves the mapping and dispatches through **the exact same command-execution path
  a phone's tap already uses** — no remote-specific branch inside `CommandEngine` itself, the remote
  is just one more authenticated caller.
- `POST /physical-remote/ir-code` — a learned code from the remote's own onboard IR receiver, stored
  in **the same shape** `BroadlinkIrDriver` already uses (`device.config.codes[capability]`, hex
  string). This makes a code taught via the physical remote and a code taught via a Broadlink hub
  byte-for-byte interchangeable — either can replay either's taught codes, and the two learn flows
  become two front-ends onto one stored-codes model rather than two incompatible ones.

## 4. Software-side integration: the remote is a controller, not a controlled device

**This needed to be thought through explicitly, and the answer is: it's inverted.** `DeviceDriver`
(`core/drivers/DeviceDriver.ts`) models something Hearth *controls*: `connect`/`disconnect`,
`getState`, `executeCommand`, `subscribeToState` — all framed around the app or the Pi reaching out
to a device and telling it what to do or asking its state. A physical remote is the opposite
direction: **it is a source of input, symmetric with the phone app itself**, not a thing that gets
commands sent to it. There is no meaningful `executeCommand(remote, ...)` — nothing in this design
ever tells the remote to change its own state the way `executeCommand` tells a TV to change volume.
(A future LED/haptic acknowledgment channel would be the one narrow exception, and even that is more
like a push notification to the remote than a controlled device's state.)

**Concretely, this means "PhysicalRemoteDriver implements DeviceDriver" is close to the wrong shape.**
Two better-fitting options, and a recommendation:

- **(a) Model it like a phone, not like a TV.** A physical remote is a paired, tokened client next
  to "Household Phones" (`HouseholdPhonesScreen.tsx`, the per-phone-token/role infrastructure from
  ADR-HEARTH-181/189) — a new **"Household Remotes"** admin surface, same pairing/revoke/rename
  affordances, same token-per-client security model, explicitly *not* a row in the Devices tab
  (which is reserved for things Hearth controls). **Recommended.** This is the cleanest fit for the
  inversion: the remote authenticates, and then acts through the app's existing command path exactly
  as a phone's tap does — it never needs a `DeviceDriver` at all for its "controller" half.
- **(b) Give it a driver anyway, for its IR-emitter half only.** For the taught-IR-code capabilities
  specifically (Section 3's "blast locally" path), a small `PhysicalRemoteIrDriver` that mirrors
  `BroadlinkIrDriver`'s exact shape (`hasDynamicCapabilities: true`, same
  `BROADLINK_TEACHABLE_CAPABILITIES`, same `device.config.codes[capability]` storage) lets a legacy
  IR device *taught via the remote* still show up as an ordinary Device row with ordinary capability
  buttons — for the case where Sean wants to control that legacy TV from the **phone app**, relayed
  through the Pi to the paired remote's own IR LED (since the remote, unlike a Broadlink hub, has no
  fixed reachable IP the phone can hit directly — the Pi relays over the remote's own persistent
  connection instead). This is a legitimate second, narrow use of `DeviceDriver`, representing "the
  legacy TV, as taught by the remote" — not "the remote" itself.

Both (a) and (b) are needed and are not in conflict: (a) is how the remote's *button presses* enter
the system; (b) is how a *legacy device the remote taught* is represented for everyone else
(including the phone app) to control afterward. Recommend building both, with (a) as the Phase 1
foundation and (b) deferred to Phase 2 alongside IR itself.

### Button-to-capability mapping, configured from the app

Reuse the Activities editor's existing command-step model rather than inventing a second
picker: `ActivityEditorScreen.tsx` already drives its per-step device/capability choice through
`commandChoicesFor`/`commandStepFromChoice` (`core/activities/activityChoices.ts`), which is
capability-aware (only shows choices a given device actually declares). A new
"Household Remotes" -> "\[Remote name\]" -> "Edit buttons" screen reuses that exact picker per
physical button: each button maps to either one `commandChoicesFor` selection (a single
capability+device command, matching an `ActivityStep`'s command-step shape) or a whole existing
Activity id (run "Movie Night" from one press). No new capability ids are introduced — every button
targets a capability that already exists on some already-added device, matching `Capability.ts`'s
own "do not add an id until a driver or the UI actually uses it" rule.

### IR-learning in the existing add-device flow

`discovery/brandRegistry.ts` gets one new `BrandId` (e.g. `"physicalremote"`), `"custom-screen"` add
mode — the exact same shape `"feeder"` and `"broadlink"` already use (ADR-HEARTH-148: "the ONE place
a brand is described"). Concretely, when adding a legacy/no-network device and no Broadlink hub is
on hand, the add-device flow offers "Hardware needed: a Broadlink hub, **or** a Hearth Physical
Remote" as two interchangeable ways to teach that device's IR codes (both end up in the same
`device.config.codes[capability]` shape, both produce a driver-backed Device row per Section 4(b)
above) — the household is never blocked on owning specifically a Broadlink hub once a physical
remote exists.

## 5. Effort and phases

### Phase 1 — prove the loop (no IR, no battery, no enclosure)

- Hardware: ESP32-S3 Feather, ~10 direct-wired tactile buttons (power, vol+/-, mute, 4-way d-pad,
  `selectPlayPause`, back, home), USB power on a desk — deliberately identical in spirit to the
  squirrel feeder's own USB-powered, breadboard-only Phases 1-2 before any power/enclosure work.
- Firmware: WiFi connect/reconnect (ported from the squirrel feeder's already-verified pattern),
  fixed/hardcoded button-to-capability map to start (pointed at one real device, e.g. the living
  room TV), POSTs `button-event` to a new (unauthenticated-to-start, hardened before anything beyond
  a desk test) Pi route.
- Pi: the `physical-remote/button-event` route only, dispatching through the existing command path.
  Per-remote token issuance can follow once the loop itself is proven — Phase 1's whole goal is
  proving press -> Pi -> real device state change works end to end, same order the squirrel
  feeder's own phases followed (function before hardening, hardening before polish).
- **Effort:** a few evenings/one weekend, given WiFi-connect and Pi-route patterns already exist to
  copy from. **BOM: ~$18-23** (see Section 2 table), most of it a board Sean doesn't yet own.

### Phase 2 — IR learn/blast, configurable mapping, trackpad, battery, enclosure

- Adds: TSOP38238 + IR LED + 2N3904 (learn/blast, Section 2 — parts Sean may already own from the
  ELEGOO kit), AT42QT1070 trackpad, per-remote token pairing (Section 3/4), the app-side "Household
  Remotes" mapping screen (Section 4), `PhysicalRemoteIrDriver` for taught legacy devices (Section
  4b), LiPo + the Feather's built-in charge circuit, 3D-printed enclosure (AD5X, OMOTE-derived STL
  starting point).
- **Effort:** meaningfully larger than Phase 1 — new Pi-side auth model (per-remote tokens), a new
  driver, a new app screen reusing existing picker logic, plus real mechanical/enclosure design
  iteration (expect multiple AD5X print/fit cycles, same as the squirrel feeder's own mechanical
  phase). Rough order of magnitude: several weekends, not one.
- **BOM: ~$27-35 incremental, ~$45-58 total** (Section 2 table) — genuinely lower if the ELEGOO
  kit's IR receiver/emitter modules are used as-is instead of buying discrete TSOP38238/LED parts.

### Explicitly out of scope for both phases

A custom PCB (Section 2 — a real Phase 3, after the button/trackpad layout is proven), RF learning
for non-IR remotes (out of scope for `BroadlinkIrDriver` today too, per ADR-HEARTH-103), and any
capability that takes a runtime argument (`setVolume`'s level, `directionalNavigation`'s direction as
a *taught IR* code) — matching the existing Broadlink driver's own documented limitation, since a
learned IR/RF code is a fixed, opaque blob with no parameters.

## 6. Open questions for Sean

1. **Battery vs. USB/AA for Phase 1, and battery vs. no-battery scope for Phase 2.** Recommendation
   above is USB-only for Phase 1 and a small LiPo (Feather's built-in charge circuit) for Phase 2 —
   confirm, or say if a cordless Phase 1 matters enough to add a battery earlier.
2. **WiFi vs. Bluetooth for connectivity**, and specifically: reuse the squirrel feeder's existing
   WiFi-connect/reconnect firmware as the starting point (recommended, Section 3), or is a fresh
   BLE-provisioning flow (tap phone to remote to hand it WiFi credentials, no serial/USB step)
   worth the extra build time for a nicer first-setup experience?
3. **3D-printed (AD5X, OMOTE-derived shape) vs. off-the-shelf enclosure** — recommendation above is
   3D-printed; confirm, and if 3D-printed, whether this goes into the existing shared AD5X print
   queue/coordination protocol as a household job or Sean's own priority print.
4. **One prototype, or design for the whole household from day one?** Phase 1/2 costs above are
   per-unit; a second remote (e.g. for a different room/TV) is nearly free to duplicate once the
   design is proven, but per-remote tokens (Section 3/4) and the "Household Remotes" screen should
   be designed multi-remote-aware from the start if more than one is ever likely, rather than
   retrofit later. Confirm intended household scope before Phase 2's pairing/token work starts.
5. **Budget** — no explicit number was given. Section 2's BOM (~$18-23 Phase 1, ~$45-58 Phase 2
   total) is the honest floor for one unit; confirm this is in range before ordering anything.
6. **Trackpad ambition for Phase 2** — discrete capacitive zones (AT42QT1070/MPR121, cheaper,
   simpler firmware) vs. a true relative-position trackpad (Adafruit's PS/2 module, heavier
   integration, closer to `CommandCenterRemoteScreen`'s existing touchpad-mode feel). Recommendation
   above is to start discrete and only escalate if that proves too coarse in real use.

## Consequences

Nothing is built yet. If Sean answers the open questions above, Phase 1 (ESP32-S3 Feather, ~10
hardcoded buttons, one new Pi route, no IR/battery/enclosure) is buildable in the next available
session using entirely off-the-shelf, cheap, real parts plus hardware Sean may already own. Phase 2
depends on Phase 1's mapping/token infrastructure being in place first and should not be started
concurrently with it.
