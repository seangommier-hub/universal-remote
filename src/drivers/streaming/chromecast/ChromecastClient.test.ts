import { ChromecastClient } from "./ChromecastClient";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("ChromecastClient", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
  });

  test("getStatus posts the IP to the status relay route", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ volumeLevel: 0.5, muted: false }));

    await expect(new ChromecastClient().getStatus("192.168.1.95")).resolves.toEqual({ volumeLevel: 0.5, muted: false });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/chromecast/status",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ipAddress: "192.168.1.95" }) })
    );
  });

  test("setVolume posts the level (0.0-1.0 scale) to the volume relay route", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ volumeLevel: 0.7, muted: false }));

    await new ChromecastClient().setVolume("192.168.1.95", 0.7);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/chromecast/volume",
      expect.objectContaining({ body: JSON.stringify({ ipAddress: "192.168.1.95", level: 0.7 }) })
    );
  });

  test("setMute posts the muted flag to the same volume relay route", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ volumeLevel: 0.7, muted: true }));

    await new ChromecastClient().setMute("192.168.1.95", true);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/chromecast/volume",
      expect.objectContaining({ body: JSON.stringify({ ipAddress: "192.168.1.95", muted: true }) })
    );
  });

  test("without Family Command Center configured fails clearly rather than silently no-opping", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
    await expect(new ChromecastClient().getStatus("192.168.1.95")).rejects.toThrow(/Family Command Center/);
  });

  test("a rejected token surfaces a clear error, not a generic HTTP status", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(new ChromecastClient().getStatus("192.168.1.95")).rejects.toThrow(/rejected the saved token/);
  });
});
