# ADR-HEARTH-191: Family Command Center (Ring) cameras in Hearth — read-only list + snapshot

**Date:** 2026-09-27
**Status:** Accepted (implemented). Phase 1 of ADR-HEARTH-187's design — list + snapshot only, against
the exact contract the Pi side already shipped and verified (family-command-center commit 651f48d).
Live view, event history, push alerts, the tailnet base URL and Ring-app-parity features ADR-HEARTH-187
also describes are still deferred: not built here, and not contradicted by anything here — this is a
strict subset of that design, not a redesign of it.

## Context

Sean, 2026-09-27: build the Hearth app side of the Pi's already-working Ring camera integration, against
the documented contract (`GET /api/cameras`, `GET /api/cameras/<id>/snapshot`), reusing ADR-HEARTH-182's
Home Assistant camera pattern (`DeviceCategory: "camera"`, `DeviceDriver.fetchSnapshot`, `CameraControls.tsx`)
rather than building something parallel.

## Decisions

### 1. A new read-only driver, not a variant of an existing one
`FccCameraDriver` (`src/drivers/camera/ring/FccCameraDriver.ts`, id `fcc-camera-ring`) lists cameras as
`Device{category:"camera"}` with `capabilities: []` — the same rule ADR-HEARTH-182 already applied to
Home Assistant cameras: viewing is a read, never a Command, so a Ring camera is structurally impossible
as an Activity/schedule step. Nothing was added to `activityRunner.ts`'s `NEVER_IN_ACTIVITY_CAPABILITIES`
— there's no capability id to add, the same "defense in depth beats a symbolic entry" reasoning ADR-182
used for its own camera category.

`connect`/`disconnect`/`subscribeToState` are deliberately inert (no-ops / a plain listener map, no
timer). `App.tsx`'s `stateStoreBridge` wires every device's `connect`/`subscribeToState`/`getState` once
at app launch and on every reconnect, for the life of the app — exactly the kind of background polling
this ADR needs to avoid for cameras. The driver's cached per-camera state only ever changes when
something calls `applyCameraViews(views)`, which is never the driver itself.

