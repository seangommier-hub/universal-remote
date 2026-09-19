import { Ps5Client, Ps5PairingTimeoutError } from "./Ps5Client";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

// Same reasoning as XboxDriver.test.ts: mocked rather than imported for real — the real module
// pulls in AsyncStorage/SecureStore, native modules this Jest environment doesn't have.
jest.mock("../../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("Ps5Client", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("captureCredentials", () => {
    test("starts a session, then polls status until a real credential arrives", async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(jsonResponse({ sessionId: "abc-123" })) // start
        .mockResolvedValueOnce(jsonResponse({ status: "pending" })) // poll 1
        .mockResolvedValueOnce(jsonResponse({ status: "pending" })) // poll 2
        .mockResolvedValueOnce(jsonResponse({ status: "found", credentials: { clientType: "a", authType: "R", userCredential: "xyz" } })); // poll 3

      const onListening = jest.fn();
      const promise = new Ps5Client().captureCredentials("Hearth", onListening);

      await jest.runOnlyPendingTimersAsync();
      await jest.runOnlyPendingTimersAsync();
      await jest.runOnlyPendingTimersAsync();

      await expect(promise).resolves.toEqual({ clientType: "a", authType: "R", userCredential: "xyz" });
      expect(onListening).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        "http://192.168.1.172:3210/api/integrations/hearth/ps5/pair/start",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ deviceName: "Hearth" }) })
      );
      expect(global.fetch).toHaveBeenLastCalledWith(
        "http://192.168.1.172:3210/api/integrations/hearth/ps5/pair/status?sessionId=abc-123",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) })
      );
    });

    test("rejects with Ps5PairingTimeoutError when the server reports its own timeout", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ sessionId: "abc-123" })).mockResolvedValueOnce(jsonResponse({ status: "timeout" }));

      // Attach the rejection assertion synchronously, before any timer advances — otherwise the
      // promise can reject mid-`runOnlyPendingTimersAsync()` with nothing watching it yet, which
      // Jest treats as an unhandled rejection even though the assertion below would have caught it.
      const promise = new Ps5Client().captureCredentials("Hearth", () => {});
      const assertion = expect(promise).rejects.toBeInstanceOf(Ps5PairingTimeoutError);
      await jest.runOnlyPendingTimersAsync();
      await assertion;
    });

    test("surfaces a server-reported error status as a real error", async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(jsonResponse({ sessionId: "abc-123" }))
        .mockResolvedValueOnce(jsonResponse({ status: "error", errorMessage: "EADDRINUSE" }));

      const promise = new Ps5Client().captureCredentials("Hearth", () => {});
      const assertion = expect(promise).rejects.toThrow("EADDRINUSE");
      await jest.runOnlyPendingTimersAsync();
      await assertion;
    });

    test("without Family Command Center configured fails clearly rather than silently no-opping", async () => {
      (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
      await expect(new Ps5Client().captureCredentials("Hearth", () => {})).rejects.toThrow(/Family Command Center/);
    });
  });

  describe("sendWake", () => {
    test("posts the exact captured credentials and IP to the poweron relay route", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ sent: true }));

      await new Ps5Client().sendWake("192.168.1.220", { clientType: "a", authType: "R", userCredential: "xyz" });

      expect(global.fetch).toHaveBeenCalledWith(
        "http://192.168.1.172:3210/api/integrations/hearth/ps5/poweron",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ ipAddress: "192.168.1.220", credentials: { clientType: "a", authType: "R", userCredential: "xyz" } }),
        })
      );
    });

    test("a rejected token surfaces a clear error, not a generic HTTP status", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 401));
      await expect(new Ps5Client().sendWake("192.168.1.220", { clientType: "a", authType: "R", userCredential: "xyz" })).rejects.toThrow(/rejected the saved token/);
    });
  });
});
