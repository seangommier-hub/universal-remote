# ADR-HEARTH-188: Split SonyBraviaDriver.ts to bring it under the 500-line guideline

**Date:** 2026-09-27
**Status:** Accepted, implemented. Pure refactor — no runtime behavior change.

## Context

ADR-HEARTH-179's latency fix pushed `src/drivers/tv/sony/SonyBraviaDriver.ts` to 529 lines,
over this project's 500-line-per-file guideline (AGENTS.md/CLAUDE.md, ADR-GLOBAL-003). The file
already delegated the raw REST/IRCC-IP protocol calls to `SonyBraviaClient.ts`/`SonyIrccClient.ts`
(the same "Driver + Client" split `LgWebOsDriver.ts`/`LgWebOsClient.ts` and
`DenonDriver.ts`/`DenonClient.ts` use), so what remained oversized was the driver's own
orchestration: connection/reconnect state, self-healing, and the `applyCommand` capability
switch mapping each command to its REST/IRCC-IP call.

## Decision

Extract the capability -> Sony REST/IRCC-IP command-mapping logic into a new module,
`src/drivers/tv/sony/SonyBraviaCommandMapping.ts`, following the same "command mapping in its
own file" pattern this codebase already uses for Home Assistant
(`src/drivers/homeAssistant/haCommandMapping.ts`).

Moved to the new module (unchanged, copy-pasted verbatim except for `export`/import wiring):
- `applyCommand()` — the `switch (command.capability)` that builds each REST/IRCC-IP call.
- `requireConfig()` — reads/validates `{ipAddress, psk}` from `Device.config`, used by
  `applyCommand`'s IRCC branches (`directionalNavigation`/`select`/`back`/`home`) as well as by
  several driver methods, which now import it back.
- `CommandOutcome`, `PowerStatus`, `VolumeInfo` — the interfaces `applyCommand` and the driver's
  own `fetchLiveState`/`refreshState` both need; exported and imported back by the driver.
- `DIRECTION_TO_IRCC_CODE`, `parseHdmiInput`, `resolveInputUri`, `VOLUME_STEP` — private to
  command mapping, not used elsewhere in the driver.

Left in `SonyBraviaDriver.ts` (not part of "which call to make for a command", so out of scope
for this module):
- `ExternalInputStatus`, `SystemInformation` — response shapes for `refreshInputList`/
  `refreshDeviceName`, read only at `connect()` time, not per-command.
- `isReachabilityFailure()` — used by `executeCommand`'s catch block, not by `applyCommand`.
- All connection/reconnect/self-heal/wake-on-LAN state machine methods (`refreshState`,
  `fetchLiveState(WithSelfHeal)`, `scheduleReconnect`, `startWakeBurst`, `executeWakeOnLan`,
  `markConnected`, `markUnreachableAfterCommandFailure`) — these already delegate the actually
  reusable self-healing/backoff/wake-burst logic to shared modules
  (`src/drivers/shared/selfHeal.ts`, `backoffJitter.ts`, `wakeBurst.ts`,
  `core/network/wakeOnLan.ts`); what's left is driver-local state-machine glue tightly coupled to
  this driver's own `Map`-based state (`states`, `generations`, `reconnectTimers`), not a
  self-contained piece worth its own file for this pass.

No public surface changed: `SonyBraviaDriver`, `SONY_BRAVIA_DRIVER_ID`, and the `DeviceDriver`
interface it implements are untouched, so nothing outside these two files needed a change.

## Result

| File | Before | After |
|---|---|---|
| `SonyBraviaDriver.ts` | 529 | 414 |
| `SonyBraviaCommandMapping.ts` (new) | — | 131 |

Both files are now under the 500-line guideline, each with a one-line file-level docstring.

## Verification
- `npx tsc --noEmit`: clean.
- `npx jest --silent --testPathIgnorePatterns="node_modules"`: same result as ADR-HEARTH-179 left
  it — every suite passes except the one pre-existing, unrelated failure in
  `runner/shims/shims.test.ts` (`ws`'s `WebSocketServer` constructor issue in the Node
  test-runner shim). `SonyBraviaDriver.test.ts`, `SonyBraviaClient.test.ts`, and
  `SonyIrccClient.test.ts` (35 tests) all pass unmodified — no test file needed a single change.
- `src/drivers/driverContract.test.ts` and `src/drivers/contract/relayRecovery.test.ts`: both
  pass unmodified.

## Consequences
- No behavior change: this is a pure move of existing code (and its existing comments/ADR
  references) into a second file, with no logic rewritten.
- Future Sony command-mapping changes (a new capability, a corrected IRCC code) touch
  `SonyBraviaCommandMapping.ts` only; connection/reconnect changes touch `SonyBraviaDriver.ts`
  only — smaller, more focused diffs for each kind of change.
- Sets a precedent other oversized drivers (e.g. `LgWebOsDriver.ts`, 827 lines) could follow in a
  future pass; not done here since it was out of scope for this ADR.
