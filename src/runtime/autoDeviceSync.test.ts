import { Device } from "../core/types/Device";
import { fetchSharedDevices, publishDevices } from "../discovery/familyCommandCenterDeviceSync";
import { runAutoDeviceSync } from "./autoDeviceSync";

jest.mock("../discovery/familyCommandCenterDeviceSync");
const mockFetch = fetchSharedDevices as jest.MockedFunction<typeof fetchSharedDevices>;
const mockPublish = publishDevices as jest.MockedFunction<typeof publishDevices>;

function device(id: string, shared?: boolean): Device {
  return { id, name: id, category: "tv", manufacturer: "LG", driverId: "lg", capabilities: [], config: {}, shared };
}

describe("runAutoDeviceSync", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockPublish.mockReset();
    mockPublish.mockResolvedValue(0);
  });

  test("a phone with no devices adds everything shared and publishes nothing new", async () => {
    mockFetch.mockResolvedValue([device("a"), device("b")]);
    const added: string[] = [];
    await runAutoDeviceSync([], (d) => added.push(d.id));
    expect(added).toEqual(["a", "b"]);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test("a phone with devices the household list lacks publishes the union", async () => {
    mockFetch.mockResolvedValue([device("a")]);
    const added: string[] = [];
    await runAutoDeviceSync([device("b")], (d) => added.push(d.id));
    expect(added).toEqual(["a"]);
    expect(mockPublish.mock.calls[0][0].map((d) => d.id)).toEqual(["b", "a"]);
  });

  test("an empty phone never wipes the shared list", async () => {
    mockFetch.mockResolvedValue([device("a")]);
    await runAutoDeviceSync([], () => undefined);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test("a failure (no Family Command Center saved, unreachable) is swallowed", async () => {
    mockFetch.mockRejectedValue(new Error("Family Command Center isn't connected"));
    await expect(runAutoDeviceSync([device("a")], () => undefined)).resolves.toBeUndefined();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test("a device switched off for sharing is never published (ADR-HEARTH-140)", async () => {
    mockFetch.mockResolvedValue([device("a")]);
    await runAutoDeviceSync([device("private", false), device("mine", true)], () => undefined);
    expect(mockPublish.mock.calls[0][0].map((d) => d.id)).toEqual(["mine", "a"]);
  });

  test("a phone whose only new device is private publishes nothing", async () => {
    mockFetch.mockResolvedValue([device("a")]);
    await runAutoDeviceSync([device("private", false)], () => undefined);
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
