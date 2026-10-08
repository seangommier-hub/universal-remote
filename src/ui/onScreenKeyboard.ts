// ADR-HEARTH-220: Sean, directly (2026-10-08): "no longer leverage the apple keyboard and do
// similar as the keypad." The Keyboard tab is now Hearth's own on-screen keyboard: every tap goes
// to the TV immediately, one key at a time, exactly how the Keypad tab sends digits (ADR-HEARTH-136),
// instead of typing into the phone's keyboard and sending a finished string.

export type KeyboardLayer = "letters" | "symbols";

/** A key that types a character, or one of the editing/mode keys. */
export type KeyboardKey =
  | { kind: "char"; char: string }
  | { kind: "shift" }
  | { kind: "backspace" }
  | { kind: "layer"; to: KeyboardLayer; label: string }
  | { kind: "space" }
  | { kind: "enter" };

const LETTER_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const NUMBER_ROW = "1234567890";
const SYMBOL_ROWS = ["-/:;()$&@\"", ".,?!'#%*+="];

/** Max characters shown in the local echo line (the TV, not Hearth, holds the real text). */
export const ECHO_MAX_CHARS = 28;

function chars(text: string, shift: boolean): KeyboardKey[] {
  return text.split("").map((char) => ({ kind: "char", char: shift ? char.toUpperCase() : char }));
}

/** The rows of keys to draw for a layer. `shift` only affects the letters layer. */
export function keyboardRows(layer: KeyboardLayer, shift: boolean): KeyboardKey[][] {
  if (layer === "symbols") {
    return [
      chars(NUMBER_ROW, false),
      chars(SYMBOL_ROWS[0], false),
      [{ kind: "layer", to: "letters", label: "ABC" }, ...chars(SYMBOL_ROWS[1], false), { kind: "backspace" }],
      [{ kind: "space" }, { kind: "enter" }],
    ];
  }
  return [
    chars(NUMBER_ROW, false),
    chars(LETTER_ROWS[0], shift),
    chars(LETTER_ROWS[1], shift),
    [{ kind: "shift" }, ...chars(LETTER_ROWS[2], shift), { kind: "backspace" }],
    [{ kind: "layer", to: "symbols", label: "123" }, { kind: "space" }, { kind: "enter" }],
  ];
}

/** Appends one typed character to the local echo, keeping only the most recent ECHO_MAX_CHARS. */
export function appendToEcho(echo: string, char: string): string {
  return (echo + char).slice(-ECHO_MAX_CHARS);
}

/** Removes the last typed character from the local echo. */
export function backspaceEcho(echo: string): string {
  return echo.slice(0, -1);
}
