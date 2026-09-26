# ADR-HEARTH-143: Samsung Tizen connection liveness: researched, deliberately not implemented

**Date:** 2026-09-26
**Status:** Accepted (research-only; no code change)

## Context

`SamsungTizenDriver` holds a persistent WebSocket like `LgWebOsDriver`, so it has the same two gaps:
a silently dead socket never fires `onclose` (ADR-HEARTH-132), and `reconnectAllDevices` rebuilds a
healthy socket on every foreground (ADR-HEARTH-138; `connectClient` closes the previous client).
LG was fixed with a heartbeat and `isConnectionAlive`, both built on a side-effect-free request whose
reply can be awaited. The question: does Samsung's remote channel have one? No Samsung TV is
available to test on.

## Research findings

Sources: xchwarze/samsung-tv-ws-api (`samsungtvws/remote.py`, `event.py`, `connection.py`,
`APPLICATIONS.md`) and ollo69/ha-samsungtv-smart issue #424.

- Events/methods the reference library knows: `ms.channel.connect`, `ms.channel.clientConnect`,
  `ms.channel.clientDisconnect`, `ms.channel.ready`, `ms.channel.unauthorized`, `ms.error`,
  `ms.remote.imeStart/imeEnd`, `ed.edenTV.update`, `ed.apps.launch`, `ed.installedApp.get`
  (event.py). Requests: `ms.remote.control` (key press, cursor, text; changes TV state) and
  `ms.channel.emit` with `ed.installedApp.get` / `ed.apps.launch` (remote.py).
- Keepalive: `remote.py` and `connection.py` contain no ping/heartbeat; the library opens the socket
  with `websocket.create_connection` and just listens. Nothing documents an application-level ping.
- The only documented, read-only, reply-bearing request is
  `{"method":"ms.channel.emit","params":{"event":"ed.installedApp.get","to":"host"}}`, answered by an
  `ed.installedApp.get` event (documented and widely used, e.g. Home Assistant SamsungTV Smart).
- But it is unreliable as a liveness probe: newer firmware silently ignores it. `APPLICATIONS.md`:
  "Samsung removed the API previously used to fetch installed apps directly from the plugin."
  Issue #424 (2026 S90H): "the TV never responds" while remote keys keep working; the library's
  issue #105 reports the same. Reported for 2022+ models.
- Everything else (`ms.channel.clientConnect`, `ed.edenTV.update`) is TV-pushed, not a request.
  Key presses are excluded (state change).

## Decision

Do NOT implement a Samsung heartbeat or `isConnectionAlive`. Using `ed.installedApp.get` would, on
any newer TV, report a perfectly healthy socket dead after 2 missed replies and tear it down every
40 seconds, which is worse than today's behavior. A guessed alternative would be an invented
endpoint, which is not acceptable. `isConnectionAlive` is optional on `DeviceDriver`, and omitting it
already means "reconnect as before", so the driver stays honest. Skipping a redundant reconnect
without proof of life is not safe: it would trade churn for possible stale "connected" state.

## Consequences

- Samsung keeps reconnecting on foreground and can still show "connected" over a silently dead
  socket until a key press fails. Accepted, unchanged from before.
- Revisit if a Samsung TV becomes available: capture real traffic, look for any message the TV sends
  on a fixed cadence, or a request that answers on the actual model (still unverified on hardware).
  A passive "no inbound traffic" heuristic is not viable because an idle TV sends nothing.
- No tests changed; suite unaffected.
