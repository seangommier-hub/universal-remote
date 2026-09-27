# ADR-HEARTH-183: Keep-awake while a remote is open, and a startup-perf audit

**Date:** 2026-09-27
**Status:** Accepted, implemented (keep-awake); perf audit — one item done, two deferred with reasoning.

## Context

ADR-HEARTH-158 (Tier 2, item 8) named five things: keep-awake, a live connection pill with
one-tap reconnect, a VoiceOver/Dynamic Type audit, touchpad mode, and favorites. The VoiceOver/
Dynamic Type audit already shipped separately (ADR-HEARTH-180). This ADR is scoped to exactly what
this session was asked to build: **keep-awake while the remote is open**, plus a **startup/perf
audit** (lazy imports, a device-state snapshot cache on remount, and whether UniversalTvRemote.tsx
would benefit from a re-render-driven component split). The connection pill's one-tap reconnect
already exists (`reconnectCard`'s "Try Now" button, unchanged here); a persistent "live" pill,
touchpad mode, and favorites are unbuilt and out of scope for this ticket.

## Decision A: Keep-awake, scoped to an open remote screen

`expo-keep-awake` (`~57.0.1`, matching this project's existing `~57.0.x` pin convention for every
other `expo-*` package) was added as a direct dependency — it was already present only as a nested
transitive dependency of `expo` itself (`node_modules/expo/node_modules/expo-keep-awake`), not
resolvable from application code without being declared directly.

`src/ui/useKeepScreenAwake.ts` calls `activateKeepAwakeAsync`/`deactivateKeepAwake` (the
non-deprecated pair; `activateKeepAwake` is deprecated in this SDK version) with one shared tag
(`hearth-remote-screen`) inside a mount/unmount-only `useEffect`. It is called once, at the top of
`UniversalTvRemote`. Scoping: `DevicesTabScreen.tsx` renders `UniversalTvRemote` only while
`screen.name === "remote"`, keyed by `screen.device.id` (a real, pre-existing key that already
forces an unmount/remount on any device change) — a plain conditional render, not a stack
navigator, so this component's own mount lifecycle already *is* "the remote is focused/open," and
its unmount already *is* "navigated back to the Devices list." No focus/blur event plumbing was
needed; the existing screen-swap in `DevicesTabScreen.tsx` was not touched. The Devices list,
Activities, and settings screens never mount `UniversalTvRemote`, so they never call this hook —
verified by reading `DevicesTabScreen.tsx`'s render, not assumed.

A rejected platform call (e.g. an unsupported environment) is logged via the existing `logger` and
otherwise swallowed — a stuck screen timeout is a minor convenience gap, not something worth
surfacing as an error to someone trying to use the remote.

**Not applied to** `LightControlScreen.tsx`/`VacuumControlScreen.tsx` (the other two screens
`DevicesTabScreen.tsx` can route `screen.name === "remote"` to). The ticket named
`UniversalTvRemote.tsx` specifically, and a lighting/vacuum control session is a different
interaction shape (often glanced at, not held and watched the way a TV remote is) — flagged here as
a real scoping choice, not an oversight, in case Sean wants it extended to those two screens too.

**Testing**: this project's established pattern for hooks (`useSwipeBackGesture.ts`/
`useNowPlaying.ts`, both noting the same thing) is to extract the real logic into plain functions
and test those directly, since a bare mount/unmount `useEffect` isn't independently verifiable
without React rendering infrastructure this project doesn't otherwise use for hooks. Followed here:
`activateRemoteKeepAwake`/`deactivateRemoteKeepAwake` take an injected `KeepAwakeControls` (a real
fake, not `expo-keep-awake` itself) and are covered by `useKeepScreenAwake.test.ts` — asserting the
shared tag is used, and that a rejected platform call is caught rather than thrown.

## Decision B: Snapshot-on-remount — already correct, not changed

Checked concretely rather than assumed: `UniversalTvRemote`'s state is
`useState<DeviceState>(() => stateStore.get(device.id))` — a synchronous initializer, read before
any subscription or network refresh runs. `StateStore` (`src/core/state/StateStore.ts`) is a plain
in-memory `Map<deviceId, DeviceState>`; `get()` returns whatever the last `set()`/`patch()` wrote,
with no dependency on whether a listener is currently subscribed. `App.tsx` creates the whole
runtime (and therefore this one `StateStore` instance) exactly once via
`useMemo(() => createHearthRuntime(), [])`, so it lives for the app's entire foreground lifetime,
not per-screen. Reopening a device's remote screen after visiting the Devices list therefore
already shows the last-known values instantly, before the "auto-reconnect on open" effect's next
update lands — this was true before this session, not a change made here.

Locked in with a new direct test, `src/core/state/StateStore.test.ts` (the class has none): a
`get()` after `patch()`, with the one-time subscriber already unsubscribed, still returns the
patched value — the exact shape of "screen unmounted, state store outlives it, screen remounts and
reads it back."

## Decision C: Driver lazy-loading — deferred, not done

