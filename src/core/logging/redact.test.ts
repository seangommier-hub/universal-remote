import { REDACTED, redactMessage, redactMeta } from "./redact";

describe("redactMeta", () => {
  test("redacts sensitive keys regardless of case", () => {
    const result = redactMeta({ Authorization: "Bearer abc", token: "t", psk: "p", clientKey: "c", client_key: "c2", secret: "s", password: "pw", ok: "fine" });
    expect(result).toEqual({ Authorization: REDACTED, token: REDACTED, psk: REDACTED, clientKey: REDACTED, client_key: REDACTED, secret: REDACTED, password: REDACTED, ok: "fine" });
  });

  test("redacts sensitive keys inside nested objects and arrays", () => {
    const result = redactMeta({ outer: { inner: { pairingToken: "x", host: "tv" } }, list: [{ psk: "y" }] });
    expect(result).toEqual({ outer: { inner: { pairingToken: REDACTED, host: "tv" } }, list: [{ psk: REDACTED }] });
  });

  test("redacts secret-looking text inside string values", () => {
    const result = redactMeta({ note: "sent header Authorization: Bearer abc.def-123 to server", url: "http://x/y?token=abcd&a=1" });
    expect(JSON.stringify(result)).not.toMatch(/abc\.def|abcd/);
    expect(result.url as string).toContain("a=1");
  });

  test("serializes Errors to name and message and survives cycles", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    const result = redactMeta({ err: new Error("boom"), cyclic });
    expect(result.err).toEqual({ name: "Error", message: "boom" });
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});

describe("redactMessage", () => {
  test("redacts Bearer tokens and key=value secrets in message text", () => {
    const text = redactMessage('Request failed Authorization: Bearer sekret123 psk=abcdef clientKey: "k-9" {"token":"tt"}');
    expect(text).not.toMatch(/sekret123|abcdef|k-9|"tt"/);
    expect(text).toContain(REDACTED);
  });

  test("leaves ordinary messages untouched and truncates very long ones", () => {
    expect(redactMessage("LG TV connection lost")).toBe("LG TV connection lost");
    expect(redactMessage("x".repeat(2000)).length).toBeLessThan(600);
  });
});
