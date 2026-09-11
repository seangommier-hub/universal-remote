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

## Update 2026-09-11: Phase 2 built — no longer "cannot be built from this repo/session"

That framing was true at the time (no established access to the Pi from
this session), not a permanent architectural limit. SSH access to the Pi
became a working, established capability later the same night (see
`family_command_center_ssh_access.md` memory) — once that was true, this
became a normal implementation task like any other.

**Real finding that changes Phase 1's own text above**: this Pi's kiosk
runs under **labwc**, a Wayland compositor — confirmed live via `ps aux`
and `deploy/kiosk/start-kiosk.sh`'s own comments ("This Pi's labwc session
doesn't run XWayland"). `x11vnc` (mentioned above, also actually installed
on the Pi) **cannot work here at all** — it needs a real X11 display to
attach to, and there isn't one. **`wayvnc`** — also already installed,
bundled with Raspberry Pi Connect — is the correct tool for a wlroots
compositor like labwc.

Built, deliberately NOT reusing Raspberry Pi Connect's own bundled wayvnc
(`/etc/wayvnc/config`, its own `wayvnc.service`/`wayvnc-control.service`,
confirmed inactive/unused — left completely untouched):

- `hearth-vnc-server.service` — a dedicated wayvnc instance, running as
  `seangommier` (needed to reach that user's real compositor socket),
  `--websocket` mode (speaks WS-framed RFB directly, so the relay below is
  a pure message forwarder, not a byte-stream translator), bound to
  `127.0.0.1:5901` only.
- `hearth-relay-vnc.service` — a new standalone Node relay
  (`scripts/hearth-relay/vnc-relay-ws-server.js`), same
  `HEARTH_API_TOKEN` bearer-in-query-param auth as the Samsung/LG relay
  (`relay-ws-server.js`, ADR-HEARTH-011), but a **separate file**, not an
  extension of it: that relay's whole security model is "never let the
  caller target this Pi itself"; this one's only valid target *is* this
  Pi's own loopback wayvnc. Mixing the two would mean adding a
  self-target exception to a script whose entire point is forbidding
  that — cleaner and more auditable as two small, single-purpose scripts
  (ADR-GLOBAL-003).

**Hearth's side corrected to match reality**: `familyCommandCenterVncRelay.ts`
originally assumed the relay would be a path on the Center's own app
(`ws://<baseUrl>/api/integrations/hearth/relay/vnc`) — wrong for the same
reason the Samsung/LG relay isn't a Next.js route either (`next start`
doesn't expose the HTTP Upgrade event to application code). Fixed to
mirror `wsRelayFallback.ts`'s own proven pattern exactly: same hostname as
`config.baseUrl`, dedicated port (3212), plain `ws://`.

**Verified live, end-to-end, without sending a single input event**: a
throwaway script connected through the real deployed relay with the real
`HEARTH_API_TOKEN` and received a genuine RFB handshake
(`"RFB 003.008\n"`) — proof the full chain (auth → relay → wayvnc → the
actual compositor) works, without any risk of a stray click or keystroke
landing on the live kiosk display the family uses today. Deliberately
stopped there: real pointer/keyboard verification is exactly the
"Sean, real-hardware checkpoint" step already called for below — opening
`CommandCenterRemoteScreen` in the real app and confirming the Pi's actual
cursor moves.

**Still open** from Phase 1's original text, unchanged by this update: VNC
Authentication (DES) unsupported (relay's bearer token is the real
boundary), no framebuffer viewing (deliberately out of scope), and the
per-device VNC-relay permission grant/revoke UI ("multiple phones, with
permission") — today every device holding a valid paired FCC token can
reach the relay, an all-or-nothing grant rather than a per-device one.
