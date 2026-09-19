import { SonosDriver } from "./SonosDriver";
import { Device } from "../../../core/types/Device";

function soapResponse(bodyFields: Record<string, string | number> = {}, ok = true, status = 200) {
  const inner = Object.entries(bodyFields)
    .map(([tag, value]) => `<${tag}>${value}</${tag}>`)
    .join("");
  const xml = `<?xml version="1.0"?><s:Envelope><s:Body><u:Response>${inner}</u:Response></s:Body></s:Envelope>`;
  return { ok, status, text: async () => xml } as Response;
}

const volumeResponse = (volume: number) => soapResponse({ CurrentVolume: volume });
const muteResponse = (mute: boolean) => soapResponse({ CurrentMute: mute ? 1 : 0 });
const transportResponse = (state: string) => soapResponse({ CurrentTransportState: state });
const okResponse = () => soapResponse({});

const device: Device = {
  id: "sonos-1",
  name: "Living Room Sonos",
  category: "audio",
  manufacturer: "Sonos",
  driverId: "sonos",
  capabilities: [],
  config: { ipAddress: "192.168.1.90" },
};

describe("SonosDriver", () => {
  let driver: SonosDriver;

  beforeEach(() => {
    driver = new SonosDriver();
    global.fetch = jest.fn();
  });

  test("declares only capabilities the local UPnP control surface actually implements — no 'power'", () => {
    const caps = driver.getCapabilities();
    expect(caps).toEqual(["volumeUp", "volumeDown", "setVolume", "mute", "playPause"]);
    expect(caps).not.toContain("power");
  });

  test("connect() reads real volume, mute, and transport state", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(volumeResponse(25)).mockResolvedValueOnce(muteResponse(false)).mockResolvedValueOnce(transportResponse("PLAYING"));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.connection).toBe("connected");
    expect(state.values).toMatchObject({ volume: 25, muted: false, playbackState: "playing" });
  });

  test("STOPPED transport state maps to 'paused' for the now-playing widget, not left unset", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(volumeResponse(25)).mockResolvedValueOnce(muteResponse(false)).mockResolvedValueOnce(transportResponse("STOPPED"));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.values.playbackState).toBe("paused");
  });

  test("volumeUp increases relative to the speaker's own real current volume", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(volumeResponse(30)) // applyCommand's read
      .mockResolvedValueOnce(okResponse()) // setVolume
      .mockResolvedValueOnce(volumeResponse(35)) // refreshState
      .mockResolvedValueOnce(muteResponse(false))
      .mockResolvedValueOnce(transportResponse("STOPPED"));

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" });

    const setVolumeBody = (global.fetch as jest.Mock).mock.calls[1][1].body as string;
    expect(setVolumeBody).toContain("<DesiredVolume>35</DesiredVolume>");
    expect(result.state?.volume).toBe(35);
  });

  test("volumeDown never requests below zero", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(volumeResponse(2))
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(volumeResponse(0))
      .mockResolvedValueOnce(muteResponse(false))
      .mockResolvedValueOnce(transportResponse("STOPPED"));

    await driver.executeCommand(device, { deviceId: device.id, capability: "volumeDown" });

    const setVolumeBody = (global.fetch as jest.Mock).mock.calls[1][1].body as string;
    expect(setVolumeBody).toContain("<DesiredVolume>0</DesiredVolume>");
  });

  test("mute toggles based on real current state", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(muteResponse(false)) // applyCommand's read
      .mockResolvedValueOnce(okResponse()) // setMute
      .mockResolvedValueOnce(volumeResponse(20))
      .mockResolvedValueOnce(muteResponse(true))
      .mockResolvedValueOnce(transportResponse("STOPPED"));

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "mute" });

    const setMuteBody = (global.fetch as jest.Mock).mock.calls[1][1].body as string;
    expect(setMuteBody).toContain("<DesiredMute>1</DesiredMute>");
    expect(result.state?.muted).toBe(true);
  });

  test("playPause sends Pause when currently playing", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(transportResponse("PLAYING")) // applyCommand's read
      .mockResolvedValueOnce(okResponse()) // Pause
      .mockResolvedValueOnce(volumeResponse(20))
      .mockResolvedValueOnce(muteResponse(false))
      .mockResolvedValueOnce(transportResponse("PAUSED_PLAYBACK"));

    await driver.executeCommand(device, { deviceId: device.id, capability: "playPause" });

    const pauseCall = (global.fetch as jest.Mock).mock.calls[1][1];
    expect(pauseCall.headers.SOAPACTION).toBe("urn:schemas-upnp-org:service:AVTransport:1#Pause");
  });

  test("playPause sends Play when currently paused", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(transportResponse("PAUSED_PLAYBACK"))
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(volumeResponse(20))
      .mockResolvedValueOnce(muteResponse(false))
      .mockResolvedValueOnce(transportResponse("PLAYING"));

    await driver.executeCommand(device, { deviceId: device.id, capability: "playPause" });

    const playCall = (global.fetch as jest.Mock).mock.calls[1][1];
    expect(playCall.headers.SOAPACTION).toBe("urn:schemas-upnp-org:service:AVTransport:1#Play");
  });

  test("rejects a device with no config instead of silently doing nothing", async () => {
    const unconfigured: Device = { ...device, config: undefined };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/missing Sonos config/);
  });

  test("setVolume without a numeric arg rejects before making any network call", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setVolume" })).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
