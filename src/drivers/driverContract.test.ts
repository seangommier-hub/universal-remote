// Driver connection contract (ADR-HEARTH-145). The same behavioral assertions run against every
// driver through a fake fetch/WebSocket (src/testUtils/contractNetwork.ts), so a connection bug
// found on real hardware in one driver is checked against all of them. Deliberate per-driver
// differences live in src/drivers/contract/adapters.ts (the `exemptions` of each adapter).

import { DeviceDriver } from "../core/drivers/DeviceDriver";
import { Device } from "../core/types/Device";
import { resetRelayNecessityCacheForTests } from "../core/network/httpRelayFallback";
import { resetDirectFailureMemoryForTests } from "../core/network/wsRelayFallback";
import { contractNetwork, dropAllSockets, installContractNetwork, networkAttemptCount } from "../testUtils/contractNetwork";
import { DriverAdapter, DRIVER_ADAPTERS, FCC_TEST_CONFIG } from "./contract/adapters";
import { ContractCaseId } from "./contract/exemptions";

jest.mock("../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(async () => require("../testUtils/contractNetwork").contractNetwork.fccConfig),
}));
jest.mock("../discovery/familyCommandCenterDeviceLookup");
jest.mock("../core/network/wakeOnLan");

/** A connect()/command must settle (resolve or reject) within this window, or it hung. */
const CONNECT_BOUND_MS = 120_000;
const COMMAND_BOUND_MS = 30_000;
/** Longer than the 30s backoff cap: enough for any pending retry to have fired. */
const RETRY_WINDOW_MS = 60_000;
const IDLE_WINDOW_MS = 10 * 60_000;
const CONCURRENT_CONNECTS = 5;
const SILENT_DEATH_WINDOW_MS = 3 * 60_000;

interface Outcome {
  state: "pending" | "resolved" | "rejected";
  error?: unknown;
}

/** Tracks a promise while advancing fake time by `ms`, so a hang shows up as state "pending". */
async function settleWithin(promise: Promise<unknown>, ms: number): Promise<Outcome> {
  const outcome: Outcome = { state: "pending" };
  promise.then(
    () => {
      outcome.state = "resolved";
    },
    (error) => {
      outcome.state = "rejected";
      outcome.error = error;
    }
  );
  await jest.advanceTimersByTimeAsync(ms);
  return outcome;
}

interface Harness {
  driver: DeviceDriver;
  device: Device;
}

function prepare(adapter: DriverAdapter): Harness {
  installContractNetwork();
  resetRelayNecessityCacheForTests();
  resetDirectFailureMemoryForTests();
  contractNetwork.fccConfig = adapter.usesFcc ? FCC_TEST_CONFIG : undefined;
  contractNetwork.responder = adapter.responder ?? contractNetwork.responder;
  contractNetwork.socketProtocol = adapter.socketProtocol;
  return { driver: adapter.createDriver(), device: adapter.createDevice() };
}

async function connectedHarness(adapter: DriverAdapter): Promise<Harness> {
  const harness = prepare(adapter);
  const outcome = await settleWithin(harness.driver.connect(harness.device), RETRY_WINDOW_MS);
  expect(outcome.state).toBe("resolved");
  expect((await harness.driver.getState(harness.device)).connection).toBe("connected");
  return harness;
}

async function connectionOf({ driver, device }: Harness): Promise<string> {
  return (await driver.getState(device)).connection;
}

function contractCase(adapter: DriverAdapter, id: ContractCaseId, title: string, body: () => Promise<void>): void {
  const exemption = adapter.exemptions[id];
  if (!exemption) {
    test(title, body);
  } else if (exemption.kind === "by-design") {
    test.skip(`${title} [EXEMPT by design: ${exemption.reason}]`, body);
  } else {
    test.failing(`${title} [KNOWN BUG #${exemption.bug}: ${exemption.reason}]`, body);
  }
}

function defineUnreachableCases(adapter: DriverAdapter): void {
  for (const mode of ["hang", "refuse"] as const) {
    const id: ContractCaseId = mode === "hang" ? "connectHangRejects" : "connectRefuseRejects";
    contractCase(adapter, id, `connect() to a device that ${mode === "hang" ? "never answers" : "refuses"} rejects in bounded time and reports disconnected`, async () => {
      const harness = prepare(adapter);
      contractNetwork.mode = mode;
      const outcome = await settleWithin(harness.driver.connect(harness.device), CONNECT_BOUND_MS);
      expect(outcome.state).toBe("rejected");
      expect(await connectionOf(harness)).toBe("disconnected");
    });
  }
}

