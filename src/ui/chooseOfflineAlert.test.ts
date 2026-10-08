import { chooseOfflineAlert, FCC_ALERT_KEY, formatOutageDuration, OfflineAlertInput } from "./chooseOfflineAlert";

const MINUTE = 60_000;
const healthy: OfflineAlertInput = {
  fccOutageMs: null,
  fccConfigured: true,
  outages: [],
  deviceNames: new Map([["tv", "Den TV"], ["roku", "Basement Roku"]]),
  dismissed: new Set(),
};

describe("chooseOfflineAlert", () => {
  test("shows nothing when healthy", () => {
    expect(chooseOfflineAlert(healthy)).toBeNull();
  });

  test("shows the relay message when the relay has been down", () => {
    const alert = chooseOfflineAlert({ ...healthy, fccOutageMs: 3 * MINUTE });
    expect(alert).toMatchObject({ kind: "fcc", key: FCC_ALERT_KEY });
    expect(alert?.message).toBe("Family Command Center isn't answering — remote-from-anywhere is off; retrying");
  });

  test("never shows the relay message when no Pi is configured", () => {
    expect(chooseOfflineAlert({ ...healthy, fccConfigured: false, fccOutageMs: 3 * MINUTE })).toBeNull();
  });

  test("names the device and how long it has been silent", () => {
    const alert = chooseOfflineAlert({ ...healthy, outages: [{ deviceId: "tv", silentMs: 5 * MINUTE }] });
    expect(alert).toMatchObject({ kind: "device", deviceId: "tv", message: "Den TV hasn't answered for 5 min" });
  });

  test("a silent device whose saved pairing was refused asks for a re-pair instead of just reporting silence (ADR-HEARTH-223)", () => {
    const alert = chooseOfflineAlert({ ...healthy, outages: [{ deviceId: "tv", silentMs: 5 * MINUTE }], rePairDeviceIds: new Set(["tv"]) });
    expect(alert).toMatchObject({ kind: "device", deviceId: "tv", needsRePair: true, message: "Den TV needs to be re-paired — it no longer accepts Hearth's saved pairing" });
  });

  test("a flagged device that was never connected this session (so has no outage record) still gets the re-pair alert", () => {
    const alert = chooseOfflineAlert({ ...healthy, outages: [], rePairDeviceIds: new Set(["tv"]) });
    expect(alert).toMatchObject({ kind: "device", deviceId: "tv", needsRePair: true });
  });

  test("a flagged device that is not in the household is ignored, and a dismissed re-pair alert stays hidden", () => {
    expect(chooseOfflineAlert({ ...healthy, rePairDeviceIds: new Set(["gone"]) })).toBeNull();
    expect(chooseOfflineAlert({ ...healthy, rePairDeviceIds: new Set(["tv"]), dismissed: new Set(["device:tv"]) })).toBeNull();
  });

  test("a silent device that is not flagged keeps the plain silence message", () => {
    const alert = chooseOfflineAlert({ ...healthy, outages: [{ deviceId: "tv", silentMs: 5 * MINUTE }], rePairDeviceIds: new Set(["roku"]) });
    expect(alert).toMatchObject({ deviceId: "tv", needsRePair: false, message: "Den TV hasn't answered for 5 min" });
  });

  test("only one banner at a time: the relay wins over a device", () => {
    const alert = chooseOfflineAlert({ ...healthy, fccOutageMs: 5 * MINUTE, outages: [{ deviceId: "tv", silentMs: 9 * MINUTE }] });
    expect(alert?.kind).toBe("fcc");
  });

  test("a dismissed alert stays hidden and the next one takes over", () => {
    const input = { ...healthy, outages: [{ deviceId: "tv", silentMs: 9 * MINUTE }, { deviceId: "roku", silentMs: 3 * MINUTE }] };
    const alert = chooseOfflineAlert({ ...input, dismissed: new Set(["device:tv"]) });
    expect(alert).toMatchObject({ deviceId: "roku" });
    expect(chooseOfflineAlert({ ...input, dismissed: new Set(["device:tv", "device:roku"]) })).toBeNull();
  });

  test("skips a device that is no longer in the household", () => {
    expect(chooseOfflineAlert({ ...healthy, outages: [{ deviceId: "gone", silentMs: 9 * MINUTE }] })).toBeNull();
  });

  test("formats minutes and hours", () => {
    expect(formatOutageDuration(30_000)).toBe("1 min");
    expect(formatOutageDuration(59 * MINUTE)).toBe("59 min");
    expect(formatOutageDuration(125 * MINUTE)).toBe("2 h");
  });
});
