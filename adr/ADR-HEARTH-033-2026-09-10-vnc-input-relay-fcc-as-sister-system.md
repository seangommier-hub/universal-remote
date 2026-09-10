# ADR-HEARTH-033: Hearth as the Family Command Center's remote input device (VNC-based)

Date: 2026-09-10

## Status

Accepted — Phase 1 (Hearth-side RFB input client, trackpad UI) in progress.
Phase 2 (Family Command Center's server-side relay + VNC exposure) is
**out of scope for this repo** — see Consequences.

## Context

Sean: "make the phone an ultimate driver of the command center so no
keyboard or mouse is needed but still can be used." Clarified via
AskUserQuestion: Hearth and the Family Command Center (the household's
Raspberry-Pi-based hub — see ADR-HEARTH-011's relay, `FamilyCommandCenterDiscoveryProvider`)
should be "sister operating programs... work together, have integrations
and think like they are able to work together but also act independently."
So this isn't about Hearth's own screens (already fully phone-operable —
d-pad navigation, `ThemedKeyboard` for text entry) — it's about turning the
phone into the FCC's primary input device, the same way a physical
keyboard/mouse plugged into it would be, while leaving that physical
option intact as a fallback.

Mechanism, confirmed via AskUserQuestion against three real options:
1. **VNC-based remote desktop** — chosen. Universal, decades-old standard;
   works with any VNC-server-capable machine, not just this one Pi. Matches
   Sean's own "compatible with as many devices as possible."
2. A custom input-relay API (touch → mouse deltas, keys → `uinput`/
   `ydotool`) — simpler protocol but locks the mechanism to this one Pi's
   bespoke software, not reusable elsewhere.
3. Bluetooth HID peripheral mode — most universal in theory (any Bluetooth
   host, zero server-side software), but iOS restricts third-party HID
   peripheral mode heavily; not realistically buildable in Expo/React
   Native without deep native work outside this project's current reach.
   Not pursued.

**No existing React Native VNC client exists.** Researched directly:
noVNC and its React wrappers (`react-vnc`, `react-vnc-lib`, etc.) are all
built for the DOM — they render the framebuffer onto an HTML `<canvas>`,
which doesn't exist in React Native's environment. There's no RN port.
Building one from scratch is real, substantial protocol work (RFC 6143,
"The Remote Framebuffer Protocol").

## Decision

**Scope Phase 1 to input only, not framebuffer rendering.** The RFB
protocol's pointer/keyboard messages (`PointerEvent`, `KeyEvent`) are
simple, fixed-size, and require no pixel decoding at all. The framebuffer
side — `SetEncodings`, `FramebufferUpdateRequest`, and decoding whatever
pixel encoding comes back (Raw/Hextile/ZRLE/Tight...) — is the genuinely
large, Canvas-shaped part of RFB, and isn't needed to satisfy "no keyboard
or mouse is needed." A client that completes the handshake and only ever
*sends* `PointerEvent`/`KeyEvent` never has to *request* a framebuffer
update at all, and a spec-compliant server never sends one unsolicited —
so this client can skip pixel decoding entirely for now, not defer it
half-built. Seeing the screen (to confirm an action landed) stays the
Pi's own attached monitor, or a second follow-up phase, not this one.

**Transport: through the Family Command Center's existing authenticated
relay, not a raw VNC connection.** Mirrors ADR-HEARTH-011's existing HTTP
relay pattern (`requestWithRelayFallback`, `/api/integrations/hearth/relay/http`)
rather than inventing a new trust model: Hearth connects to a *new*
FCC-side WebSocket endpoint (proposed: `/api/integrations/hearth/relay/vnc`)
gated by the same bearer token every other FCC call already uses; the FCC
proxies raw bytes to a VNC server bound to its own loopback/local network,
never exposed directly to the internet or authenticated separately. This
also sidesteps implementing VNC Authentication's DES challenge-response in
Hearth — Phase 1 only supports RFB's "None" security type, trusting the
relay's own bearer-token gate the same way the HTTP relay already does.
VNC Authentication (real DES) is a documented gap if the Pi's local VNC
server is ever configured to require it independently.

**`RfbClient`** (`src/drivers/inputRelay/vnc/RfbClient.ts`): implements
just enough of RFC 6143 to complete the handshake and send input:
ProtocolVersion negotiation (advertises 3.8), Security handshake (accepts
only type 1/None), ClientInit/ServerInit (reads real framebuffer
width/height + name — needed to map trackpad touch coordinates to the
Pi's actual screen resolution), then `sendPointerEvent(x, y, buttonMask)`
/ `sendKeyEvent(keysym, down)`. Maintains its own byte-reassembly buffer
over the WebSocket's binary messages, since RFB is a byte-stream protocol
and a single WS message can contain a partial message, multiple messages,
or split a field across a message boundary — getting this wrong is the
single most common bug class in hand-rolled protocol clients.

**Multiple phones, and physical peripherals, all at once — confirmed by
Sean explicitly ("both, phone and keyboard and the ability for multiple
phones with given permission to drive it").** Both halves of this are
already covered by decisions above, not new work:
- RFB's `ClientInit` shared-flag (already set to 1 in `RfbClient`) is
  exactly the protocol's own mechanism for "let other clients — including
  a physical keyboard/mouse — stay connected while I'm also connected."
  No Hearth-side change needed for this half.
- "Multiple phones, with permission" needs each phone to carry its own
  distinct credential, which Hearth already has: `familyCommandCenterConfig.ts`
  pairs and stores one token *per device* (via QR-code pairing,
  ADR-HEARTH-012), in `SecureStore`, not a single secret baked into the
  app. **The remaining gap is entirely FCC-side**: the new
  `/relay/vnc` endpoint needs to check whether the *specific* presenting
  token has been granted VNC-relay permission (not just that it's a valid
  FCC token at all), with an admin-facing way for Sean to grant/revoke
  that per paired device. Hearth needs no new pairing/auth code for this —
  it already sends its stored token on every FCC request.

## Consequences

- **Phase 2 (Family Command Center's own server-side work) cannot be built
  from this repo or session.** It needs: (a) a VNC server running on the
  Pi (x11vnc/TigerVNC, bound to loopback), and (b) the new
  `/relay/vnc` WebSocket endpoint proxying to it, reusing the FCC's
  existing bearer-token auth. This is real, separate work in the Family
  Command Center's own codebase — flagged directly to Sean, not silently
  assumed done. Until it exists, `RfbClient` has nothing real to connect
  to; it's been built and tested against a mocked WebSocket replaying the
  real RFC 6143 byte sequences, not a live server.
- No framebuffer viewing in Phase 1 — a real, named limitation, not an
  oversight: rendering the Pi's screen inside Hearth is Canvas-shaped work
  (pixel decode + draw) that a phone-as-input-device goal doesn't actually
  need, and deferring it kept Phase 1 achievable in one session instead of
  half-finished.
- VNC Authentication (DES) unsupported — Phase 1 assumes the relay's own
  bearer token is the real security boundary (consistent with how the
  existing HTTP relay already works), not a second per-connection VNC
  password. If the Pi's local VNC server ever needs its own auth
  independent of the relay, that's follow-up work, not silently dropped.
- Keyboard input needs an X11 keysym mapping table (RFB's `KeyEvent` uses
  X11 keysyms, not raw scancodes or JS key names) — a real, sizeable
  lookup table, built as its own piece so it's independently testable
  rather than folded into the protocol client.
