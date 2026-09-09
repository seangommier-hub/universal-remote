# ADR-HEARTH-012: QR-code pairing for Family Command Center, in-app scan (not deep link)

**Date:** 2026-09-09
**Status:** Accepted

## Context

Sean told the family-command-center session directly that manual token/URL
entry shouldn't be something households have to do — fair, given the token
is a long opaque string and most household members aren't technical. FCC
proposed showing a QR code in its own Settings encoding `{"baseUrl","token"}`
as JSON, and asked whether Hearth should receive it via a `hearth://`
custom-scheme deep link (auto-launching from the phone's camera app) or via
in-app scanning.

## Decision

In-app scanning, not a deep link. `ScanFamilyCommandCenterQrScreen`
(`src/ui/`) uses `expo-camera`'s built-in barcode scanning (`CameraView`,
`onBarcodeScanned`, `barcodeScannerSettings={{barcodeTypes:["qr"]}}`) —
confirmed against current SDK 57 docs before building, not assumed:
`expo-barcode-scanner` is deprecated/absorbed into `expo-camera`, and
scanning is included in Expo Go (no Dev Build needed).

Extracted the manual-entry form's verify-then-save logic into
`verifyAndSaveFamilyCommandCenterConfig()` (`src/discovery/familyCommandCenterConfig.ts`)
so both the QR scan path and manual entry (`FamilyCommandCenterSettingsScreen`,
kept as a fallback) share identical validation — neither can save an
unverified config. QR is the new primary entry point from
`DiscoverDevicesScreen`'s "connect Family Command Center" action; manual
entry is one tap away (`onUseManualEntry`) if scanning isn't practical.

`expo-camera` added as a dependency (SDK-pinned via `expo install`), with a
config plugin entry in `app.json` for the camera permission description
string — note this plugin only takes effect in a real native build, not
inside Expo Go itself (same category of limitation as the local-network
permission strings documented in `docs/EXPO_COMPATIBILITY.md`); the
runtime permission *prompt* itself (`useCameraPermissions`) works in Expo
Go regardless.

## Rationale

A `hearth://connect?...` deep link was considered first (the app already
declares `"scheme": "hearth"` in `app.json`) since it would let a phone's
native camera app auto-launch straight into Hearth with zero in-app
scanning UI. Rejected because custom URL schemes don't reliably launch
into a project running under Expo Go — Expo Go itself owns the `exp://`
launch mechanism during development, and this is Expo-Go-only today. In-app
scanning has no such dependency: it works identically whether the app is
running under Expo Go or a future Dev Build/standalone build, so it's not
throwaway work that needs redoing at the Phase 3 Dev Build transition.

## Consequences

- The deep-link path remains a real option worth revisiting once Hearth
  moves off Expo Go (Phase 3) — not implemented now, but not ruled out
  either; in-app scanning would likely stay as the fallback either way.
- `expo-camera`'s config plugin permission string won't be visible until a
  native build exists; until then the only camera permission UX users see
  is Expo Go's own generic prompt via `useCameraPermissions()`, not
  Hearth's custom description text. Documented so this isn't mistaken for
  a bug later.
- 3 new unit tests for `verifyAndSaveFamilyCommandCenterConfig` (config
  validation, success, and rejection paths); 74/74 tests passing
  project-wide. The scan screen's camera/UI logic itself isn't
  unit-tested (no camera hardware in Jest) — same category as every other
  screen component in this project, verified via Expo Go instead.
