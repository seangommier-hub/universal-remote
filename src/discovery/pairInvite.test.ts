import { buildPairLink, normalizePairCode, parsePairInput } from "./pairInvite";
import { EXPIRED_LABEL, formatCountdown, secondsUntilExpiry } from "./inviteCountdown";

describe("normalizePairCode", () => {
  test("uppercases and strips spaces and dashes", () => {
    expect(normalizePairCode(" k7m-2 qx9p ")).toBe("K7M2QX9P");
  });
});

describe("parsePairInput", () => {
  test("accepts a bare code with mixed case and separators", () => {
    expect(parsePairInput("k7m2-qx9p")).toEqual({ code: "K7M2QX9P" });
  });

  test("rejects an incomplete code", () => {
    expect(parsePairInput("K7M2")).toBeNull();
    expect(parsePairInput("")).toBeNull();
  });

  test("reads code and server from a pasted hearth link", () => {
    const link = buildPairLink("K7M2QX9P", "https://hearth-relay.carddna.app");
    expect(parsePairInput(`  ${link} `)).toEqual({ code: "K7M2QX9P", server: "https://hearth-relay.carddna.app" });
  });

  test("accepts a link without a server", () => {
    expect(parsePairInput("hearth://pair?code=k7m2qx9p")).toEqual({ code: "K7M2QX9P", server: undefined });
  });

  test("rejects a link with a missing or short code", () => {
    expect(parsePairInput("hearth://pair?server=http%3A%2F%2Fx")).toBeNull();
    expect(parsePairInput("hearth://pair?code=ABC")).toBeNull();
  });
});

describe("buildPairLink", () => {
  test("encodes the server so it survives a round trip", () => {
    const link = buildPairLink("K7M2QX9P", "http://192.168.1.5:3210");
    expect(link).toBe("hearth://pair?code=K7M2QX9P&server=http%3A%2F%2F192.168.1.5%3A3210");
    expect(parsePairInput(link)?.server).toBe("http://192.168.1.5:3210");
  });
});

describe("invite countdown", () => {
  const now = Date.parse("2026-09-26T12:00:00.000Z");

  test("counts whole seconds left and formats m:ss", () => {
    expect(secondsUntilExpiry("2026-09-26T12:09:41.000Z", now)).toBe(581);
    expect(formatCountdown(581)).toBe("9:41");
    expect(formatCountdown(65)).toBe("1:05");
  });

  test("never goes negative and reports expired", () => {
    expect(secondsUntilExpiry("2026-09-26T11:59:00.000Z", now)).toBe(0);
    expect(formatCountdown(0)).toBe(EXPIRED_LABEL);
  });

  test("treats an unreadable date as expired", () => {
    expect(secondsUntilExpiry("not a date", now)).toBe(0);
  });
});
