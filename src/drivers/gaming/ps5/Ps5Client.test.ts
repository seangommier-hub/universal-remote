import { Ps5Client } from "./Ps5Client";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

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
  });

  test("startLogin posts the IP and resolves with the real PSN login URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ sessionId: "abc-123", loginUrl: "https://auth.api.sonyentertainmentnetwork.com/x" }));

    await expect(new Ps5Client().startLogin("192.168.1.214")).resolves.toEqual({
      sessionId: "abc-123",
      loginUrl: "https://auth.api.sonyentertainmentnetwork.com/x",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/ps5/login/start",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ipAddress: "192.168.1.214" }) })
    );
  });

  test("submitRedirectUrl posts the session id and pasted URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ ok: true }));

    await new Ps5Client().submitRedirectUrl("abc-123", "https://remoteplay.dl.playstation.net/remoteplay/redirect?code=xyz");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/ps5/login/redirect",
      expect.objectContaining({ body: JSON.stringify({ sessionId: "abc-123", redirectUrl: "https://remoteplay.dl.playstation.net/remoteplay/redirect?code=xyz" }) })
    );
  });

  test("submitPin posts the session id and PIN", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ ok: true }));

    await new Ps5Client().submitPin("abc-123", "12345678");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/ps5/login/pin",
      expect.objectContaining({ body: JSON.stringify({ sessionId: "abc-123", pin: "12345678" }) })
    );
  });

  test("getLoginStatus polls the status route with the session id", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ status: "awaiting_pin" }));

    await expect(new Ps5Client().getLoginStatus("abc-123")).resolves.toEqual({ status: "awaiting_pin" });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/ps5/login/status?sessionId=abc-123",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) })
    );
  });

  test("sendWake posts only the IP — no credentials object", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ sent: true }));

    await new Ps5Client().sendWake("192.168.1.214");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/ps5/poweron",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ipAddress: "192.168.1.214" }) })
    );
  });

  test("without Family Command Center configured fails clearly rather than silently no-opping", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
    await expect(new Ps5Client().startLogin("192.168.1.214")).rejects.toThrow(/Family Command Center/);
  });

  test("a rejected token surfaces a clear error, not a generic HTTP status", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(new Ps5Client().sendWake("192.168.1.214")).rejects.toThrow(/rejected the saved token/);
  });
});
