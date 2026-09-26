// ADR-HEARTH-145 bug #1: the shared HTTP layer remembers "this address needs the relay" after ANY
// direct failure, even a device that was merely switched off. Without Family Command Center
// configured the relay cannot help, so once a device has blipped, every later request (including
// every driver retry) fails without ever trying the direct path again until the app restarts.

import { requestWithRelayFallback, resetRelayNecessityCacheForTests } from "../../core/network/httpRelayFallback";
import { contractNetwork, installContractNetwork } from "../../testUtils/contractNetwork";

jest.mock("../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(async () => require("../../testUtils/contractNetwork").contractNetwork.fccConfig),
}));

const REQUEST = { ip: "192.168.1.80", port: 8060, path: "/query/device-info", method: "GET" } as const;

describe("requestWithRelayFallback recovery after a transient direct failure", () => {
  beforeEach(() => {
    installContractNetwork();
    resetRelayNecessityCacheForTests();
    contractNetwork.responder = () => ({ text: "ok" });
  });

  // KNOWN BUG #1 (httpRelayFallback.ts requestWithRelayFallback: knownRelayOnly.add on any direct failure).
  // test.failing: passes while the bug exists, goes red the moment it is fixed, so remove `.failing` then.
  test.failing("a device that was briefly off is reachable directly again once it is back, with no relay configured", async () => {
    contractNetwork.mode = "refuse";
    await expect(requestWithRelayFallback(REQUEST)).rejects.toThrow();

    contractNetwork.mode = "up";
    const attemptsBefore = contractNetwork.requestUrls.length;
    const response = await requestWithRelayFallback(REQUEST).catch((error: Error) => error);

    expect(contractNetwork.requestUrls.length).toBeGreaterThan(attemptsBefore);
    expect(response).not.toBeInstanceOf(Error);
  });
});
