# ADR-HEARTH-151: Headless driver runner spike (run the Hearth drivers under Node on the Pi)

Date: 2026-09-26
Status: Accepted as a spike. Nothing is installed or scheduled; this records feasibility and the path to production.

## Context
Every device command is executed by the phone with the TypeScript drivers in `src/drivers/**`; the Pi only relays. So nothing can happen with no phone open: no schedules ("TVs off at 9pm for the kids"), no "TV left on 12 hours" alerts, no server-side Activities. If the real drivers run headless under Node on the Pi, one shared executor could power all three.

## Verdict: FEASIBLE (with caveats)
The unmodified driver, command-engine and state-store code ran under Node 22 on the Pi and drove Sean's real LG TV. `src/` was not touched. The caveats are scope (only LG proven live), self-signed TLS, and the production work listed below.

## What was built (`runner/`, separate package, own tsconfig; app `tsc` and `jest` unaffected)
- `build.mjs`: esbuild bundle of `runner/main.ts` + the real `createHearthRuntime()` into one `dist/hearth-runner.cjs` (about 360 KB, `ws` bundled, no node_modules needed on the Pi). A resolve plugin swaps the RN/Expo modules for shims; anything unresolved fails the build, so it doubles as a detector.
- `executor.ts`: `DeviceExecutor` wraps the real `CommandEngine`, connects each device lazily on first command (deduped), reuses `bridgeDeviceState`, returns failures as `CommandResult`, optional eager connect so heartbeats and reconnect loops run without traffic.
- `httpApi.ts`: `POST /execute {device, command:{capability,args}}` -> `CommandResult`, `GET /state/:deviceId`, `GET /devices`. Bound to 127.0.0.1, 64 KB body cap.
- `devicesFile.ts`: reads a device array or the household sync file (`~/.hearth-device-sync.json`) as-is.
- `runnerConfig.ts`: FCC `{baseUrl, token, publicBaseUrl}` from a JSON file and/or env (`HEARTH_FCC_TOKEN_FILE` supported); default `http://localhost:3210`; no token means direct-to-device only.
- Tests (`runner/**/*.test.ts`): shims, config, devices file, executor, HTTP API.

## Exact shim list
Every non-relative import in `src/drivers/**`, `src/core/**`, `src/runtime/**` and `src/discovery/**` (non-test):

| Import | Where | Runner treatment |
|---|---|---|
| `@react-native-async-storage/async-storage` | `familyCommandCenterConfig`, `persistence`, `scenePersistence`, `familyCommandCenterClientLog` | `shims/asyncStorage.ts` (in-memory or 0600 file). Not on the driver path: the config module below is replaced. |
| `expo-secure-store` | `familyCommandCenterConfig`, `persistence` | `shims/secureStore.ts` (same store class, 0600 file). Same note. |
| `src/discovery/familyCommandCenterConfig` (module swap) | `wakeOnLan`, `httpRelayFallback`, `wsRelayFallback`, `fccRequest`, drivers | `shims/fccConfig.ts`, fed by `runnerConfig.ts`. This is the config seam; keychain keys are not duplicated. |
| `expo-crypto` (`randomUUID`) | `SwitchBotClient`, bump, client log | `shims/expoCrypto.ts` -> `node:crypto`. |
| global `WebSocket` | `wsRelayFallback` (LG, Samsung), `RfbClient` (VNC) | `shims/nodeWebSocket.ts`: `ws` subclass. Needed because Node's built-in WebSocket cannot skip certificate verification and LG/Samsung speak wss with a private CA. Verification is skipped only for private-LAN/loopback hosts; the public tunnel stays verified. |
| `react-native`, `expo-updates`, `react-native-udp`, `expo-network` | `clientLogShipper`, `appUpdates`, `SsdpDiscoveryProvider`, `networkReconnectPolicy` (type only), `familyCommandCenterClientLog` | Not reachable from `bootstrap.ts`; mapped to `unsupportedModule` (throws on use) so an accidental dependency is loud, not silent. |

Everything else (`fetch`, `AbortController`, `TextEncoder/Decoder`, timers, `@noble/hashes`) is standard or pure JS. `logger` is console-backed and needed nothing. `logBuffer` is in-memory and harmless.

## Per-driver findings (static; only LG was run live)
- LG, Samsung: wss with self-signed cert -> needs the `ws` shim (done, proven for LG). Samsung uses the same path but is untested.
- Kasa, Xbox (power-on), Wake-on-LAN, SmartThings, PS5, Apple TV, Chromecast, Broadlink: talk to Family Command Center HTTP endpoints (raw TCP/UDP is done by FCC). Work in Node unchanged but need the FCC token in the runner config; they hit `localhost:3210` on the Pi. Not run.
- Roku, Hue, Denon, Yamaha, Sonos, Sony, Squirrel Feeder: plain HTTP/TCP-over-HTTP via `httpRelayFallback` (direct first, FCC relay second). No RN APIs. Not run. Note Roku "Luca's Office" is at 10.20.30.237, a different subnet from the Pi's LAN address; reachability from the Pi is unverified.
- SwitchBot vacuum: vendor cloud API; only `expo-crypto` randomUUID and pure-JS HMAC. Fine.
- VNC input relay (`RfbClient`): uses global WebSocket; works via the shim but is UI-driven, not a runner concern.
- Route memory (`fccConnectivity`, `directFailedAt`) is per-process state: harmless on the Pi (always "home").
- No driver imports React or any UI code. No RN-only API was found in any driver.

