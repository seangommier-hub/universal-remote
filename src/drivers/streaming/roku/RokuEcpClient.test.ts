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

  // Real shapes per Roku's own ECP docs (developer.roku.com/dev/docs/external-control-api),
  // added 2026-09-15 (ADR-HEARTH-068) as the corroborating signal for RokuEcpDriver's
  // refreshPlaybackState — see RokuActiveApp's own doc comment for what this can/can't detect.
  test("getActiveApp reports a real app as running, not the home screen", async () => {
    const xml = `<active-app><app id="12" type="appl" version="4.3.109">Netflix</app></active-app>`;
    (global.fetch as jest.Mock).mockResolvedValueOnce(textResponse(xml));
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    const activeApp = await client.getActiveApp();

    expect(activeApp).toEqual({ appName: "Netflix", isHomeScreen: false, isScreensaver: false });
  });

  test("getActiveApp reports the home screen correctly (no id attribute, name 'Roku')", async () => {
    const xml = `<active-app><app>Roku</app></active-app>`;
    (global.fetch as jest.Mock).mockResolvedValueOnce(textResponse(xml));
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    const activeApp = await client.getActiveApp();

    expect(activeApp).toEqual({ appName: "Roku", isHomeScreen: true, isScreensaver: false });
  });

  test("getActiveApp detects the screensaver sibling element", async () => {
    const xml = `<active-app><app>Roku</app><screensaver id="55c6" type="ssvr" version="1.0.0">Screen Saver</screensaver></active-app>`;
    (global.fetch as jest.Mock).mockResolvedValueOnce(textResponse(xml));
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    const activeApp = await client.getActiveApp();

    expect(activeApp.isScreensaver).toBe(true);
  });

  test("getActiveApp throws on a non-OK response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(textResponse("", false, 500));
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    await expect(client.getActiveApp()).rejects.toThrow("HTTP 500");
  });

  // Real shape per python-rokuecp's own Application model, added 2026-09-16 (ADR-HEARTH-076) —
  // see RokuApp's own doc comment for the full citation and its one honest caveat.
  test("getApps parses every installed channel from a real-shaped /query/apps response", async () => {
    const xml = `<apps><app id="12" type="appl" version="4.3.109">Netflix</app><app id="2285" type="appl" version="1.0">Hulu</app></apps>`;
    (global.fetch as jest.Mock).mockResolvedValueOnce(textResponse(xml));
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    const apps = await client.getApps();

    expect(apps).toEqual([
      { id: "12", name: "Netflix" },
      { id: "2285", name: "Hulu" },
    ]);
  });

  test("getApps returns a single-element list correctly, not just a lone object (the exact XML->dict pitfall python-rokuecp's own source works around)", async () => {
    const xml = `<apps><app id="12" type="appl" version="4.3.109">Netflix</app></apps>`;
    (global.fetch as jest.Mock).mockResolvedValueOnce(textResponse(xml));
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    const apps = await client.getApps();

    expect(apps).toEqual([{ id: "12", name: "Netflix" }]);
  });

  test("getApps drops an app with no id attribute rather than including one Hearth could never launch", async () => {
    const xml = `<apps><app>Roku</app><app id="12" version="4.3.109">Netflix</app></apps>`;
    (global.fetch as jest.Mock).mockResolvedValueOnce(textResponse(xml));
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    const apps = await client.getApps();

    expect(apps).toEqual([{ id: "12", name: "Netflix" }]);
  });

  test("getApps throws on a non-OK response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(textResponse("", false, 500));
    const client = new RokuEcpClient({ ipAddress: "192.168.1.80" });

    await expect(client.getApps()).rejects.toThrow("HTTP 500");
  });
});
