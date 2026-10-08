import { describeDeviceStatus, DeviceStatusInput, MAX_ERROR_CHARS, NEEDS_RE_PAIR_STATUS, STALE_CONNECTED_SECONDS } from "./describeDeviceStatus";

const base: DeviceStatusInput = { connection: "disconnected", wakeBurstActive: false, connectivityMode: "home" };

describe("describeDeviceStatus", () => {
  test("a connected device reads simply Connected", () => {
    expect(describeDeviceStatus({ ...base, connection: "connected", secondsSinceLastSeen: 5 })).toBe("Connected");
  });

  test("a connected device with a long-stale update mentions its age", () => {
    const text = describeDeviceStatus({ ...base, connection: "connected", secondsSinceLastSeen: STALE_CONNECTED_SECONDS + 60 });
    expect(text).toBe("Connected, last update 6 min ago");
  });

  test("a wake burst wins over everything else when not connected", () => {
    const text = describeDeviceStatus({ ...base, wakeBurstActive: true, lastError: "Timed out", connectivityMode: "away" });
    expect(text).toBe("Waking up (this can take a minute)");
  });

  test("away with the relay answering says reachable through the relay only", () => {
    expect(describeDeviceStatus({ ...base, connectivityMode: "away", fccReachable: true })).toBe("Reachable through the relay only — retrying");
  });

  test("away with the relay not answering says so", () => {
    expect(describeDeviceStatus({ ...base, connectivityMode: "away", fccReachable: false })).toBe("Away, and the relay isn't answering — retrying");
  });

  test("away with relay reachability unknown still reads as relay-only", () => {
    expect(describeDeviceStatus({ ...base, connectivityMode: "away" })).toMatch(/relay only/);
  });

  test("a timeout or refusal at home asks whether it is plugged in and on Wi-Fi", () => {
    for (const lastError of ["Timed out connecting to 192.168.1.218:3001", "connect ECONNREFUSED 192.168.1.217:80", "Network request failed"]) {
      expect(describeDeviceStatus({ ...base, lastError })).toBe("Can't reach it — plugged in and on Wi-Fi? Retrying");
    }
  });

  test("an unrecognised error is quoted briefly and truncated", () => {
    expect(describeDeviceStatus({ ...base, lastError: "Pairing key mismatch" })).toBe("Last try failed: Pairing key mismatch — retrying");
    const long = describeDeviceStatus({ ...base, lastError: "x".repeat(200) });
    expect(long).toContain("…");
    expect(long.length).toBeLessThan(MAX_ERROR_CHARS + 40);
  });

  test("an unknown connection with no error says it is connecting", () => {
    expect(describeDeviceStatus({ ...base, connection: "unknown" })).toBe("Connecting… retrying until it answers");
  });

  test("disconnected with no error says retrying and includes last seen when known", () => {
    expect(describeDeviceStatus(base)).toBe("Not connected — retrying automatically");
    expect(describeDeviceStatus({ ...base, secondsSinceLastSeen: 30 })).toBe("Not connected — retrying automatically (last seen just now)");
    expect(describeDeviceStatus({ ...base, secondsSinceLastSeen: 240 })).toContain("last seen 4 min ago");
    expect(describeDeviceStatus({ ...base, secondsSinceLastSeen: 7200 })).toContain("last seen 2 h ago");
    expect(describeDeviceStatus({ ...base, secondsSinceLastSeen: 200000 })).toContain("last seen 2 d ago");
  });

  describe("a device whose saved pairing was refused (ADR-HEARTH-223)", () => {
    test("says it needs re-pairing and where to do that, instead of quoting a raw error", () => {
      expect(describeDeviceStatus({ ...base, needsRePair: true, lastError: "Timed out" })).toBe(NEEDS_RE_PAIR_STATUS);
    });

    test("a wake burst or being away still comes first, since a re-pair needs the TV on and in sight", () => {
      expect(describeDeviceStatus({ ...base, needsRePair: true, wakeBurstActive: true })).toBe("Waking up (this can take a minute)");
      expect(describeDeviceStatus({ ...base, needsRePair: true, connectivityMode: "away" })).toMatch(/relay only/);
    });

    test("a connected device never mentions it", () => {
      expect(describeDeviceStatus({ ...base, connection: "connected", needsRePair: true })).toBe("Connected");
    });
  });

  test("every not-connected line says Hearth is retrying", () => {
    const inputs: DeviceStatusInput[] = [
      base,
      { ...base, connection: "unknown" },
      { ...base, wakeBurstActive: true },
      { ...base, connectivityMode: "away" },
      { ...base, lastError: "Timed out" },
      { ...base, lastError: "weird" },
    ];
    for (const input of inputs) expect(describeDeviceStatus(input)).toMatch(/retrying|can take a minute/i);
  });
});