### 2. LAN-only bypass in `fccRequest.ts`, not a rework of its LAN/public contract
Camera routes 404 through the public tunnel by design (Pi-side, LAN-only feature). Added a narrow
`{lanOnly: true}` option to `fccFetch`'s existing `FccFetchOptions` — `orderAttempts` skips the public leg
entirely when set, regardless of `config.publicBaseUrl` or `shouldPreferPublicRoute()`'s away-mode
memory. `fetchFccCameras` and every snapshot URL this driver builds pass it. Both endpoints are called
*only* against `config.baseUrl`, never `config.publicBaseUrl`, confirmed by test (`fccRequest.test.ts`'s
`lanOnly` describe block, plus `fccCameraApi.test.ts`'s own "never falls back" test).

### 3. Snapshot: mirrors `haCameraSnapshot.ts`'s synchronous fallback branch exactly — no double fetch
`GET /api/cameras/<id>/snapshot` *is* the URL the list's own `snapshotUrl` field already names (relative
to `baseUrl`) — not a second, independently-built endpoint to reconcile. `fccCameraSnapshotSource(baseUrl,
token, view)` is a pure, synchronous function returning `{uri, headers}` (or a placeholder), the same
shape `cameraSnapshotSource` already returns for Home Assistant's REST-proxy fallback. `FccCameraDriver
.fetchSnapshot(device)` never calls `fetch` itself — it reads the last-applied cached `CameraView` and
returns the source synchronously (after one `loadFamilyCommandCenterConfig()` read). RN's `Image`
component makes the real request, lazily, with the bearer header in `source.headers` — same pattern
`CameraControls.tsx` already used for Home Assistant, unchanged.

**`snapshotUrl: null` (some cameras have never captured one) resolves to a placeholder, not a fetch
attempt or an error.** `SnapshotImage` gained an optional `placeholder?: boolean` field (additive, `undefined`
everywhere else); `CameraControls.tsx` renders a camera icon + "No snapshot yet" instead of an `<Image>`
tag or the generic error text whenever `image.placeholder` is true. This also covers the endpoint's own
404 case defensively — a camera that loses its snapshot between the driver's last poll and the tap simply
never gets a network request made against it that could 404 in the first place, since the placeholder
decision is made from the already-known cached `CameraView`, not from interpreting a failed request's
status code. 401/503/network failures on the underlying `Image` load are unified into the existing
generic "Could not load the snapshot." text — the same accepted limitation ADR-182 already noted for its
own REST-proxy fallback path (RN's `Image.onError` doesn't expose an HTTP status portably, and the web
harness can't exercise `source.headers` at all — see its own "Unverified").

### 4. State fields, and the 5-second poll's actual scope
`CameraView`'s live fields (availability, streamStatus, motionActive, lastMotionAt/lastDingAt/
lastEventType/lastEventAt, batteryLevel, snapshotAt, snapshotUrl, kind, powerSource) land in
`DeviceState.values` via `cameraViewToState` — the same loose per-category bag every other control group
already reads. `availability: "online"` maps to `connection: "connected"`, everything else
(`"offline"`/`"ring_unavailable"`/`"auth_required"`) to `"disconnected"`.

**Where the 5-second refresh actually lives:** `useFccCameraPoll.ts` (mount-scoped, same activate/
deactivate-on-mount/unmount shape as `useKeepScreenAwake.ts`) is called from `CameraControls.tsx` only,
gated on `device.driverId === FCC_CAMERA_DRIVER_ID`. This required threading a `driverRegistry` prop
through `EntityControlProps`/`EntityControlScreen` — a small, additive, backward-compatible change (every
other control group already ignores props it doesn't use, e.g. `fetchSnapshot`). It is **not** wired to
the generic Devices tab list (`DeviceListScreen`/`DeviceListSections`), which stays mounted for the app's
whole session and would otherwise turn this into exactly the background polling ADR-HEARTH-187 rules
out. Skips the network entirely in demo mode (`isDemoMode()`), the same guard `useOfflineAlert.ts`
already uses.

`applyCameraViews` reaches the shared `StateStore` through the *existing* `stateStoreBridge` wiring
(subscribed once per device, for the life of the app, like every other driver) — no new plumbing needed
for that half.

### 5. Camera devices sync in and out once, not on the 5-second timer
`syncFccCameras` (`src/runtime/fccCameraSync.ts`) runs alongside the existing `runAutoDeviceSync` in
`App.tsx` — at startup and every return to the foreground, never a recurring timer. It adds a `Device`
for every reported camera not already local, and **removes every locally-synced camera the Pi no longer
reports — including all of them when `enabled:false`.** Since camera tiles are just ordinary `Device`
rows rendered by the generic Devices list (no separate "camera list screen" was built — cameras already
route through `EntityControlScreen`/`CameraControls` via the existing `ENTITY_SCREEN_CATEGORIES` set from
ADR-182), this one rule is what makes "no camera UI anywhere, including the Devices tab" true when
disabled: there is simply no `Device` object left to render.

### 6. `BRAND_REGISTRY` needed an entry too
`brandRegistry.test.ts`'s own consistency check requires every registered driver to have exactly one
brand entry. Added `"ringcamera"` with `inAddPicker: false` and `vendorPattern: null` — same "registered
but never offered" shape as the Squirrel Feeder's own entry — since these devices are never added one at
a time through the brand picker, only auto-synced.

## Questions and answers (ADR-GLOBAL-002)

- *Does polling belong inside the driver's own `subscribeToState`, given every driver's subscription is
  wired once for the app's whole life?* No — that would make it background polling by construction. Logged
  here rather than asked live: ADR-HEARTH-187 already fixed the "only while open" requirement; this is
  that requirement's most literal implementation (extract the interval into a hook, mount-scope the hook
  to the one screen that should drive it), not a genuinely ambiguous fork.
- *Does the snapshot endpoint need to be fetched separately from the list, to distinguish 400/404/401/503
  by status code?* No — see Decision 3. The list's `snapshotUrl` already carries the one fact (present vs.
  null) that matters for the placeholder case Sean's own ask singled out; a live re-fetch-and-inspect
  would cost a second network round trip and JPEG download for no behavior a `snapshotUrl: null` check
  doesn't already give for free.

## Unverified

**No real Family Command Center / Ring camera was reachable from this session.** Everything here is
against the documented contract (this ADR's own `CameraView`/`FccCamerasResponse` shapes, taken as given)
and the demo/mock fixtures below:
- `fccRequest.ts`'s `lanOnly` behavior, `fetchFccCameras`, `FccCameraDriver` and `fccCameraSync` are unit-
  tested against a mocked `fetch` and a mocked `loadFamilyCommandCenterConfig` — never a live Pi.
- UI verified only in the web harness (`scripts/ui-verify`) against `demoFccCameras.ts`'s fixed 6-camera
  household (one battery doorbell at 45%, five wired cameras, two of those five with `snapshotUrl: null`)
  — matching the shape Sean described his own household as having. Screenshots: `fcc-cameras-list`
  (camera tiles in the Devices list), `entity-camera-ring-doorbell` (a camera with a snapshot, battery,
  and a "Last ring" time), `entity-camera-ring-no-snapshot` (the placeholder path, rendered with no error
  text). All three ran clean (no page errors, `--no-build` web export succeeded).
- A real `401`/`503`/network failure on the snapshot `Image` load itself is unverified beyond the generic
  fallback text — same accepted limitation as ADR-182's own REST-proxy path.

## Consequences

New: `src/core/types/Camera.ts`, `src/drivers/camera/ring/fccCameraApi.ts` (+ test),
`src/drivers/camera/ring/FccCameraDriver.ts` (+ test), `src/runtime/fccCameraSync.ts` (+ test),
`src/ui/camera/useFccCameraPoll.ts` (+ test), `src/ui/camera/formatCameraEventTime.ts` (+ test),
`src/demo/demoFccCameras.ts`. Extended: `src/core/network/fccRequest.ts` (+ test) with `lanOnly`,
`src/core/types/Snapshot.ts` with `SnapshotImage.placeholder`, `src/ui/entityControls/CameraControls.tsx`,
`src/ui/entityControls/entityControlTypes.ts` and `src/ui/EntityControlScreen.tsx` (new `driverRegistry`
prop), `src/ui/DevicesTabScreen.tsx`, `src/runtime/bootstrap.ts` (driver registration), `App.tsx`
(`syncFccCameras` call), `src/discovery/brandRegistry.ts` (`"ringcamera"` entry), `src/demo/demoDriver.ts`,
`src/demo/demoHousehold.ts`, `src/demo/demoRuntime.ts`, `src/demo/demoScreenRoute.ts`,
`scripts/ui-verify/scenarios.mjs`.

Deferred (ADR-HEARTH-187's remaining phases, untouched by this ADR): live view (WebView + view-ticket),
event history/clip playback, push alerts, the tailnet `tailnetBaseUrl` fallback, two-way talk.
