# ADR-HEARTH-090: Missing `NSLocalNetworkUsageDescription` — the real "discovery works in Expo Go but not the real app" cause

**Date:** 2026-09-19
**Status:** Fixed

## Context

Sean asked to "find a way to make it discover devices like it could on the expo go version" —
implying standalone builds behave worse than Expo Go did for local network discovery/connections.
Investigated by directly inspecting the already-downloaded compiled `Info.plist` (the same
diagnostic technique ADR-HEARTH-087 established): `NSLocalNetworkUsageDescription` was completely
absent, on every build made so far.

iOS has gated app-initiated connections to local/private-network addresses behind this specific
permission since iOS 14 — without the Info.plist string, the OS never shows the user the "Allow
Hearth to find devices on your local network?" prompt, and connections to local IPs can be silently
degraded or blocked. Expo Go already carries this permission for itself (it needs local network
access for its own dev-server communication), so every driver's direct connection to a device's
local IP — LG's WebSocket, Roku's HTTP, Samsung's WebSocket, everything — implicitly worked while
running inside Expo Go and nowhere else. This was never actually about "discovery" specifically
(Family Command Center's own discovery is a plain HTTPS `fetch`, not mDNS) — it's every driver's
direct local-network connection that was affected.

Also corrected a mistaken premise from an earlier security-audit request in this session: the same
Info.plist inspection shows `NSAllowsArbitraryLoads: false` (not `true` as previously misread) —
only the correctly-scoped `NSAllowsLocalNetworking: true` is set. No fix needed there; that finding
was wrong and is retracted.

## Decision

Added `ios.infoPlist.NSLocalNetworkUsageDescription` to `app.config.js`: "Hearth connects directly
to TVs, outlets, and other devices on your home network to control them."

## Consequences

- This is a native config change — like ADR-HEARTH-087, no server-side or JS-only fix can
  retroactively add a missing Info.plist permission to an already-compiled binary. Requires a real
  rebuild, bundled into the same rebuild cycle as ADR-HEARTH-087/088/089's changes rather than a
  separate one.
- The first time the rebuilt app makes a local-network connection, iOS will now show the real
  system permission prompt — the user must tap Allow for any of this to work at all. Worth
  confirming this actually appears and gets approved when testing the next build, not just that the
  Info.plist key is present.
- If a future driver ever needs actual Bonjour/mDNS *service browsing* (not just direct IP
  connections), `NSBonjourServices` would need its own explicit service-type list — not added here
  since nothing in this codebase currently does real Bonjour browsing, confirmed by review, not
  assumed absent.
