import { DeviceDriver } from "../../../core/drivers/DeviceDriver";
import { finishPairing, startPairingOnAnyPort } from "./VizioClient";
import { beginVizioPairing, completeVizioPairing } from "./vizioPairingFlow";

jest.mock("./VizioClient");
const mockStart = startPairingOnAnyPort as jest.Mock;
const mockFinish = finishPairing as jest.Mock;

function fakeDriver(connect: jest.Mock = jest.fn().mockResolvedValue(undefined)) {
  return { getCapabilities: () => ["power"], connect, disconnect: jest.fn().mockResolvedValue(undefined) } as unknown as DeviceDriver & { connect: jest.Mock; disconnect: jest.Mock };
}

const START = { ipAddress: "192.168.1.88", port: 9000, pairingToken: 5 };

beforeEach(() => jest.clearAllMocks());

test("beginVizioPairing reports the address, the port that answered and the pairing token", async () => {
  mockStart.mockResolvedValue({ port: 9000, pairingToken: 5 });

  expect(await beginVizioPairing("192.168.1.88")).toEqual(START);
});

test("completeVizioPairing saves the auth token, port and address in the device config and connects", async () => {
  mockFinish.mockResolvedValue("Ztoken");
  const driver = fakeDriver();

  const device = await completeVizioPairing(driver, START, "1234", "  Den TV ");

  expect(mockFinish).toHaveBeenCalledWith("192.168.1.88", 9000, 5, "1234");
  expect(device).toMatchObject({ name: "Den TV", category: "tv", manufacturer: "Vizio", driverId: "vizio-smartcast", capabilities: ["power"], config: { ipAddress: "192.168.1.88", port: 9000, authToken: "Ztoken" } });
  expect(driver.connect).toHaveBeenCalledWith(device);
});

test("a wrong PIN never reaches the driver", async () => {
  mockFinish.mockRejectedValue(new Error("The PIN was not accepted"));
  const driver = fakeDriver();

  await expect(completeVizioPairing(driver, START, "0000", "")).rejects.toThrow(/PIN/);
  expect(driver.connect).not.toHaveBeenCalled();
});

test("a TV that will not connect after pairing is disconnected again so no retry loop is left running", async () => {
  mockFinish.mockResolvedValue("Ztoken");
  const driver = fakeDriver(jest.fn().mockRejectedValue(new Error("unreachable")));

  await expect(completeVizioPairing(driver, START, "1234", "")).rejects.toThrow("unreachable");
  expect(driver.disconnect).toHaveBeenCalled();
});

test("a blank name falls back to the default", async () => {
  mockFinish.mockResolvedValue("Ztoken");

  expect((await completeVizioPairing(fakeDriver(), START, "1234", "  ")).name).toBe("Vizio TV");
});
