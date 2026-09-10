import { buildVncRelayUrl } from "./familyCommandCenterVncRelay";

describe("buildVncRelayUrl", () => {
  test("converts http:// to ws:// and appends the relay path + token", () => {
    const url = buildVncRelayUrl({ baseUrl: "http://192.168.1.50:8080", token: "abc123" });
    expect(url).toBe("ws://192.168.1.50:8080/api/integrations/hearth/relay/vnc?token=abc123");
  });

  test("converts https:// to wss:// (not ws:// with a stray 's')", () => {
    const url = buildVncRelayUrl({ baseUrl: "https://fcc.example.com", token: "abc123" });
    expect(url).toBe("wss://fcc.example.com/api/integrations/hearth/relay/vnc?token=abc123");
  });

  test("URL-encodes a token containing special characters", () => {
    const url = buildVncRelayUrl({ baseUrl: "http://192.168.1.50", token: "a b+c/d" });
    expect(url).toBe("ws://192.168.1.50/api/integrations/hearth/relay/vnc?token=a%20b%2Bc%2Fd");
  });
});
