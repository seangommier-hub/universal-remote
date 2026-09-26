import { fccJsonRequest } from "../../../core/network/fccJsonRequest";
import { getLifxState, setLifxColor, setLifxPower } from "./LifxClient";

jest.mock("../../../core/network/fccJsonRequest");
const mockRelay = fccJsonRequest as jest.MockedFunction<typeof fccJsonRequest>;

beforeEach(() => mockRelay.mockReset());

test("getLifxState asks the proxy for the bulb at an address and returns its state", async () => {
  mockRelay.mockResolvedValueOnce({ power: true, hue: 200, saturation: 50, brightness: 80, label: "Desk" });

  expect(await getLifxState("192.168.1.91")).toMatchObject({ power: true, label: "Desk" });
  expect(mockRelay).toHaveBeenCalledWith("/api/integrations/hearth/lifx/state?ip=192.168.1.91");
});

test("setLifxPower posts the address and target power", async () => {
  mockRelay.mockResolvedValueOnce({});

  await setLifxPower("192.168.1.91", false);

  const [path, init] = mockRelay.mock.calls[0];
  expect(path).toBe("/api/integrations/hearth/lifx/set-power");
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ ip: "192.168.1.91", on: false });
});

test("setLifxColor sends only the fields it was given", async () => {
  mockRelay.mockResolvedValueOnce({});

  await setLifxColor("192.168.1.91", { brightness: 40 });

  expect(JSON.parse((mockRelay.mock.calls[0][1] as RequestInit).body as string)).toEqual({ ip: "192.168.1.91", brightness: 40 });
});

test("a proxy failure propagates", async () => {
  mockRelay.mockRejectedValueOnce(new Error("Family Command Center returned 502."));

  await expect(getLifxState("192.168.1.91")).rejects.toThrow("502");
});
