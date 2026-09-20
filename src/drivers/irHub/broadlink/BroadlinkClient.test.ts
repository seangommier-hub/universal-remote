import { BroadlinkClient } from "./BroadlinkClient";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("BroadlinkClient", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
  });

  test("learnCode posts the hub's IP and resolves with the captured hex code", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ code: "26001234" }));

    await expect(new BroadlinkClient().learnCode("192.168.1.80")).resolves.toBe("26001234");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/broadlink/learn",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ipAddress: "192.168.1.80" }) })
    );
  });

  test("sendCode posts the hub's IP and the code to transmit", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ sent: true }));

    await new BroadlinkClient().sendCode("192.168.1.80", "26001234");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/broadlink/send",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ipAddress: "192.168.1.80", code: "26001234" }) })
    );
  });

  test("without Family Command Center configured fails clearly rather than silently no-opping", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
    await expect(new BroadlinkClient().learnCode("192.168.1.80")).rejects.toThrow(/Family Command Center/);
  });

  test("a rejected token surfaces a clear error, not a generic HTTP status", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(new BroadlinkClient().sendCode("192.168.1.80", "26001234")).rejects.toThrow(/rejected the saved token/);
  });
});