## Live proof on the Pi (LG 192.168.1.218, ~/hearth-runner/, run by hand, then killed)
Devices file: the existing `~/.hearth-device-sync.json` (0600) read in place; the clientKey was never printed or copied. No FCC token was supplied, so the LG connected directly (no relay).
- Cold `volumeUp` including lazy connect + SSAP pairing with the saved key: 619 ms.
- Warm commands over the persistent socket: 20 to 95 ms (typically about 25 to 60 ms). Five up/down pairs, net volume change zero.
- Socket destroyed (network-drop simulation): driver's own backoff reconnected in 2268 ms, next commands 58 ms and 95 ms.
- Socket stalled silently (no close event, heartbeat only): the existing `startConnectionHeartbeat` declared it dead and reconnected in 44.6 s (two 20 s heartbeats plus reconnect). Commands worked afterward.
- Observed, not caused by the runner: `getForegroundAppInfo` 404 warning (a known 2020-firmware limitation documented in LgWebOsDriver.ts); `state.values.volume` stayed undefined in `/state` after commands, so the volume read-back is best-effort/inferred in the driver and must not be relied on for automation logic without a check.
- Process listened only on 127.0.0.1:3220. Left nothing running; no systemd unit touched.

## Running it under systemd
`runner/deploy/hearth-runner.service` (not installed): runs `node hearth-runner.cjs` as the existing `seangommier` user, `Restart=always`, eager connect, `After=` FCC. Hardened: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome=read-only`, write access only to `~/hearth-runner`, no capabilities, INET sockets only, `MemoryMax=256M`. Deploy is `scp` of the single `.cjs`; no install step on the Pi.

## Feeding it device configs safely
- Pairing keys already sit in `~/.hearth-device-sync.json` (0600, owner-only). The runner reads that file directly rather than copying keys anywhere; it is the source of truth the phones already sync through. A dedicated runner-only devices file is an option if we want to expose only a subset.
- Keys learned by an auto-reconnect while running (a re-pair) currently live only in memory (phones persist them via `onConnected` in the app). Production needs a write-back to the sync file, atomically, through FCC's sync endpoint so phones and runner do not race.
- The FCC token is supplied via a systemd credential (`LoadCredential`), read from a file, never via environment or command line.

## Security considerations
- API is loopback only and unauthenticated. Any local process (including anything compromised on the Pi) can turn devices off. Production: a unix socket or a shared secret header, and the scheduler and alert engine live in-process or in a sibling service rather than exposing more HTTP.
- TLS verification is disabled for private-LAN wss targets, an inherent property of these TVs (same as FCC's relay today), and is not extended to public hosts.
- The runner holds every device's pairing key and can act with no phone and no human. Schedules must be an explicit allow-list of (device, capability), with rate limits and an audit log; "TV left on" alerts are read-only.
- The bundle includes a `KeyValueStore` that writes 0600 via temp file and rename; if used, keep it out of the repo and backups.
- Logs: the drivers log the raw `getExternalInputList` response and pairing status. No client key appeared in the run log, but this needs an audit before the log is shipped anywhere.

## Effort estimate to production-grade (schedules + "TV left on" alerts)
About 6 to 9 working days:
1. Driver coverage: run Samsung, Sony, Roku (subnet check), Kasa via FCC, Hue/Denon/Yamaha/Sonos on real hardware; fix what breaks (1.5 to 2 days).
2. Auth + transport hardening (unix socket or secret), audit log, key write-back through the sync endpoint (1 to 1.5 days).
3. Scheduler: schedule store shared with the phone UI, timezone/DST correctness, missed-run policy after a reboot, dedupe if a phone also fires (2 to 3 days).
4. "Left on" monitor: reliable power-state polling per driver (LG power state is optimistic today; volume read-back undefined), thresholds, push delivery to phones (1.5 to 2 days).
5. systemd install, health endpoint, log rotation, deploy script, runbook, CI for `runner/` build and tests (1 day).
Largest risk: trustworthy power state per device, because several drivers infer it rather than read it. Activities need the same executor plus sequencing and per-step verification (add 2 to 3 days).

## Decisions
- Reuse the real drivers via a bundler with module swaps rather than forking or porting them: one code path, zero divergence.
- Replace the config module (not the storage modules) as the seam, so keychain key names stay owned by `src/`.
- `ws` over Node's built-in WebSocket, for private-CA TLS.
- Runner lives in top-level `runner/` with its own `package.json`, excluded from the app build and its native dependency graph.

## Consequences
- The runner is a second consumer of `src/drivers/**`. A future driver that imports an RN/Expo module reachable from `bootstrap.ts` will break the runner build (by design: that is the early warning). Add a shim or an `unsupportedModule` mapping when it happens.
- `runner/` needs `npm install` in that directory to build; the app does not.
