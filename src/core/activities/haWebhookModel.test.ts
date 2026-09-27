import { isPlausibleWebhookUrl, newHomeAssistantWebhookId, normalizeActivityHomeAssistant, validateActivityHomeAssistant } from "./haWebhookModel";

describe("newHomeAssistantWebhookId", () => {
  it("returns a fresh, differently-valued id each call", () => {
    const a = newHomeAssistantWebhookId();
    const b = newHomeAssistantWebhookId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe("isPlausibleWebhookUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isPlausibleWebhookUrl("https://ha.example.com/api/webhook/abc123")).toBe(true);
    expect(isPlausibleWebhookUrl("http://192.168.1.5:8123/api/webhook/abc123")).toBe(true);
  });

  it("rejects non-http(s) schemes, garbage, and oversized values", () => {
    expect(isPlausibleWebhookUrl("ftp://ha.example.com/hook")).toBe(false);
    expect(isPlausibleWebhookUrl("not a url")).toBe(false);
    expect(isPlausibleWebhookUrl("")).toBe(false);
    expect(isPlausibleWebhookUrl(`https://ha.example.com/${"a".repeat(600)}`)).toBe(false);
  });
});

describe("normalizeActivityHomeAssistant", () => {
  it("returns undefined for non-object input", () => {
    expect(normalizeActivityHomeAssistant(undefined)).toBeUndefined();
    expect(normalizeActivityHomeAssistant(null)).toBeUndefined();
    expect(normalizeActivityHomeAssistant("nope")).toBeUndefined();
    expect(normalizeActivityHomeAssistant([])).toBeUndefined();
  });

  it("preserves an explicitly-empty object as {} (both directions off, but configured)", () => {
    expect(normalizeActivityHomeAssistant({})).toEqual({});
  });

  it("keeps a valid incomingWebhookId and outgoingWebhookUrl", () => {
    const raw = { incomingWebhookId: "abc-123", outgoingWebhookUrl: "https://ha.example.com/api/webhook/xyz" };
    expect(normalizeActivityHomeAssistant(raw)).toEqual(raw);
  });

  it("drops a malformed outgoingWebhookUrl but keeps a valid incomingWebhookId", () => {
    expect(normalizeActivityHomeAssistant({ incomingWebhookId: "abc-123", outgoingWebhookUrl: "not a url" })).toEqual({ incomingWebhookId: "abc-123" });
  });

  it("trims whitespace and drops a blank incomingWebhookId", () => {
    expect(normalizeActivityHomeAssistant({ incomingWebhookId: "  " })).toEqual({});
    expect(normalizeActivityHomeAssistant({ incomingWebhookId: " abc-123 " })).toEqual({ incomingWebhookId: "abc-123" });
  });
});

describe("validateActivityHomeAssistant", () => {
  it("is fine when absent or when outgoing is unset", () => {
    expect(validateActivityHomeAssistant(undefined)).toBeNull();
    expect(validateActivityHomeAssistant({})).toBeNull();
    expect(validateActivityHomeAssistant({ incomingWebhookId: "abc" })).toBeNull();
  });

  it("is fine for a plausible outgoing URL", () => {
    expect(validateActivityHomeAssistant({ outgoingWebhookUrl: "https://ha.example.com/api/webhook/xyz" })).toBeNull();
  });

  it("rejects an implausible outgoing URL", () => {
    expect(validateActivityHomeAssistant({ outgoingWebhookUrl: "not a url" })).toMatch(/doesn't look like/);
  });
});
