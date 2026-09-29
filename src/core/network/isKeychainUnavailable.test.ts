import { isKeychainUnavailable } from "./isKeychainUnavailable";

describe("isKeychainUnavailable", () => {
  test("recognizes the real error text captured from a locked/backgrounded phone (ADR-HEARTH-203)", () => {
    const error = new Error(
      "FunctionCallException: Calling the 'getValueWithKeyAsync' function has failed (at ExpoModulesCore/AsyncFunctionDefinition.swift:123) " +
        "→ Caused by: KeyChainException: User interaction is not allowed. (at ExpoSecureStore/SecureStoreModule.swift:168)"
    );
    expect(isKeychainUnavailable(error)).toBe(true);
  });

  test("matches on 'User interaction is not allowed' alone, case-insensitively", () => {
    expect(isKeychainUnavailable(new Error("user interaction IS NOT ALLOWED right now"))).toBe(true);
  });

  test("matches a plain string, not just an Error instance", () => {
    expect(isKeychainUnavailable("KeyChainException: locked")).toBe(true);
  });

  test("returns false for a genuine network failure", () => {
    expect(isKeychainUnavailable(new Error("Network request failed"))).toBe(false);
  });

  test("returns false for a missing-credential case (no error, just null)", () => {
    expect(isKeychainUnavailable(new Error("not found"))).toBe(false);
  });

  test("returns false for undefined/non-error values without throwing", () => {
    expect(isKeychainUnavailable(undefined)).toBe(false);
    expect(isKeychainUnavailable(null)).toBe(false);
  });
});
