const DEFAULT_DIGIT_DELAY_MS = 250;

/**
 * Sends a channel number as a sequence of individual digit key presses, the only way any of
 * this project's TV/streaming protocols support numeric entry — none expose a single
 * "set channel to N" call; the device itself accumulates rapid digit presses into a channel
 * number over a short window, the same way a physical remote's number pad works. A small delay
 * between presses avoids the device dropping keys sent faster than it can register them.
 */
export async function sendDigitSequence(channel: number, pressDigit: (digit: string) => Promise<void>, delayMs = DEFAULT_DIGIT_DELAY_MS): Promise<void> {
  if (!Number.isInteger(channel) || channel < 0) {
    throw new Error(`setChannel requires a non-negative integer channel number, got ${channel}`);
  }
  const digits = String(channel).split("");
  for (let i = 0; i < digits.length; i++) {
    await pressDigit(digits[i]);
    if (i < digits.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
