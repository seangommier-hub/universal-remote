import { buildVncRelayUrl } from "./familyCommandCenterVncRelay";

describe("buildVncRelayUrl", () => {
  test("builds a ws:// URL on the dedicated relay port (3212), same host as baseUrl, ignoring baseUrl's own port", () => {
    const url = buildVncRelayUrl({ baseUrl: "http://192.168.1.50:8080", token: "abc123" });
    expect(url).toBe("ws://192.168.1.50:3212/?token=abc123");
  });

  test("uses ws:// even when baseUrl is https:// — the relay is a plain internal LAN hop, not the Center's own TLS app", () => {
    const url = buildVncRelayUrl({ baseUrl: "https://fcc.example.com", token: "abc123" });
    expect(url).toBe("ws://fcc.example.com:3212/?token=abc123");
  });

  test("URL-encodes a token containing special characters", () => {
    const url = buildVncRelayUrl({ baseUrl: "http://192.168.1.50", token: "a b+c/d" });
    expect(url).toBe("ws://192.168.1.50:3212/?token=a%20b%2Bc%2Fd");
  });
});
