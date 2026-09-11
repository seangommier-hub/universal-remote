import { SMARTTHINGS_OUTLET_DRIVER_ID, SmartThingsOutletDriver } from "./SmartThingsOutletDriver";
import { Device } from "../../../core/types/Device";
import { listOutlets, setOutletState } from "./SmartThingsClient";

jest.mock("./SmartThingsClient");
const mockListOutlets = listOutlets as jest.MockedFunction<typeof listOutlets>;
const mockSetOutletState = setOutletState as jest.MockedFunction<typeof setOutletState>;

const device: Device = {
  id: "outlet-1",
  name: "Living Room Lamp",
  category: "outlet",
  manufacturer: "SmartThings",
  driverId: SMARTTHINGS_OUTLET_DRIVER_ID,
  capabilities: [],
  config: { deviceId: "st-device-1" },
};

describe("SmartThingsOutletDriver", () => {
  let driver: SmartThingsOutletDriver;

  beforeEach(() => {
    driver = new SmartThingsOutletDriver();
    mockListOutlets.mockReset();
    mockSetOutletState.mockReset();
  });

  test("declares only power — the whole capability set an outlet has", () => {
    expect(driver.getCapabilities()).toEqual(["power"]);
  });

  test("connect() reads the real switch state from the Family Command Center's outlet list", async () => {
    mockListOutlets.mockResolvedValue([{ id: "st-device-1", label: "Living Room Lamp", state: "on" }]);

    await driver.connect(device);

    expect(await driver.getState(device)).toMatchObject({ connection: "connected", values: { power: "on" } });
  });

  test("connect() fails safe to 'off' when SmartThings reports an unknown switch value", async () => {
    mockListOutlets.mockResolvedValue([{ id: "st-device-1", label: "Living Room Lamp", state: "unknown" }]);

    await driver.connect(device);

    expect((await driver.getState(device)).values.power).toBe("off");
  });

  test("connect() throws and marks disconnected when the outlet isn't in the Center's current list", async () => {
    mockListOutlets.mockResolvedValue([]);

    await expect(driver.connect(device)).rejects.toThrow(/isn't in Family Command Center/);
    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("connect() throws and marks disconnected when the Family Command Center call itself fails", async () => {
    mockListOutlets.mockRejectedValue(new Error("Family Command Center isn't paired yet"));

    await expect(driver.connect(device)).rejects.toThrow(/isn't paired yet/);
    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("power command toggles from the current cached state and sends the right SmartThings command", async () => {
    mockListOutlets.mockResolvedValue([{ id: "st-device-1", label: "Living Room Lamp", state: "off" }]);
    await driver.connect(device);

    mockSetOutletState.mockResolvedValue(undefined);
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(result.state?.power).toBe("on");
    expect(mockSetOutletState).toHaveBeenCalledWith("st-device-1", "on");
  });

  test("executeCommand throws for any capability other than power", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" })).rejects.toThrow(/does not implement/);
    expect(mockSetOutletState).not.toHaveBeenCalled();
  });

  test("a failed command marks the device disconnected", async () => {
    mockListOutlets.mockResolvedValue([{ id: "st-device-1", label: "Living Room Lamp", state: "on" }]);
    await driver.connect(device);

    mockSetOutletState.mockRejectedValue(new Error("Family Command Center returned 502"));
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow();

    expect((await driver.getState(device)).connection).toBe("disconnected");
  });
});
