import { fccFetch } from "../core/network/fccRequest";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import { identifyDeviceByIp, parseIdentity } from "./identifyDevice";

jest.mock("../core/network/fccRequest", () => ({ fccFetch: jest.fn() }));
jest.mock("./familyCommandCenterConfig", () => ({ loadFamilyCommandCenterConfig: jest.fn() }));

const mockFetch = fccFetch as jest.Mock;
const mockConfig = loadFamilyCommandCenterConfig as jest.Mock;
const CONFIG = { baseUrl: "http://pi:3210", token: "t" };

const BODY = { brand: "roku", model: "Ultra 4800", friendlyName: "Living Room Roku", uuid: "ABC-1", mac: "AA:BB:CC:DD:EE:FF", evidence: ["roku device-info"] };

beforeEach(() => {
  mockFetch.mockReset();
  mockConfig.mockReset();
  mockConfig.mockResolvedValue(CONFIG);
});

describe("identifyDeviceByIp", () => {
  test("asks the identify endpoint with the address and maps the response", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => BODY });
    const identity = await identifyDeviceByIp("192.168.1.20");
    expect(mockFetch).toHaveBeenCalledWith(CONFIG, "/api/integrations/hearth/discover/identify?ip=192.168.1.20", {}, expect.any(Number));
    expect(identity).toEqual({ brand: "roku", model: "Ultra 4800", name: "Living Room Roku", uuid: "ABC-1", mac: "aa:bb:cc:dd:ee:ff", serial: undefined, evidence: ["roku device-info"] });
  });

  test("degrades to null on 404 from an older Pi", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    expect(await identifyDeviceByIp("192.168.1.20")).toBeNull();
  });

  test("degrades to null when the Pi is unreachable", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));
    expect(await identifyDeviceByIp("192.168.1.20")).toBeNull();
  });

  test("returns null without calling anything when no Pi is configured", async () => {
    mockConfig.mockResolvedValue(null);
    expect(await identifyDeviceByIp("192.168.1.20")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns null for a malformed body", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => { throw new Error("bad json"); } });
    expect(await identifyDeviceByIp("192.168.1.20")).toBeNull();
  });
});

describe("parseIdentity", () => {
  test("rejects non-objects and bodies with no usable field", () => {
    expect(parseIdentity(null)).toBeNull();
    expect(parseIdentity("x")).toBeNull();
    expect(parseIdentity({ brand: 3, evidence: ["a"] })).toBeNull();
  });
});
