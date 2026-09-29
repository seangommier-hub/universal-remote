// ADR-HEARTH-203: a real client log from this household (2026-09-28) captured expo-secure-store's
// getValueWithKeyAsync rejecting with "FunctionCallException ... Caused by: KeyChainException:
// User interaction is not allowed" while a phone was locked/backgrounded — iOS refuses Keychain
// access in that state. This is not "the credential doesn't exist" and not "the network is down";
// it is the OS declining the read/write outright, and it resolves itself the moment the phone is
// unlocked or the app returns to the foreground. Callers that read/write SecureStore during a
// reconnect or self-heal attempt need to tell this apart from a genuine failure so they don't burn
// a reconnect attempt, or mark a device disconnected, over something backoff can never fix.

const KEYCHAIN_UNAVAILABLE_PATTERN = /keychainexception|user interaction is not allowed/i;

/**
 * True when `error` is the OS declining a Keychain/SecureStore read or write (locked phone,
 * backgrounded app) rather than a real absent-credential or network failure. Matched on message
 * text — expo-secure-store does not export a distinct error class for this case, and the exact
 * wording is iOS's own, not this project's, so this checks defensively (substring, case-insensitive)
 * rather than an exact match.
 */
export function isKeychainUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : String(error ?? "");
  return KEYCHAIN_UNAVAILABLE_PATTERN.test(message);
}
