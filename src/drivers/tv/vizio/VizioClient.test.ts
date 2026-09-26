import { fccJsonRequest } from "../../../core/network/fccJsonRequest";
import { VIZIO_KEYS, VizioApiError, finishPairing, isPoweredOn, pressKey, readCurrentInput, readMuted, readVolume, startPairing, startPairingOnAnyPort, switchInput } from "./VizioClient";

jest.mock("../../../core/network/fccJsonRequest");
const mockRelay = fccJsonRequest as jest.MockedFunction<typeof fccJsonRequest>;

const TARGET = { ipAddress: "192.168.1.88", port: 7345, authToken: "tok" };

function reply(body: unknown, status = 200) {
  return { status, body: JSON.stringify(body) };
}

function lastRelayed(): Record<string, unknown> {
  const init = mockRelay.mock.calls[mockRelay.mock.calls.length - 1][1] as RequestInit;
  return JSON.parse(init.body as string);
}

beforeEach(() => mockRelay.mockReset());

describe("pairing", () => {
  test("startPairing asks the TV to show a PIN and returns the pairing token", async () => {
    mockRelay.mockResolvedValueOnce(reply({ STATUS: { RESULT: "SUCCESS" }, ITEM: { PAIRING_REQ_TOKEN: 123 } }));

    expect(await startPairing("192.168.1.88", 7345)).toBe(123);
    expect(mockRelay.mock.calls[0][0]).toBe("/api/integrations/hearth/vizio/request");
    expect(lastRelayed()).toMatchObject({ ip: "192.168.1.88", port: 7345, method: "PUT", path: "/pairing/start" });
  });

  test("finishPairing sends the PIN with the pairing token and returns the auth token", async () => {
    mockRelay.mockResolvedValueOnce(reply({ STATUS: { RESULT: "SUCCESS" }, ITEM: { AUTH_TOKEN: "Zabc" } }));

    expect(await finishPairing("192.168.1.88", 7345, 123, "1234")).toBe("Zabc");
    expect(lastRelayed()).toMatchObject({ path: "/pairing/pair", body: { RESPONSE_VALUE: "1234", PAIRING_REQ_TOKEN: 123 } });
  });

  test("a wrong PIN is reported, not treated as paired", async () => {
    mockRelay.mockResolvedValueOnce(reply({ STATUS: { RESULT: "BLOCKED" } }));

    await expect(finishPairing("192.168.1.88", 7345, 123, "0000")).rejects.toThrow(VizioApiError);
  });

  test("startPairingOnAnyPort falls back to the second port when the first does not answer", async () => {
    mockRelay.mockRejectedValueOnce(new Error("no route"));
    mockRelay.mockResolvedValueOnce(reply({ STATUS: { RESULT: "SUCCESS" }, ITEM: { PAIRING_REQ_TOKEN: 9 } }));

    expect(await startPairingOnAnyPort("192.168.1.88")).toEqual({ port: 9000, pairingToken: 9 });
  });

  test("startPairingOnAnyPort rethrows the last failure when no port answers", async () => {
    mockRelay.mockRejectedValue(new Error("no route"));

    await expect(startPairingOnAnyPort("192.168.1.88")).rejects.toThrow("no route");
    expect(mockRelay).toHaveBeenCalledTimes(2);
  });
});

describe("reading state", () => {
  test("isPoweredOn is true for 1 and false for 0, sending the auth token", async () => {
    mockRelay.mockResolvedValueOnce(reply({ STATUS: { RESULT: "SUCCESS" }, ITEMS: [{ VALUE: 1 }] }));
    mockRelay.mockResolvedValueOnce(reply({ STATUS: { RESULT: "SUCCESS" }, ITEMS: [{ VALUE: 0 }] }));

    expect(await isPoweredOn(TARGET)).toBe(true);
    expect(lastRelayed()).toMatchObject({ authToken: "tok", method: "GET", path: "/state/device/power_mode" });
    expect(await isPoweredOn(TARGET)).toBe(false);
  });

  test("volume, mute and input are read from their menu settings", async () => {
    mockRelay.mockResolvedValueOnce(reply({ ITEMS: [{ VALUE: 22 }] }));
    mockRelay.mockResolvedValueOnce(reply({ ITEMS: [{ VALUE: "On" }] }));
    mockRelay.mockResolvedValueOnce(reply({ ITEMS: [{ VALUE: "HDMI-2", HASHVAL: 5 }] }));

    expect(await readVolume(TARGET)).toBe(22);
    expect(await readMuted(TARGET)).toBe(true);
    expect(await readCurrentInput(TARGET)).toBe("HDMI-2");
  });

  test("a field of the wrong type reads as unknown instead of a guess", async () => {
    mockRelay.mockResolvedValueOnce(reply({ ITEMS: [{ VALUE: "loud" }] }));
    mockRelay.mockResolvedValueOnce(reply({ ITEMS: [{ VALUE: 3 }] }));

    expect(await readVolume(TARGET)).toBeUndefined();
    expect(await readMuted(TARGET)).toBeUndefined();
  });

  test("a non-JSON reply from the TV is a readable error", async () => {
    mockRelay.mockResolvedValueOnce({ status: 500, body: "<html>oops</html>" });

    await expect(isPoweredOn(TARGET)).rejects.toThrow(/HTTP 500/);
  });

  test("an HTTP failure status is an error even when the body parses", async () => {
    mockRelay.mockResolvedValueOnce(reply({ ITEMS: [{ VALUE: 1 }] }, 403));

    await expect(isPoweredOn(TARGET)).rejects.toMatchObject({ status: 403 });
  });
});

describe("sending commands", () => {
  test("pressKey sends the code set and code as a key press", async () => {
    mockRelay.mockResolvedValueOnce(reply({ STATUS: { RESULT: "SUCCESS" } }));

    await pressKey(TARGET, VIZIO_KEYS.volumeUp);

    expect(lastRelayed()).toMatchObject({ method: "PUT", path: "/key_command/", body: { KEYLIST: [{ CODESET: 5, CODE: 1, ACTION: "KEYPRESS" }] } });
  });

  test("switchInput reads the current input's hash and sends it back with the new input name", async () => {
    mockRelay.mockResolvedValueOnce(reply({ ITEMS: [{ VALUE: "HDMI-1", HASHVAL: 77 }] }));
    mockRelay.mockResolvedValueOnce(reply({ STATUS: { RESULT: "SUCCESS" } }));

    await switchInput(TARGET, "HDMI-3");

    expect(lastRelayed()).toMatchObject({ method: "PUT", body: { REQUEST: "MODIFY", VALUE: "HDMI-3", HASHVAL: 77 } });
  });

  test("switchInput refuses to send a change the TV cannot accept when it gave no hash", async () => {
    mockRelay.mockResolvedValueOnce(reply({ ITEMS: [{ VALUE: "HDMI-1" }] }));

    await expect(switchInput(TARGET, "HDMI-3")).rejects.toThrow(VizioApiError);
    expect(mockRelay).toHaveBeenCalledTimes(1);
  });
});
