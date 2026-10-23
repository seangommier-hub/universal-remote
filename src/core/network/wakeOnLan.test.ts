import { sendWakeOnLan } from "./wakeOnLan";
import { loadFamilyCommandCenterConfigSafely } from "../../discovery/familyCommandCenterConfig";

jest.mock("../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfigSafely: jest.fn(),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("sendWakeOnLan", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    (loadFamilyCommandCenterConfigSafely as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
  });

  test("posts the MAC address to the wake-on-lan relay route", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ sent: true }));

    await sendWakeOnLan("F8:B9:5A:43:7E:3E");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/wake-on-lan",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        body: JSON.stringify({ macAddress: "F8:B9:5A:43:7E:3E" }),
      })
    );
  });

  // ADR-HEARTH-232: a Keychain-unavailable read (phone locked) resolves through the exact same
  // `null` branch as "not configured at all" -- loadFamilyCommandCenterConfigSafely() never
  // rejects, so there is nothing additional for sendWakeOnLan() itself to handle.
  test("without Family Command Center configured (or its config unreadable right now) fails clearly rather than silently no-opping", async () => {
    (loadFamilyCommandCenterConfigSafely as jest.Mock).mockResolvedValue(null);
    await expect(sendWakeOnLan("F8:B9:5A:43:7E:3E")).rejects.toThrow(/Family Command Center/);
  });

  test("a rejected token surfaces a clear error, not a generic HTTP status", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(sendWakeOnLan("F8:B9:5A:43:7E:3E")).rejects.toThrow(/rejected the saved token/);
  });
});
