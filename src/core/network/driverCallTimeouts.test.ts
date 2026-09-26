import { sendWakeOnLan } from "./wakeOnLan";
import { DEFAULT_FETCH_TIMEOUT_MS, LONG_FETCH_TIMEOUT_MS } from "./fetchWithTimeout";
import { Ps5Client } from "../../drivers/gaming/ps5/Ps5Client";
import { XboxDriver } from "../../drivers/gaming/xbox/XboxDriver";
import { BroadlinkClient } from "../../drivers/irHub/broadlink/BroadlinkClient";
import { ChromecastClient } from "../../drivers/streaming/chromecast/ChromecastClient";
import { AppleTvClient } from "../../drivers/tv/appletv/AppleTvClient";
import { loadFamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";
import { Device } from "../types/Device";

jest.mock("../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

const BROADLINK_LEARN_TIMEOUT_MS = 60000;
const HUNG_TIMEOUT_MESSAGE = /timed out after/;

const xboxDevice: Device = {
  id: "xbox-1",
  name: "Xbox",
  category: "gaming",
  manufacturer: "Microsoft",
  driverId: "xbox-smartglass",
  capabilities: [],
  config: { liveId: "FD0000000000ABCD", ipAddress: "192.168.1.210" },
};

/** Starts the call, lets time pass, and asserts it rejected with a timeout instead of hanging. */
async function expectRejectsAfter(call: () => Promise<unknown>, elapsedMs: number): Promise<void> {
  const pending = call();
  const assertion = expect(pending).rejects.toThrow(HUNG_TIMEOUT_MESSAGE);
  await jest.advanceTimersByTimeAsync(elapsedMs);
  await assertion;
}

describe("Family Command Center calls never hang", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn(() => new Promise<Response>(() => {}));
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("sendWakeOnLan rejects when the relay never answers", async () => {
    await expectRejectsAfter(() => sendWakeOnLan("F8:B9:5A:43:7E:3E"), DEFAULT_FETCH_TIMEOUT_MS);
  });

  test("XboxDriver power-on rejects when the relay never answers", async () => {
    const driver = new XboxDriver();
    await expectRejectsAfter(() => driver.executeCommand(xboxDevice, { capability: "powerOn" } as never), DEFAULT_FETCH_TIMEOUT_MS);
  });

  test("Ps5Client rejects when the relay never answers", async () => {
    await expectRejectsAfter(() => new Ps5Client().startLogin("192.168.1.214"), LONG_FETCH_TIMEOUT_MS);
  });

  test("AppleTvClient rejects when the relay never answers", async () => {
    await expectRejectsAfter(() => new AppleTvClient().startPairing("192.168.1.60"), LONG_FETCH_TIMEOUT_MS);
  });

  test("ChromecastClient rejects when the relay never answers", async () => {
    await expectRejectsAfter(() => new ChromecastClient().getStatus("192.168.1.70"), DEFAULT_FETCH_TIMEOUT_MS);
  });

  test("BroadlinkClient.sendCode rejects when the relay never answers", async () => {
    await expectRejectsAfter(() => new BroadlinkClient().sendCode("192.168.1.80", "abcd"), DEFAULT_FETCH_TIMEOUT_MS);
  });

  test("BroadlinkClient.learnCode gets a longer, but still bounded, window", async () => {
    await expectRejectsAfter(() => new BroadlinkClient().learnCode("192.168.1.80"), BROADLINK_LEARN_TIMEOUT_MS);
  });
});
