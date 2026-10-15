import { Device } from "../../core/types/Device";
import { SONY_BRAVIA_DRIVER_ID } from "../tv/sony/SonyBraviaDriver";
import { findMacByIp } from "../../discovery/familyCommandCenterDeviceLookup";
import { sendWakeOnLan } from "../../core/network/wakeOnLan";
import { tryAutoWakeOnLan } from "./autoWakeOnReconnect";

jest.mock("../../discovery/familyCommandCenterDeviceLookup");
jest.mock("../../core/network/wakeOnLan");
const mockMacByIp = findMacByIp as jest.MockedFunction<typeof findMacByIp>;
const mockSendWol = sendWakeOnLan as jest.MockedFunction<typeof sendWakeOnLan>;

function tv(config: Record<string, unknown>): Device {
  return { id: "den", name: "Den TV", category: "tv", manufacturer: "Sony", driverId: SONY_BRAVIA_DRIVER_ID, capabilities: [], config: { ipAddress: "192.168.1.50", ...config } };
}

describe("tryAutoWakeOnLan (ADR-HEARTH-227)", () => {
  beforeEach(() => jest.resetAllMocks());

  test("sends Wake-on-LAN to an already-known MAC without looking one up", async () => {
    const device = tv({ hwaddr: "AA:BB:CC:DD:EE:FF" });
    mockSendWol.mockResolvedValue(undefined);

    expect(await tryAutoWakeOnLan(device)).toBe(true);
    expect(mockSendWol).toHaveBeenCalledWith("AA:BB:CC:DD:EE:FF");
    expect(mockMacByIp).not.toHaveBeenCalled();
  });

  test("falls back to a Family Command Center lookup by IP and backfills the MAC it finds", async () => {
    const device = tv({});
    mockMacByIp.mockResolvedValue("11:22:33:44:55:66");
    mockSendWol.mockResolvedValue(undefined);

    expect(await tryAutoWakeOnLan(device)).toBe(true);
    expect(mockMacByIp).toHaveBeenCalledWith("192.168.1.50");
    expect(mockSendWol).toHaveBeenCalledWith("11:22:33:44:55:66");
    expect(device.config?.hwaddr).toBe("11:22:33:44:55:66");
  });

  test("reports no wake possible when no MAC can be resolved at all", async () => {
    const device = tv({});
    mockMacByIp.mockResolvedValue(undefined);

    expect(await tryAutoWakeOnLan(device)).toBe(false);
    expect(mockSendWol).not.toHaveBeenCalled();
  });

  test("reports no wake possible when sending the packet itself fails, without throwing", async () => {
    const device = tv({ hwaddr: "AA:BB:CC:DD:EE:FF" });
    mockSendWol.mockRejectedValue(new Error("Family Command Center isn't connected"));

    await expect(tryAutoWakeOnLan(device)).resolves.toBe(false);
  });
});
