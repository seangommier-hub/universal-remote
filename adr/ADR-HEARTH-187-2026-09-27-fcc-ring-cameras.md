# ADR-HEARTH-187: Family Command Center (Ring) cameras in Hearth -- LAN-only

**Date:** 2026-09-27
**Status:** Accepted (design). Implemented after the Pi's camera pipeline passes its own testing (FCC adr/0213);
no Hearth code changes yet. Companion to the Pi's adr/0214 (family-command-center repo), which owns the server side.

## Context

Sean, 2026-09-27, while starting the Ring camera integration on the Family Command Center Pi: "also add compatibility
to hearth as well." The Pi now runs (adr/0206-0213) ring-mqtt + go2rtc and exposes a normalized camera model.
Hearth already has `DeviceCategory: "camera"` and a read-only `fetchSnapshot` path (ADR-HEARTH-182) for Home
Assistant cameras, and a relay-fallback chain whose last leg is the public `carddna.app` tunnel (ADR-HEARTH-123).

## Decision

- **New read-only source, not a new Command:** an `fccCameras` driver lists cameras from `GET {baseUrl}/api/cameras`
  (bearer token, same saved `FamilyCommandCenterConfig`) and maps each to a `Device` with `category: "camera"`, no
  capability ids (same rule as ADR-HEARTH-182: viewing is a read, never a Command, never an Activity step).
- **Snapshots** reuse `DeviceDriver.fetchSnapshot` -> `GET {baseUrl}/api/cameras/<id>/snapshot` with the bearer
  header, loaded into `CameraControls.tsx`'s existing tile.
- **Live view** adds a "Live" button to `CameraControls.tsx`: `POST {baseUrl}/api/cameras/<id>/view-ticket`, then a
  full-screen WebView at `{baseUrl}/embed/cameras/<id>?ticket=...`. Requires adding `react-native-webview` (Expo-
  supported; a native build via EAS is already the normal release path). Chosen over `react-native-webrtc` because
  the Pi page already implements the WebRTC client for the kiosk; Hearth would otherwise maintain a second one.
- **Never through the public tunnel:** camera calls are **excluded from `httpRelayFallback.ts`'s public leg**
  (`carddna.app`); the Pi 404s them there anyway (adr/0214, 0216).
- **Away from home via a private tailnet** (Pi adr/0215): Tailscale on the Pi and phones, owned by
  `seangommier@gmail.com`. `FamilyCommandCenterConfig` gains an optional `tailnetBaseUrl` used only for camera calls,
  tried after `baseUrl`. With neither reachable, Hearth shows "Cameras need home Wi-Fi or the home VPN".
- **Polling only while visible:** camera list/state refreshes every 5 s only while a camera screen is open.
- **Ring-app parity (Sean, 2026-09-27: "i want video access the same way the ring app acts", features = all):**
  live view (above); an event history list (`GET /api/cameras/events`) with clip playback of the Pi's 14-day local
  motion/doorbell recordings (`GET /api/cameras/recordings/<id>`, range requests, in the same WebView player);
  push alerts via Expo push, text-only payload (doorbell always, motion opt-in per camera); two-way talk is
  research-gated on the Pi side (adr/0215) and not promised.
- **Optional per household** (Pi adr/0216): when `GET /api/cameras` returns `{enabled:false}`, Hearth shows no
  camera UI, makes no further camera calls, and registers no camera push categories.
- **Auth:** reuse the existing bearer path as-is. Per ADR-HEARTH-181 / Pi adr/0203 the token may be the legacy
  shared token or a per-phone token; nothing camera-specific is added to `fccRequest.ts` or the token store.

## Native build constraint (from the Hearth app-install session, 2026-09-27)

`react-native-webview` and Expo push both need a new native build, not an OTA update. They are bundled into the
same next native build as the queued Siri Shortcuts / background presence / push work, so no build slot is spent
on cameras alone (Expo's free build cap resets Oct 1).

## Deferred

- Two-way talk, pending the Pi-side feasibility spike.

## Verification plan

Web harness scenario with a fake `/api/cameras` (list, snapshot, ticket), then a real on-LAN device test against the
Pi once FCC Phase 10 passes; an off-LAN test confirming the "home Wi-Fi only" message and zero tunnel calls.
