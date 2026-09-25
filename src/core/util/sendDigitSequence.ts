const DEFAULT_DIGIT_DELAY_MS = 250;

/**
 * Sends a channel number as a sequence of individual digit key presses, the only way any of
 * this project's TV/streaming protocols support numeric entry — none expose a single
 * "set channel to N" call; the device itself accumulates rapid digit presses into a channel
 * number over a short window, the same way a physical remote's number pad works. A small delay
 * between presses avoids the device dropping keys sent faster than it can register them.
 */
export async function sendDigitSequence(channel: number | string, pressDigit: (digit: string) => Promise<void>, delayMs = DEFAULT_DIGIT_DELAY_MS): Promise<void> {
  // A string is sent exactly as given, so leading zeros survive (a PIN like "0123" is not the number 123).
  const valid = typeof channel === "string" ? /^[0-9]+$/.test(channel) : Number.isInteger(channel) && channel >= 0;
  if (!valid) {
    throw new Error(`setChannel requires a non-negative integer channel number or a string of digits, got ${channel}`);
  }
  const digits = String(channel).split("");
  for (let i = 0; i < digits.length; i++) {
    await pressDigit(digits[i]);
    if (i < digits.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
