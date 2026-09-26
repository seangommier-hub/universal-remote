import { classifyNetworkFailure } from "./classifyNetworkFailure";
import { FccNotConfiguredError, FccTokenRejectedError, FccUnreachableError } from "./fccErrors";

describe("classifyNetworkFailure", () => {
  test("lan-blocked lists the four fixes in the agreed order", () => {
    const { kind, fixes } = classifyNetworkFailure(new FccUnreachableError("x"));
    expect(kind).toBe("lan-blocked");
    expect(fixes).toHaveLength(4);
    expect(fixes[0]).toMatch(/Private Relay/);
    expect(fixes[1]).toMatch(/Limit IP Address Tracking.*Private Wi-Fi Address/);
    expect(fixes[2]).toMatch(/Local Network/);
    expect(fixes[3]).toMatch(/home Wi-Fi.*guest/);
  });

  test.each([
    "Network request failed",
    "connect failed: no route to host",
    "error 65",
    "Family Command Center didn't respond within 8 seconds — check it's reachable and try again.",
    "Could not reach 192.168.1.50 directly, and the relay is down",
  ])("classifies %p by message as lan-blocked", (message) => {
    expect(classifyNetworkFailure(new Error(message)).kind).toBe("lan-blocked");
  });

  test("treats an AbortError as lan-blocked", () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    expect(classifyNetworkFailure(abort).kind).toBe("lan-blocked");
  });

  test.each(["10.0.0.5", "172.16.4.9", "172.31.0.1", "192.168.1.172"])("a timeout to private address %s is lan-blocked", (ip) => {
    expect(classifyNetworkFailure(new Error(`Request to ${ip} timed out`)).kind).toBe("lan-blocked");
  });

  test("a timeout to a public address is not assumed lan-blocked", () => {
    expect(classifyNetworkFailure(new Error("Request to 8.8.8.8 timed out")).kind).toBe("unknown");
    expect(classifyNetworkFailure(new Error("Request to 172.32.0.1 timed out")).kind).toBe("unknown");
  });

  test("classifies rejected tokens by class and by message", () => {
    expect(classifyNetworkFailure(new FccTokenRejectedError("x")).kind).toBe("rejected-token");
    expect(classifyNetworkFailure(new Error("Family Command Center rejected the saved token.")).kind).toBe("rejected-token");
    expect(classifyNetworkFailure(new Error("That token was rejected.")).kind).toBe("rejected-token");
  });

  test("classifies not-configured by class and by message", () => {
    expect(classifyNetworkFailure(new FccNotConfiguredError("x")).kind).toBe("not-configured");
    expect(classifyNetworkFailure(new Error("Family Command Center isn't connected — add its address and token first.")).kind).toBe("not-configured");
    expect(classifyNetworkFailure(new Error("Could not reach 192.168.1.5 directly, and Family Command Center isn't configured for relay fallback")).kind).toBe("not-configured");
  });

  test("unknown keeps the original message and offers no fixes", () => {
    const result = classifyNetworkFailure(new Error("Server returned 500."));
    expect(result).toEqual({ kind: "unknown", message: "Server returned 500.", summary: "Server returned 500.", fixes: [] });
  });

  test("handles string and non-error input", () => {
    expect(classifyNetworkFailure("Network request failed").kind).toBe("lan-blocked");
    expect(classifyNetworkFailure(undefined).kind).toBe("unknown");
  });
});
