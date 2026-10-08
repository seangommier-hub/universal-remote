import { Device } from "../core/types/Device";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import { commandCenterTvKind, showCommandCenterOnTv } from "./showCommandCenterOnTv";

jest.mock("./familyCommandCenterConfig", () => ({ loadFamilyCommandCenterConfig: jest.fn() }));

function tv(driverId: string, config: Record<string, unknown> | undefined = { ipAddress: "192.168.1.218" }): Device {
  return { id: "tv-1", name: "Downstairs LG", category: "tv", manufacturer: "LG", driverId, capabilities: [], config };
}

function response(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

describe("commandCenterTvKind", () => {
  test("LG webOS and Sony Bravia are supported; Samsung and Roku are not", () => {
    expect(commandCenterTvKind(tv("lg-webos-wss3001"))).toBe("lg-webos");
    expect(commandCenterTvKind(tv("sony-bravia"))).toBe("sony-bravia");
    expect(commandCenterTvKind(tv("samsung-tizen"))).toBeUndefined();
    expect(commandCenterTvKind(tv("roku-ecp"))).toBeUndefined();
  });
});

describe("showCommandCenterOnTv", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
  });

  test("posts the TV's brand and saved address to the show-command-center route", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(response(200));
    await showCommandCenterOnTv(tv("lg-webos-wss3001"));
    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/show-command-center",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ kind: "lg-webos", ip: "192.168.1.218" }) })
    );
  });

  test("a TV the Pi can't switch fails before any request", async () => {
    await expect(showCommandCenterOnTv(tv("samsung-tizen"))).rejects.toThrow(/can't switch/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("a device saved without an address fails before any request", async () => {
    await expect(showCommandCenterOnTv(tv("lg-webos-wss3001", {}))).rejects.toThrow(/can't switch/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("without Family Command Center configured fails clearly", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
    await expect(showCommandCenterOnTv(tv("lg-webos-wss3001"))).rejects.toThrow(/Family Command Center/);
  });

  test("a rejected token and an unreachable TV give different messages", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(response(401));
    await expect(showCommandCenterOnTv(tv("lg-webos-wss3001"))).rejects.toThrow(/rejected the saved token/);
    (global.fetch as jest.Mock).mockResolvedValueOnce(response(502));
    await expect(showCommandCenterOnTv(tv("lg-webos-wss3001"))).rejects.toThrow(/Is it turned on/);
  });
});
