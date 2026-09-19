import { FamilyCommandCenterDiscoveryProvider } from "./FamilyCommandCenterDiscoveryProvider";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import { SONY_BRAVIA_DRIVER_ID } from "../drivers/tv/sony/SonyBraviaDriver";
import { LG_WEBOS_DRIVER_ID } from "../drivers/tv/lg/LgWebOsDriver";
import { ROKU_ECP_DRIVER_ID } from "../drivers/streaming/roku/RokuEcpDriver";
import { SONOS_DRIVER_ID } from "../drivers/audio/sonos/SonosDriver";
import { DENON_DRIVER_ID } from "../drivers/tv/denon/DenonDriver";

// An explicit factory, not bare jest.mock(path) -- automocking still
// requires the real module once to learn its shape, and that module
// imports AsyncStorage/SecureStore, whose native modules don't exist in
// this Jest environment (they throw synchronously on require, not just on
// use). A factory skips loading the real module at all.
jest.mock("./familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
  saveFamilyCommandCenterConfig: jest.fn(),
  clearFamilyCommandCenterConfig: jest.fn(),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("FamilyCommandCenterDiscoveryProvider", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "secret-token" });
  });

  test("throws a clear error when no config is saved yet, without ever calling fetch", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
    const provider = new FamilyCommandCenterDiscoveryProvider();

    await expect(provider.scan(() => {})).rejects.toThrow(/isn't connected yet/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("sends the saved bearer token to the correct endpoint", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ devices: [] }));
    const provider = new FamilyCommandCenterDiscoveryProvider();

    await provider.scan(() => {});

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/devices",
      expect.objectContaining({ headers: { Authorization: "Bearer secret-token" } })
    );
  });

  test("maps a recognized brand to its real driver and category", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({
        devices: [
          { hwaddr: "14:ac:60:00:f9:8d", ip: "192.168.1.50", name: "SonyTV.lan", vendor: null },
          { hwaddr: "f8:b9:5a:43:7e:3e", ip: "192.168.1.60", name: "LGwebOSTV.lan", vendor: "LG Innotek" },
          { hwaddr: "d4:ab:cd:3e:b0:25", ip: "192.168.1.70", name: "32HisenseRokuTV", vendor: null },
          { hwaddr: "00:0e:58:aa:bb:cc", ip: "192.168.1.90", name: "Sonos-000E58AABBCC", vendor: "Sonos, Inc." },
          { hwaddr: "00:05:cd:aa:bb:cc", ip: "192.168.1.85", name: "AVR-X2700H", vendor: "Denon" },
        ],
      })
    );
    const provider = new FamilyCommandCenterDiscoveryProvider();
    const found: { name: string; driverId: string; category: string }[] = [];

    await provider.scan((d) => found.push({ name: d.name, driverId: d.driverId, category: d.category }));

    expect(found).toEqual([
      { name: "SonyTV.lan", driverId: SONY_BRAVIA_DRIVER_ID, category: "tv" },
      { name: "LGwebOSTV.lan", driverId: LG_WEBOS_DRIVER_ID, category: "tv" },
      { name: "32HisenseRokuTV", driverId: ROKU_ECP_DRIVER_ID, category: "streaming" },
      { name: "Sonos-000E58AABBCC", driverId: SONOS_DRIVER_ID, category: "audio" },
      { name: "AVR-X2700H", driverId: DENON_DRIVER_ID, category: "tv" },
    ]);
  });

  test("still surfaces an unrecognized device, honestly unsupported rather than hidden", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ devices: [{ hwaddr: "aa:bb:cc:dd:ee:ff", ip: "192.168.1.99", name: "iRobot-vacuum", vendor: null }] })
    );
    const provider = new FamilyCommandCenterDiscoveryProvider();
    const found: { name: string; driverId: string; category: string }[] = [];

    await provider.scan((d) => found.push({ name: d.name, driverId: d.driverId, category: d.category }));

    expect(found).toEqual([{ name: "iRobot-vacuum", driverId: "", category: "other" }]);
  });

  // ADR-HEARTH-094: the Family Command Center dashboard's own device-category label (confirmed
  // with Sean to expose only this bucket, never the household's human-typed nickname) rides along
  // in metadata so DeviceListScreen's "Suggested" section can offer an unrecognized-but-labeled
  // device without Hearth having to guess from vendor/hostname alone.
  test("passes the household's own dashboard-labeled category through in metadata", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ devices: [{ hwaddr: "aa:bb:cc:dd:ee:ff", ip: "192.168.1.99", name: "Living Room Speaker", vendor: null, category: "smart_speaker" }] })
    );
    const provider = new FamilyCommandCenterDiscoveryProvider();
    const found: unknown[] = [];

    await provider.scan((d) => found.push(d.metadata?.householdCategory));

    expect(found).toEqual(["smart_speaker"]);
  });

  test("householdCategory is null when the device has never been labeled", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ devices: [{ hwaddr: "aa:bb:cc:dd:ee:ff", ip: "192.168.1.99", name: "iRobot-vacuum", vendor: null, category: null }] })
    );
    const provider = new FamilyCommandCenterDiscoveryProvider();
    const found: unknown[] = [];

    await provider.scan((d) => found.push(d.metadata?.householdCategory));

    expect(found).toEqual([null]);
  });

  test("throws a clear error on a rejected token (401)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 401));
    const provider = new FamilyCommandCenterDiscoveryProvider();

    await expect(provider.scan(() => {})).rejects.toThrow(/rejected/);
  });

  test("times out and surfaces a clear, retry-able error instead of hanging forever (real-hardware finding, 2026-09-09)", async () => {
    // Real timers deliberately, not fake ones -- AbortController's event dispatch interacting
    // with fake-timer microtask ordering proved flaky here; a real ~8s wait is slower but
    // reliable, same tradeoff already made for LgWebOsDriver's setChannel test.
    (global.fetch as jest.Mock).mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    );
    const provider = new FamilyCommandCenterDiscoveryProvider();

    await expect(provider.scan(() => {})).rejects.toThrow(/didn't respond within/);
  }, 12000);
});
