import { DenonClient } from "./DenonClient";

function statusXml(fields: { power?: string; volumeDb?: number; muted?: boolean } = {}) {
  const { power = "ON", volumeDb = -50, muted = false } = fields;
  return `<?xml version="1.0" encoding="utf-8" ?><item><Power><value>${power}</value></Power><MasterVolume><value>${volumeDb}</value></MasterVolume><Mute><value>${muted ? "on" : "off"}</value></Mute></item>`;
}

function xmlResponse(xml: string, ok = true, status = 200) {
  return { ok, status, text: async () => xml } as Response;
}
function okResponse(ok = true, status = 200) {
  return { ok, status, text: async () => "" } as Response;
}

const client = () => new DenonClient({ ipAddress: "192.168.1.80" });

describe("DenonClient", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("getStatus parses real Power/MasterVolume/Mute fields from a captured device response shape", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(xmlResponse(statusXml({ power: "ON", volumeDb: -67, muted: false })));

    await expect(client().getStatus()).resolves.toEqual({ power: "ON", volumeDb: -67, muted: false });

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://192.168.1.80:80/goform/formMainZone_MainZoneXmlStatus.xml");
  });

  test("getStatus parses lowercase 'on' Mute as true", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(xmlResponse(statusXml({ muted: true })));
    await expect(client().getStatus()).resolves.toMatchObject({ muted: true });
  });

  test("powerOn/powerStandby hit the documented formiPhoneAppPower.xml endpoints", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(okResponse());

    await client().powerOn();
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppPower.xml?1+PowerOn");

    await client().powerStandby();
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppPower.xml?1+PowerStandby");
  });

  test("volumeUp/volumeDown hit the documented MVUP/MVDOWN direct commands", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(okResponse());

    await client().volumeUp();
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppDirect.xml?MVUP");

    await client().volumeDown();
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppDirect.xml?MVDOWN");
  });

  test("setVolume sends the receiver's own dB scale to one decimal place, not a 0-100 conversion", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());

    await client().setVolume(-52.5);

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppVolume.xml?1+-52.5");
  });

  test("setMute sends MuteOn/MuteOff", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(okResponse());

    await client().setMute(true);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppMute.xml?1+MuteOn");

    await client().setMute(false);
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppMute.xml?1+MuteOff");
  });

  test("a non-2xx HTTP response raises a real error", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(xmlResponse("", false, 500));
    await expect(client().getStatus()).rejects.toThrow(/HTTP 500/);
  });
});
