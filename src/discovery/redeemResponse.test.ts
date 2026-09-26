import { MAX_REDEEM_RESPONSE_CHARS, PairResponseRejectedError, readBoundedJson, validateRedeemedPairing } from "./redeemResponse";

const LAN = "http://192.168.1.5:3210";
const RELAY = "https://hearth-relay.carddna.app";

describe("validateRedeemedPairing", () => {
  test("accepts a private baseUrl with a trusted public address", () => {
    expect(validateRedeemedPairing({ baseUrl: LAN, publicBaseUrl: RELAY, token: "tok" }, [])).toEqual({ baseUrl: LAN, publicBaseUrl: RELAY, token: "tok" });
  });

  test("accepts a missing public address as null", () => {
    expect(validateRedeemedPairing({ baseUrl: LAN, token: "tok" }, [])).toEqual({ baseUrl: LAN, publicBaseUrl: null, token: "tok" });
  });

  test("accepts a public address equal to the saved host", () => {
    const saved = ["https://home.example.org"];
    expect(validateRedeemedPairing({ baseUrl: LAN, publicBaseUrl: "https://home.example.org", token: "t" }, saved).publicBaseUrl).toBe("https://home.example.org");
  });

  test.each([
    ["an attacker baseUrl", { baseUrl: "https://evil.example", token: "tok" }],
    ["an http public host", { baseUrl: LAN, publicBaseUrl: "http://hearth-relay.carddna.app", token: "tok" }],
    ["an attacker public host", { baseUrl: LAN, publicBaseUrl: "https://evil.example", token: "tok" }],
    ["a private public address", { baseUrl: LAN, publicBaseUrl: "https://192.168.1.9", token: "tok" }],
    ["a userinfo trick", { baseUrl: `${RELAY}@evil.com`, token: "tok" }],
    ["a missing token", { baseUrl: LAN }],
    ["an empty token", { baseUrl: LAN, token: "  " }],
    ["a non-string token", { baseUrl: LAN, token: 5 }],
    ["an oversized token", { baseUrl: LAN, token: "x".repeat(513) }],
    ["a non-string baseUrl", { baseUrl: 5, token: "tok" }],
    ["an array", [LAN]],
    ["null", null],
    ["a string", "hello"],
  ])("rejects %s", (_label, body) => {
    expect(() => validateRedeemedPairing(body, [])).toThrow(PairResponseRejectedError);
  });
});

describe("readBoundedJson", () => {
  test("parses a normal body", async () => {
    await expect(readBoundedJson({ text: async () => '{"a":1}' } as unknown as Response)).resolves.toEqual({ a: 1 });
  });

  test("refuses a body over the size cap", async () => {
    const huge = JSON.stringify({ token: "x".repeat(MAX_REDEEM_RESPONSE_CHARS) });
    await expect(readBoundedJson({ text: async () => huge } as unknown as Response)).rejects.toBeInstanceOf(PairResponseRejectedError);
  });

  test("refuses a body that is not JSON", async () => {
    await expect(readBoundedJson({ text: async () => "<html>" } as unknown as Response)).rejects.toBeInstanceOf(PairResponseRejectedError);
  });
});
