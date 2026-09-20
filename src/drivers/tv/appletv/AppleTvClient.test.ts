import { AppleTvClient } from "./AppleTvClient";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("AppleTvClient", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
  });

  test("startPairing posts the IP and resolves with a session id", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ sessionId: "abc-123" }));

    await expect(new AppleTvClient().startPairing("192.168.1.90")).resolves.toEqual({ sessionId: "abc-123" });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/appletv/pair/start",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ipAddress: "192.168.1.90" }) })
    );
  });

  test("submitPin posts the session id and PIN", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ ok: true }));

    await new AppleTvClient().submitPin("abc-123", "1234");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/appletv/pair/pin",
      expect.objectContaining({ body: JSON.stringify({ sessionId: "abc-123", pin: "1234" }) })
    );
  });

  test("getPairingStatus polls the status route with the session id", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ status: "awaiting_pin" }));

    await expect(new AppleTvClient().getPairingStatus("abc-123")).resolves.toEqual({ status: "awaiting_pin" });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/appletv/pair/status?sessionId=abc-123",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) })
    );
  });

  test("sendCommand posts the IP, command, and args, resolving with the real output", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ output: "PowerState.On" }));

    await expect(new AppleTvClient().sendCommand("192.168.1.90", "power_state")).resolves.toBe("PowerState.On");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/appletv/command",
      expect.objectContaining({ body: JSON.stringify({ ipAddress: "192.168.1.90", command: "power_state", args: [] }) })
    );
  });

  test("without Family Command Center configured fails clearly rather than silently no-opping", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
    await expect(new AppleTvClient().startPairing("192.168.1.90")).rejects.toThrow(/Family Command Center/);
  });

  test("a rejected token surfaces a clear error, not a generic HTTP status", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(new AppleTvClient().sendCommand("192.168.1.90", "turn_on")).rejects.toThrow(/rejected the saved token/);
  });
});
