import { SonosApiError, SonosClient } from "./SonosClient";

function soapResponse(bodyFields: Record<string, string | number>, ok = true, status = 200) {
  const inner = Object.entries(bodyFields)
    .map(([tag, value]) => `<${tag}>${value}</${tag}>`)
    .join("");
  const xml = `<?xml version="1.0"?><s:Envelope><s:Body><u:Response>${inner}</u:Response></s:Body></s:Envelope>`;
  return { ok, status, text: async () => xml } as Response;
}

const client = () => new SonosClient({ ipAddress: "192.168.1.90" });

describe("SonosClient", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("getVolume POSTs the documented RenderingControl SOAP envelope and parses CurrentVolume", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(soapResponse({ CurrentVolume: 42 }));

    await expect(client().getVolume()).resolves.toBe(42);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://192.168.1.90:1400/RenderingControl/Control");
    expect(init.headers.SOAPACTION).toBe("urn:schemas-upnp-org:service:RenderingControl:1#GetVolume");
    expect(init.headers["Content-Type"]).toBe('text/xml; charset="utf-8"');
    expect(init.body).toContain("<u:GetVolume");
    expect(init.body).toContain("<InstanceID>0</InstanceID><Channel>Master</Channel>");
  });

  test("setVolume clamps to 0-100 and sends DesiredVolume", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(soapResponse({}));

    await client().setVolume(150);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.body).toContain("<DesiredVolume>100</DesiredVolume>");
  });

  test("setVolume clamps negative values to 0", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(soapResponse({}));

    await client().setVolume(-10);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.body).toContain("<DesiredVolume>0</DesiredVolume>");
  });

  test("getMute parses CurrentMute '1'/'0' as a real boolean", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(soapResponse({ CurrentMute: 1 }));
    await expect(client().getMute()).resolves.toBe(true);
  });

  test("setMute sends DesiredMute as '1' or '0', not a JS boolean", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(soapResponse({}));

    await client().setMute(true);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.body).toContain("<DesiredMute>1</DesiredMute>");
  });

  test("getTransportState parses CurrentTransportState from AVTransport", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(soapResponse({ CurrentTransportState: "PLAYING" }));

    await expect(client().getTransportState()).resolves.toBe("PLAYING");

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://192.168.1.90:1400/AVTransport/Control");
    expect(init.headers.SOAPACTION).toBe("urn:schemas-upnp-org:service:AVTransport:1#GetTransportInfo");
  });

  test("play() and pause() send the documented Speed=1 argument", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(soapResponse({}));

    await client().play();
    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain("<Speed>1</Speed>");
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers.SOAPACTION).toBe("urn:schemas-upnp-org:service:AVTransport:1#Play");

    await client().pause();
    expect((global.fetch as jest.Mock).mock.calls[1][1].headers.SOAPACTION).toBe("urn:schemas-upnp-org:service:AVTransport:1#Pause");
  });

  test("a non-2xx HTTP response raises SonosApiError with the real status code", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(soapResponse({}, false, 500));

    await expect(client().getVolume()).rejects.toBeInstanceOf(SonosApiError);
  });
});
