const DEFAULT_CHAR_DELAY_MS = 120;

/**
 * Sends an arbitrary string as a sequence of individual character key presses — the only way
 * Roku's ECP supports text entry (no single "insert this whole string" call exists, unlike LG's
 * webOS IME service). A small delay between presses avoids the device dropping keys sent faster
 * than it can register them, the same reasoning sendDigitSequence.ts already documents for
 * numeric channel entry — this is the general-purpose sibling of that function, kept separate
 * since digit entry has its own numeric-only validation this doesn't share.
 */
export async function sendCharacterSequence(text: string, pressChar: (char: string) => Promise<void>, delayMs = DEFAULT_CHAR_DELAY_MS): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    await pressChar(text[i]);
    if (i < text.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
