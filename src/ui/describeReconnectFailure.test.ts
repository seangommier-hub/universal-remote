import { describeReconnectFailure } from "./describeReconnectFailure";

describe("describeReconnectFailure", () => {
  test("a blocked path to Family Command Center names the likely causes", () => {
    const text = describeReconnectFailure("Family Command Center returned Network request failed");
    expect(text).toMatch(/Private Relay/);
    expect(text).toMatch(/Local Network/);
    expect(text).toMatch(/still retrying automatically/);
  });

  test("a device that is simply switched off is never blamed on the home network", () => {
    for (const error of [
      "Network request failed",
      "Timed out connecting to 192.168.1.218:3001",
      "connect ECONNREFUSED 192.168.1.217:80",
      "Could not reach wss://192.168.1.218:3001 directly",
    ]) {
      const text = describeReconnectFailure(error);
      expect(text).not.toMatch(/Private Relay/);
      expect(text).toBe(`Last attempt: ${error} — controls are off for now, still retrying automatically.`);
    }
  });

  test("a rejected token says to re-enter it", () => {
    expect(describeReconnectFailure("Family Command Center rejected the saved token.")).toMatch(/re-enter it/);
  });

  test("any other error keeps the original wording", () => {
    expect(describeReconnectFailure("TV refused the pairing key")).toBe(
      "Last attempt: TV refused the pairing key — controls are off for now, still retrying automatically."
    );
  });
});
