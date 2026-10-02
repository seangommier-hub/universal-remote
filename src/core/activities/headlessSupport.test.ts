import { Activity } from "../types/Activity";
import { headlessProblem, unsupportedHeadlessSteps } from "./headlessSupport";

const DRIVERS: Record<string, string> = { lg: "lg-webos-wss3001", sony: "sony-bravia", roku: "roku-ecp", kasa: "kasa-plug", shelly: "shelly-relay", samsung: "samsung-tizen" };
const driverIdOf = (deviceId: string) => DRIVERS[deviceId];

test("delays always run, and power-off on every supported driver runs", () => {
  expect(headlessProblem({ kind: "delay", ms: 5 }, driverIdOf)).toBeNull();
  for (const device of ["lg", "sony", "roku", "kasa", "shelly"]) {
    expect(headlessProblem({ kind: "command", deviceId: device, capability: "powerOff" }, driverIdOf)).toBeNull();
  }
});

test("toggle power is allowed through (the runner guards it with an is-on check)", () => {
  expect(headlessProblem({ kind: "command", deviceId: "sony", capability: "power" }, driverIdOf)).toBeNull();
});

test("an unsupported driver, unknown device or other capability is reported with a reason", () => {
  expect(headlessProblem({ kind: "command", deviceId: "samsung", capability: "powerOff" }, driverIdOf)).toMatch(/samsung-tizen.*cannot run on a schedule/);
  expect(headlessProblem({ kind: "command", deviceId: "ghost", capability: "powerOff" }, driverIdOf)).toMatch(/not known to the Pi/);
  expect(headlessProblem({ kind: "command", deviceId: "lg", capability: "setVolume" }, driverIdOf)).toMatch(/setVolume cannot run on a schedule/);
  expect(headlessProblem({ kind: "waitFor", deviceId: "samsung", stateKey: "power", equals: "off", timeoutMs: 1000 }, driverIdOf)).toMatch(/samsung-tizen/);
});

// ADR-HEARTH-206: launchApp joined power/powerOff in HEADLESS_COMMAND_CAPABILITIES (also gates a
// physical remote's button-event execution, adr/0257 -- someone pressing Netflix on the remote in
// the room is never actually "unattended" the way a 3am schedule is, but it shares this exact
// allow-list rather than a second execution path). Opening an app is low-risk/reversible, unlike
// most other capabilities this list still excludes.
test("launchApp on a supported driver runs; on an unsupported driver it's still blocked", () => {
  expect(headlessProblem({ kind: "command", deviceId: "roku", capability: "launchApp" }, driverIdOf)).toBeNull();
  expect(headlessProblem({ kind: "command", deviceId: "samsung", capability: "launchApp" }, driverIdOf)).toMatch(/samsung-tizen.*cannot run on a schedule/);
});

test("unsupportedHeadlessSteps lists each blocked step by index", () => {
  const activity: Activity = {
    id: "a",
    name: "Bedtime",
    version: 1,
    updatedAt: "",
    steps: [
      { kind: "command", deviceId: "lg", capability: "powerOff" },
      { kind: "command", deviceId: "samsung", capability: "powerOff" },
      { kind: "delay", ms: 1 },
      { kind: "command", deviceId: "lg", capability: "setVolume" },
    ],
  };
  expect(unsupportedHeadlessSteps(activity, driverIdOf).map((step) => step.index)).toEqual([1, 3]);
});
