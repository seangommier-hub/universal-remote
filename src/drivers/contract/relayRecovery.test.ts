// ADR-HEARTH-145 bug #1 (fixed by ADR-HEARTH-171 with an expiring relay-only memory): the shared HTTP layer remembers "this address needs the relay" after ANY
// direct failure, even a device that was merely switched off. Without Family Command Center
// configured the relay cannot help, so once a device has blipped, every later request (including
// every driver retry) fails without ever trying the direct path again until the app restarts.

import { requestWithRelayFallback, resetRelayNecessityCacheForTests } from "../../core/network/httpRelayFallback";
import { contractNetwork, installContractNetwork } from "../../testUtils/contractNetwork";

jest.mock("../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(async () => require("../../testUtils/contractNetwork").contractNetwork.fccConfig),
}));

const RELAY_MEMORY_EXPIRY_MS = 60_000;
const REQUEST = { ip: "192.168.1.80", port: 8060, path: "/query/device-info", method: "GET" } as const;

describe("requestWithRelayFallback recovery after a transient direct failure", () => {
  beforeEach(() => {
    installContractNetwork();
    resetRelayNecessityCacheForTests();
    contractNetwork.responder = () => ({ text: "ok" });
  });

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("within the memory window a failed address skips the direct attempt", async () => {
    contractNetwork.mode = "refuse";
    await expect(requestWithRelayFallback(REQUEST)).rejects.toThrow();

    contractNetwork.mode = "up";
    const attemptsBefore = contractNetwork.requestUrls.length;
    await requestWithRelayFallback(REQUEST).catch(() => undefined);
    expect(contractNetwork.requestUrls.slice(attemptsBefore).some((url) => url.startsWith("http://192.168.1.80"))).toBe(false);
  });

  test("a device that was briefly off is reachable directly again once the memory expires, with no relay configured", async () => {
    contractNetwork.mode = "refuse";
    await expect(requestWithRelayFallback(REQUEST)).rejects.toThrow();

    contractNetwork.mode = "up";
    jest.advanceTimersByTime(RELAY_MEMORY_EXPIRY_MS);
    const attemptsBefore = contractNetwork.requestUrls.length;
    const response = await requestWithRelayFallback(REQUEST).catch((error: Error) => error);

    expect(contractNetwork.requestUrls.length).toBeGreaterThan(attemptsBefore);
    expect(response).not.toBeInstanceOf(Error);
  });
});
