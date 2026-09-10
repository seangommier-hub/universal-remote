import { RokuEcpClient } from "./RokuEcpClient";

function textResponse(body: string, ok = true, status = 200) {
  return { ok, status, text: async () => body } as Response;
}

describe("RokuEcpClient", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("keypress POSTs to /keypress/<key> on the default ECP port", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    await client.keypress("Home");

    expect(global.fetch).toHaveBeenCalledWith("http://192.168.1.80:8060/keypress/Home", expect.objectContaining({ method: "POST" }));
  });

  test("keypress throws on a non-OK response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    await expect(client.keypress("Home")).rejects.toThrow("HTTP 500");
  });

  test("launchChannel POSTs to /launch/<channel id> (real-hardware research, 2026-09-10)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    await client.launchChannel("12"); // Netflix's real, public Roku channel id

    expect(global.fetch).toHaveBeenCalledWith("http://192.168.1.80:8060/launch/12", expect.objectContaining({ method: "POST" }));
  });

  test("launchChannel throws on a non-OK response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    await expect(client.launchChannel("12")).rejects.toThrow("HTTP 500");
  });

  test("getDeviceInfo parses power-mode and model-name out of the XML response", async () => {
    const xml = `<device-info><udn>abc</udn><power-mode>PowerOn</power-mode><model-name>Roku Ultra</model-name></device-info>`;
    (global.fetch as jest.Mock).mockResolvedValueOnce(textResponse(xml));
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    const info = await client.getDeviceInfo();

    expect(info).toEqual({ powerMode: "PowerOn", modelName: "Roku Ultra" });
  });

  test("getDeviceInfo throws on a non-OK response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(textResponse("", false, 404));
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    await expect(client.getDeviceInfo()).rejects.toThrow("HTTP 404");
  });
});