function defineRetryCases(adapter: DriverAdapter): void {
  contractCase(adapter, "retryAfterFailure", "after a failed connect a retry is scheduled and the driver reaches connected once the device answers", async () => {
    const harness = prepare(adapter);
    contractNetwork.mode = "refuse";
    const failed = await settleWithin(harness.driver.connect(harness.device), 1000);
    expect(failed.state).toBe("rejected");
    // Isolates the driver's own retry logic from the shared HTTP layer's "direct failed once, use the
    // relay forever" memory, which has its own regression test (relayRecovery.test.ts, bug #1).
    resetRelayNecessityCacheForTests();
    contractNetwork.mode = "up";
    await jest.advanceTimersByTimeAsync(RETRY_WINDOW_MS);
    expect(await connectionOf(harness)).toBe("connected");
  });

  contractCase(adapter, "disconnectCancelsRetries", "disconnect() cancels the pending retry: no state change, no network call, no leaked timer afterwards", async () => {
    const harness = prepare(adapter);
    contractNetwork.mode = "refuse";
    await settleWithin(harness.driver.connect(harness.device), 1000);
    const notifications: string[] = [];
    harness.driver.subscribeToState(harness.device, (_id, state) => notifications.push(state.connection));
    await harness.driver.disconnect(harness.device);
    const attemptsAtDisconnect = networkAttemptCount();
    const notificationsAtDisconnect = notifications.length;
    contractNetwork.mode = "up"; // a retry that wrongly survives would now succeed and flip the state
    await jest.advanceTimersByTimeAsync(IDLE_WINDOW_MS);
    expect(networkAttemptCount()).toBe(attemptsAtDisconnect);
    expect(notifications.length).toBe(notificationsAtDisconnect);
    expect(await connectionOf(harness)).toBe("disconnected");
    expect(jest.getTimerCount()).toBe(0);
  });

  contractCase(adapter, "disconnectDuringInflightConnect", "disconnect() while a connect is still in flight leaves no retry loop and does not resurrect the connection", async () => {
    const harness = prepare(adapter);
    contractNetwork.mode = "hang";
    const inFlight = settleWithin(harness.driver.connect(harness.device), 1);
    await inFlight;
    await harness.driver.disconnect(harness.device);
    await jest.advanceTimersByTimeAsync(CONNECT_BOUND_MS);
    const attemptsAfterInflightSettled = networkAttemptCount();
    contractNetwork.mode = "up";
    await jest.advanceTimersByTimeAsync(IDLE_WINDOW_MS);
    expect(networkAttemptCount()).toBe(attemptsAfterInflightSettled);
    expect(await connectionOf(harness)).toBe("disconnected");
    expect(jest.getTimerCount()).toBe(0);
  });
}

function defineDedupeCase(adapter: DriverAdapter): void {
  contractCase(adapter, "connectDedupe", `${CONCURRENT_CONNECTS} concurrent connect() calls make exactly one underlying attempt`, async () => {
    const baseline = prepare(adapter);
    await settleWithin(baseline.driver.connect(baseline.device), RETRY_WINDOW_MS);
    const singleAttemptCost = networkAttemptCount();

    const harness = prepare(adapter);
    const concurrent = Array.from({ length: CONCURRENT_CONNECTS }, () => harness.driver.connect(harness.device));
    const outcome = await settleWithin(Promise.all(concurrent), RETRY_WINDOW_MS);
    expect(outcome.state).toBe("resolved");
    expect(networkAttemptCount()).toBe(singleAttemptCost);
  });
}

function defineCommandCases(adapter: DriverAdapter): void {
  async function commandAgainstDeadDevice(mode: "hang" | "refuse"): Promise<{ harness: Harness; outcome: Outcome }> {
    const harness = await connectedHarness(adapter);
    contractNetwork.mode = mode;
    contractNetwork.socketsDeaf = true;
    const outcome = await settleWithin(harness.driver.executeCommand(harness.device, adapter.command), COMMAND_BOUND_MS);
    return { harness, outcome };
  }

  contractCase(adapter, "commandWhileHungRejects", "a command sent to a device that stopped answering rejects promptly instead of hanging", async () => {
    const { outcome } = await commandAgainstDeadDevice("hang");
    expect(outcome.state).toBe("rejected");
  });

  contractCase(adapter, "commandFailureMarksDisconnected", "a command that failed because the device is unreachable marks the driver disconnected", async () => {
    const { harness, outcome } = await commandAgainstDeadDevice("refuse");
    expect(outcome.state).toBe("rejected");
    expect(await connectionOf(harness)).toBe("disconnected");
  });
}

function defineSubscriptionCase(adapter: DriverAdapter): void {
  contractCase(adapter, "subscribeNotifies", "subscribers hear connected and disconnected transitions, and unsubscribe stops notifications", async () => {
    const harness = prepare(adapter);
    const seen: string[] = [];
    const unsubscribe = harness.driver.subscribeToState(harness.device, (_id, state) => seen.push(state.connection));
    await settleWithin(harness.driver.connect(harness.device), RETRY_WINDOW_MS);
    expect(seen).toContain("connected");
    await harness.driver.disconnect(harness.device);
    expect(seen[seen.length - 1]).toBe("disconnected");

    unsubscribe();
    const heardBeforeUnsubscribeTookEffect = seen.length;
    await settleWithin(harness.driver.connect(harness.device), RETRY_WINDOW_MS);
    await harness.driver.disconnect(harness.device);
    expect(seen.length).toBe(heardBeforeUnsubscribeTookEffect);
  });
}

function defineSocketCases(adapter: DriverAdapter): void {
  contractCase(adapter, "socketDropReconnects", "a socket that closes underneath a connected driver is reported disconnected and reconnects by itself", async () => {
    const harness = await connectedHarness(adapter);
    const attemptsBeforeDrop = networkAttemptCount();
    dropAllSockets();
    expect(await connectionOf(harness)).toBe("disconnected");
    await jest.advanceTimersByTimeAsync(RETRY_WINDOW_MS);
    expect(await connectionOf(harness)).toBe("connected");
    expect(networkAttemptCount()).toBeGreaterThan(attemptsBeforeDrop);
  });

  contractCase(adapter, "silentDeathDetected", "a socket that silently stops answering (no close event) is eventually reported disconnected", async () => {
    const harness = await connectedHarness(adapter);
    contractNetwork.mode = "hang";
    contractNetwork.socketsDeaf = true;
    await jest.advanceTimersByTimeAsync(SILENT_DEATH_WINDOW_MS);
    expect(await connectionOf(harness)).not.toBe("connected");
  });
}

describe.each(DRIVER_ADAPTERS)("driver contract: $name", (adapter) => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  defineUnreachableCases(adapter);
  defineRetryCases(adapter);
  defineDedupeCase(adapter);
  defineCommandCases(adapter);
  defineSubscriptionCase(adapter);
  if (adapter.persistentSocket) defineSocketCases(adapter);
});
