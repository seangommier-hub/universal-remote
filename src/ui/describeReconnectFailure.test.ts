import { describeReconnectFailure } from "./describeReconnectFailure";

describe("describeReconnectFailure", () => {
  test("a blocked home network names the likely causes", () => {
    const text = describeReconnectFailure("Network request failed");
    expect(text).toMatch(/Private Relay/);
    expect(text).toMatch(/Local Network/);
    expect(text).toMatch(/still retrying automatically/);
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
