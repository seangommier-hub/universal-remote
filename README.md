# Hearth

One home. One remote. A cross-platform (iOS/Android) universal remote and
smart-home control app — a single interface for TVs, streaming devices,
audio, lighting, climate, and robot vacuums, regardless of manufacturer.

## Status

Foundation stage with four **real** drivers: Sony BRAVIA and Samsung Tizen
and LG webOS TVs (the latter two over WebSocket, unencrypted port only),
plus Roku (streaming devices and Roku TVs, official ECP, no pairing/TLS at
all) — plus two mock drivers that proved the abstraction before real ones
existed. None of the four real drivers have been validated against actual
hardware yet. See `ROADMAP.md` for what's done and what's next, and
`ARCHITECTURE.md` for how it fits together.

## Setup

```bash
npm install
npm start
```

Scan the printed QR code with **Expo Go** on your iPhone (confirmed working
against Expo SDK 57 — see `adr/ADR-HEARTH-003`). You'll see a device list
with two simulated TVs, plus "+ Add Sony TV" / "+ Add Samsung TV" / "+ Add
LG TV" / "+ Add Roku" buttons to pair a real one by IP (Sony also needs its
IP Control PSK). Tapping any device opens a remote screen whose buttons are
generated from that device's declared capabilities — real devices show
fewer buttons than the mocks, honestly, because their drivers can't do
everything yet (see `ARCHITECTURE.md`).

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # jest (jest-expo preset)
```

## Known limitations (current stage)

- Sony, Samsung, LG, and Roku drivers are real but unvalidated against actual hardware — see `ROADMAP.md`. Roku's is the simplest and most likely to work exactly as written (official docs, no pairing/TLS).
- Samsung and LG only work if the TV still accepts their unencrypted WebSocket port (`ws://8001` / `ws://3000`); newer firmware may only accept the encrypted, self-signed-cert path, which React Native's `WebSocket` can't use without a native module (see ADR-HEARTH-005, ADR-HEARTH-006). LG's unencrypted window is narrower — roughly pre-2018 TVs only.
- Samsung's device state is optimistic/assumed (protocol has no query API). LG's volume/mute state is read back for real but uses inferred field names, not officially documented ones. Roku's power state is read back for real from officially-documented fields.
- No real driver supports every capability the mocks do — Sony has no directional nav/menu (needs unresearched IRCC-IP), Samsung/LG have no input switching (protocol limitations, Roku does have it), LG/Roku can't turn a device on (only off).
- Paired devices now survive app restart (ADR-HEARTH-008: AsyncStorage + SecureStore split). Live device *state* still resets each launch and is re-fetched on reconnect — that part isn't persisted, by design.
- Samsung/LG's pairing token isn't persisted yet, so those two still need a fresh on-screen approval every app restart even though the device entry itself is remembered.
- No auto-discovery, rooms, scenes, or automations yet — only manual-IP pairing.
- No navigation library yet (screens toggled by local state) — added once justified.
- Local network device *discovery* (a near-term need) requires an Expo Development Build; plain Expo Go will not support it. See `docs/EXPO_COMPATIBILITY.md`.

## Docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — layering, what's built vs. planned
- [`ROADMAP.md`](./ROADMAP.md) — granular task list
- [`docs/DEVICE_FEASIBILITY.md`](./docs/DEVICE_FEASIBILITY.md) — researched feasibility matrix per device ecosystem
- [`docs/EXPO_COMPATIBILITY.md`](./docs/EXPO_COMPATIBILITY.md) — what works in Expo Go vs. requires a Dev Build/native module
- [`adr/`](./adr/) — decisions made and why; read before changing anything they cover
