import { AndroidTvClient, AndroidTvRelayError } from "./AndroidTvClient";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

const BASE = "http://192.168.1.172:3210/api/integrations/hearth/androidtv";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("AndroidTvClient", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
  });

  test("startPairing posts the IP and resolves with the session, name and MAC", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ sessionId: "s1", name: "Living Room", mac: "AA:BB:CC:DD:EE:FF" }));

    await expect(new AndroidTvClient().startPairing("192.168.1.91")).resolves.toEqual({ sessionId: "s1", name: "Living Room", mac: "AA:BB:CC:DD:EE:FF" });

    expect(global.fetch).toHaveBeenCalledWith(`${BASE}/pair/start`, expect.objectContaining({ method: "POST", body: JSON.stringify({ ipAddress: "192.168.1.91" }) }));
  });

  test("finishPairing posts the session id and code", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ ok: true, name: "TV", mac: "m" }));

    await new AndroidTvClient().finishPairing("s1", "A1B2C3");

    expect(global.fetch).toHaveBeenCalledWith(`${BASE}/pair/finish`, expect.objectContaining({ body: JSON.stringify({ sessionId: "s1", code: "A1B2C3" }) }));
  });

  test("getStatus, sendKey, launchApp and sendText post to the right routes with the right body", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ isOn: true, currentApp: "com.netflix.ninja", ok: true }));
    const client = new AndroidTvClient();

    await expect(client.getStatus("192.168.1.91")).resolves.toMatchObject({ isOn: true, currentApp: "com.netflix.ninja" });
    await client.sendKey("192.168.1.91", "HOME");
    await client.launchApp("192.168.1.91", { service: "netflix" });
    await client.sendText("192.168.1.91", "hi");

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[0][0]).toBe(`${BASE}/status`);
    expect(calls[1][1].body).toBe(JSON.stringify({ ipAddress: "192.168.1.91", key: "HOME" }));
    expect(calls[2][1].body).toBe(JSON.stringify({ ipAddress: "192.168.1.91", service: "netflix" }));
    expect(calls[3][1].body).toBe(JSON.stringify({ ipAddress: "192.168.1.91", text: "hi" }));
  });

  test("a 409 becomes a not_paired relay error", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ error: "Need to pair", kind: "not_paired" }, 409));

    await expect(new AndroidTvClient().getStatus("192.168.1.91")).rejects.toMatchObject({ kind: "not_paired", httpStatus: 409 });
  });

  test("a bad_code 400 keeps its kind and the Pi's message", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ error: "wrong code", kind: "bad_code" }, 400));

    const error = await new AndroidTvClient().finishPairing("s1", "000000").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AndroidTvRelayError);
    expect(error).toMatchObject({ kind: "bad_code", message: "wrong code" });
  });

  test("an unrecognised kind or an unparseable body falls back to bridge_error", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new Error("not json"); } } as unknown as Response);

    await expect(new AndroidTvClient().getStatus("192.168.1.91")).rejects.toMatchObject({ kind: "bridge_error", httpStatus: 502 });
  });

  test("a rejected token is a plain error, not a relay error", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, 401));

    await expect(new AndroidTvClient().getStatus("192.168.1.91")).rejects.toThrow("rejected the saved token");
  });
});
