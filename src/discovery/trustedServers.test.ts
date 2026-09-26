import { hostOf, isPrivateHost, isTrustedPublicUrl, isTrustedServerUrl, parseServerUrl, sanitizeLinkServer, TRUSTED_PUBLIC_SUFFIXES } from "./trustedServers";
import { pairInviteFromUrl } from "../ui/usePairLinkListener";

const SAVED_PUBLIC = "https://home.example.org";
const SAVED = ["http://192.168.1.5:3210", SAVED_PUBLIC];

describe("trusted public suffixes", () => {
  test("live in one named list", () => {
    expect(TRUSTED_PUBLIC_SUFFIXES).toEqual([".carddna.app"]);
  });
});

describe("isTrustedServerUrl allowlist matrix", () => {
  test.each([
    ["http://192.168.1.5:3210", true],
    ["https://192.168.1.5", true],
    ["http://10.0.0.7:3210", true],
    ["http://172.16.0.1", true],
    ["http://172.31.255.254", true],
    ["http://hearth.local:3210", true],
    ["https://hearth-relay.carddna.app", true],
    ["https://hearth-relay.carddna.app/", true],
    ["https://a.b.carddna.app:8443/x", true],
    ["http://hearth-relay.carddna.app", false],
    ["https://carddna.app", false],
    ["http://172.15.0.1", false],
    ["http://172.32.0.1", false],
    ["http://192.169.1.5", false],
    ["http://11.0.0.1", false],
    ["https://evil.example", false],
    ["http://evil.example", false],
    ["https://home.example.org", true],
    ["http://home.example.org", false],
    ["https://other.example.org", false],
  ])("%s -> %s", (url, expected) => {
    expect(isTrustedServerUrl(url, SAVED)).toBe(expected);
  });
});

describe("hostile server values are rejected", () => {
  test.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://192.168.1.5",
    "https://hearth-relay.carddna.app@evil.com",
    "https://hearth-relay.carddna.app:pw@evil.com",
    "https://evil.com\\@hearth-relay.carddna.app",
    "https://evil.com#@hearth-relay.carddna.app",
    "https://evil.com?.carddna.app",
    "https://carddna.app.evil.com",
    "https://hearth-relay.carddna.app.evil.com",
    "https://evilcarddna.app",
    "https://hearth-relay.carddna.app.",
    "https://xn--carddna-9ta.app",
    "https://[::1]",
    "http://[fd00::1]",
    "http://127.0.0.1",
    "http://localhost",
    "http://0x7f.1",
    "http://2130706433",
    "http://192.168.1",
    "http://192.168.001.5",
    "http://010.0.0.1",
    "http://192.168.1.5.evil.com",
    "http://10.0.0.1.evil.com",
    "http://192.168.1.256",
    "http://hearth.local.evil.com",
    "https://evil.com:99999",
    "//evil.com",
    "evil.com",
    "",
  ])("%s", (url) => {
    expect(isTrustedServerUrl(url, SAVED)).toBe(false);
  });

  test("a saved host never excuses a lookalike", () => {
    expect(isTrustedServerUrl("https://home.example.org.evil.com", SAVED)).toBe(false);
    expect(isTrustedServerUrl("https://evil.com@home.example.org", SAVED)).toBe(false);
  });
});

describe("sanitizeLinkServer", () => {
  test("keeps a trusted address without its trailing slash", () => {
    expect(sanitizeLinkServer("https://hearth-relay.carddna.app/", [])).toBe("https://hearth-relay.carddna.app");
  });

  test("drops an untrusted or missing address", () => {
    expect(sanitizeLinkServer("https://evil.example", [])).toBeUndefined();
    expect(sanitizeLinkServer(undefined, [])).toBeUndefined();
  });
});

describe("helpers", () => {
  test("parseServerUrl lowercases the host and reports the scheme", () => {
    expect(parseServerUrl("HTTPS://Hearth.Local:80/x")).toEqual({ scheme: "https", host: "hearth.local" });
    expect(hostOf("http://192.168.1.5:3210")).toBe("192.168.1.5");
    expect(hostOf("nonsense")).toBeNull();
  });

  test("isPrivateHost rejects IP-shaped names that are not plain private IPv4", () => {
    expect(isPrivateHost("192.168.1.5")).toBe(true);
    expect(isPrivateHost("192.168.1.5.local")).toBe(true);
    expect(isPrivateHost("8.8.8.8")).toBe(false);
  });

  test("isTrustedPublicUrl requires https and never accepts a bare private address", () => {
    expect(isTrustedPublicUrl("https://hearth-relay.carddna.app", [])).toBe(true);
    expect(isTrustedPublicUrl("http://hearth-relay.carddna.app", [])).toBe(false);
    expect(isTrustedPublicUrl("https://192.168.1.5", [])).toBe(false);
    expect(isTrustedPublicUrl(SAVED_PUBLIC, SAVED)).toBe(true);
  });
});

describe("hostile hearth://pair links", () => {
  test("parse to an invite whose server is then filtered, never redeemed here", () => {
    const invite = pairInviteFromUrl("hearth://pair?code=ABCD1234&server=https%3A%2F%2Fevil.example");
    expect(invite).toEqual({ code: "ABCD1234", server: "https://evil.example" });
    expect(sanitizeLinkServer(invite?.server, [])).toBeUndefined();
  });

  test("a javascript: or web URL is not a pair link at all", () => {
    expect(pairInviteFromUrl("javascript:alert(1)")).toBeNull();
    expect(pairInviteFromUrl("https://evil.example/?code=ABCD1234")).toBeNull();
    expect(pairInviteFromUrl(null)).toBeNull();
  });
});
