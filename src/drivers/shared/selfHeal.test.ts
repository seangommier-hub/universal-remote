import { Device } from "../../core/types/Device";
import { SONY_BRAVIA_DRIVER_ID } from "../tv/sony/SonyBraviaDriver";
import { findCurrentIpByBrand, findCurrentIpByMac, findCurrentIpByName, findMacByIp } from "../../discovery/familyCommandCenterDeviceLookup";
import { setSelfHealContext } from "./selfHealContext";
import { backfillHwaddr, findMovedAddress } from "./selfHeal";

jest.mock("../../discovery/familyCommandCenterDeviceLookup");
const mockByBrand = findCurrentIpByBrand as jest.MockedFunction<typeof findCurrentIpByBrand>;
const mockByMac = findCurrentIpByMac as jest.MockedFunction<typeof findCurrentIpByMac>;
const mockByName = findCurrentIpByName as jest.MockedFunction<typeof findCurrentIpByName>;
const mockMacByIp = findMacByIp as jest.MockedFunction<typeof findMacByIp>;

function sonyTv(config: Record<string, unknown>, id = "den"): Device {
  return { id, name: "Den TV", category: "tv", manufacturer: "Sony", driverId: SONY_BRAVIA_DRIVER_ID, capabilities: [], config: { ipAddress: "192.168.1.217", ...config } };
}

describe("findMovedAddress (ADR-HEARTH-169)", () => {
  const den = sonyTv({});
  beforeEach(() => {
    jest.resetAllMocks();
    setSelfHealContext({ savedDevices: () => [den, sonyTv({ ipAddress: "192.168.1.90" }, "other")], brandIdForDriver: (driverId) => (driverId === SONY_BRAVIA_DRIVER_ID ? "sony" : undefined) });
  });

  test("falls back to the unique unclaimed brand device when name lookup finds nothing", async () => {
    mockByName.mockResolvedValue(undefined);
    mockByBrand.mockResolvedValue("192.168.1.50");

    expect(await findMovedAddress(den)).toBe("192.168.1.50");
    expect(mockByBrand).toHaveBeenCalledWith("sony", { excludeIps: ["192.168.1.90"] });
  });

  test("prefers the name match and never asks for a brand match when the name is found", async () => {
    mockByName.mockResolvedValue("192.168.1.60");

    expect(await findMovedAddress(den)).toBe("192.168.1.60");
    expect(mockByBrand).not.toHaveBeenCalled();
  });

  test("a device with a saved MAC is located by MAC only, never by brand", async () => {
    const withMac = sonyTv({ hwaddr: "aa:bb:cc:dd:ee:ff" });
    mockByMac.mockResolvedValue(undefined);

    expect(await findMovedAddress(withMac)).toBeUndefined();
    expect(mockByBrand).not.toHaveBeenCalled();
  });

  test("returns undefined for a device whose driver has no brand", async () => {
    mockByName.mockResolvedValue(undefined);

    expect(await findMovedAddress({ ...den, driverId: "unknown-driver" })).toBeUndefined();
  });
});

describe("backfillHwaddr", () => {
  beforeEach(() => jest.resetAllMocks());

  test("saves the MAC the Family Command Center sees at the new address", async () => {
    const device = sonyTv({});
    mockMacByIp.mockResolvedValue("aa:bb:cc:dd:ee:ff");
    await backfillHwaddr(device, "192.168.1.50");
    expect(device.config?.hwaddr).toBe("aa:bb:cc:dd:ee:ff");
  });

  test("leaves an existing MAC alone", async () => {
    const device = sonyTv({ hwaddr: "11:22:33:44:55:66" });
    await backfillHwaddr(device, "192.168.1.50");
    expect(mockMacByIp).not.toHaveBeenCalled();
  });
});
