// ADR-HEARTH-176: what counts as an acceptable adult PIN.

export const PIN_LENGTH = 4;
const PIN_PATTERN = /^\d{4}$/;

/** True for exactly four digits. */
export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

/** Keeps only digits, capped at the PIN length, for live input fields. */
export function sanitizePinInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, PIN_LENGTH);
}