Audited (`bootstrap.ts`'s `createHearthRuntime()`): 22 driver classes are imported at the top of the
file and unconditionally `new`'d on every app launch, regardless of which brands a household
actually owns. This is a real candidate for "defer cost until first use" — but concretely:

- **No driver constructor or driver-module top level does expensive synchronous work.** Every
  `id` field is a plain string constant (`id = LG_WEBOS_DRIVER_ID`, etc.); grepping every file under
  `src/drivers` for a `.json` import or a `require(...)` found none. The largest driver file
  (`LgWebOsDriver.ts`, 827 lines) is almost entirely method bodies, which cost nothing to evaluate
  until called — only class-field initialization runs at construction time, and that's trivial
  everywhere audited.
- **React Native ships one Hermes bundle for native builds — there is no per-platform code
  splitting the way a web bundler has.** An inline/dynamic `require()` only changes *when* a
  module's top-level statements execute (deferred to first call), not what ships in the bundle or
  how long Hermes takes to parse it. Given the point above, that deferred cost is close to zero for
  every driver here.
- **No existing precedent to extend safely.** The only lazy-load pattern in this codebase today is
  `useBumpSensor.ts`'s guarded `require("expo-sensors")` — used for build-compatibility (a build
  without the native module would otherwise crash on import), not for startup perf, and it does not
  touch a shared, synchronously-called registry the way drivers would.
- **The risk side is real and disproportionate to an unmeasured gain.** `DriverRegistry.get()` is
  called synchronously from `App.tsx` (4 call sites), `CommandEngine`, `reconnectAllDevices.ts`,
  `addDeviceFlow.ts`, and at least 10 `Add*DeviceScreen.tsx` files. Keeping `.get()` synchronous
  while deferring construction is possible (an inline `require()` per driver inside a lazy factory,
  same trick as `useBumpSensor.ts`), but every one of those 22 registrations, plus
  `DriverRegistry`'s own public contract, would have to change to prove a savings this audit's own
  evidence says is negligible.

No profiler was available to measure this on a real device this session (same limitation ADR-179
already recorded for its own latency numbers). Given the concrete evidence above rather than a
guess, this is deferred, not implemented — revisit only if a specific driver is later found to do
real work at construction time (e.g. an added catalog lookup), which none currently do.

## Decision D: Splitting `UniversalTvRemote.tsx` for re-render cost — deferred, not done

The file is 1547 lines (well past this project's 500-line file guideline) but the ticket scoped a
split specifically to a demonstrated re-render win, not the line count alone — and that win isn't
there to demonstrate:

- The component already avoids the main wasteful case structurally: the "remote" tab, the "keypad"
  tab, and the "keyboard" tab are each gated by `{condition && (...)}`, so **only the active tab's
  JSX is ever constructed** — typing in the keypad or keyboard tab (`channelInput`/`keyboardInput`
  state, updated per keystroke) never re-creates the d-pad/hub/streaming/utility row elements at
  all, because that block is absent from the returned tree while a different tab is active, not
  merely hidden by style. This was verified by reading the conditional structure, not assumed.
- The remaining case — the "remote" tab's own subtree re-rendering whenever `state` updates (a
  periodic heartbeat or a command's optimistic patch) — is bounded by the size of that subtree
  (roughly 30 button-shaped elements) and by how often `state` actually changes (once per heartbeat
  interval or real command, not per frame). No React DevTools profiler was available against a real
  device or simulator this session to measure this concretely, and reasoning alone doesn't show it
  crosses a threshold worth caring about: nothing here does per-render work heavier than a handful
  of `Array.filter`/`.map` calls over small (≤7-item) arrays.
- A split that actually reduced this further would need every inline `onPress={() => send(...)}`
  closure stabilized (`useCallback`, capturing `device`/`controlsDisabled`/`scale` by value) before
  `React.memo` on any extracted child could skip a re-render at all — new closures every render
  defeat memoization regardless of how the JSX is split into files. That's a materially bigger,
  higher-risk change than a file-organization split, and this ticket's own instruction was not to
  guess into a change of that size without a measured reason.

Deferred, not implemented. The file's length is real and worth a follow-up on its own terms (module
boundaries, not re-render cost) — flagged separately rather than folded into this perf ticket.

## Verification

- `npx tsc --noEmit`: see command output for this session.
- `npx jest --silent --testPathIgnorePatterns="node_modules"`: see command output for this session.
- `node scripts/ui-verify/run.mjs`: remote-page overflow assertions unchanged (no layout/height
  edited on any remote screen).

## Consequences

- `package.json` gained one new direct, pinned dependency (`expo-keep-awake`); `package-lock.json`
  updated by `npm install` to match (previously a nested-only nested dependency of `expo`, so no new
  transitive package was actually downloaded).
- ADR-HEARTH-158 Tier 2 item 8: keep-awake is done; the VoiceOver/Dynamic Type audit was already
  done (ADR-HEARTH-180); the connection pill's one-tap reconnect already existed pre-ticket;
  touchpad mode and favorites remain unbuilt.
