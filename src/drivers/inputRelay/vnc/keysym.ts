// X11 keysym values RFB's KeyEvent (RFC 6143 §7.5.4) actually transmits — not raw scancodes, not
// JS `KeyboardEvent.key` strings. Sourced from X11's own keysymdef.h, which has been stable for
// decades; every VNC server implementation (x11vnc, TigerVNC, etc.) expects exactly these values.

/**
 * Printable ASCII/Latin-1 (space through tilde, 0x20-0x7E) keysyms equal their own character
 * code — a direct, documented X11 convention, not a lookup table. Returns `undefined` for
 * anything outside that range (control characters, non-Latin scripts) — callers should fall back
 * to a named keysym (below) or drop the character rather than guess.
 */
export function charToKeysym(char: string): number | undefined {
  const code = char.codePointAt(0);
  if (code === undefined || code < 0x20 || code > 0x7e) return undefined;
  return code;
}

/** Named keysyms for keys a remote-control UI needs as dedicated buttons — arrows, Enter, Backspace, etc. — that have no printable character. */
export const Keysym = {
  Backspace: 0xff08,
  Tab: 0xff09,
  Return: 0xff0d,
  Escape: 0xff1b,
  Delete: 0xffff,
  Home: 0xff50,
  Left: 0xff51,
  Up: 0xff52,
  Right: 0xff53,
  Down: 0xff54,
  PageUp: 0xff55,
  PageDown: 0xff56,
  End: 0xff57,
  Insert: 0xff63,
  ShiftLeft: 0xffe1,
  ControlLeft: 0xffe3,
  CapsLock: 0xffe5,
  AltLeft: 0xffe9,
  SuperLeft: 0xffeb, // the Windows/Cmd/Meta key
  F1: 0xffbe,
  F2: 0xffbf,
  F3: 0xffc0,
  F4: 0xffc1,
  F5: 0xffc2,
  F6: 0xffc3,
  F7: 0xffc4,
  F8: 0xffc5,
  F9: 0xffc6,
  F10: 0xffc7,
  F11: 0xffc8,
  F12: 0xffc9,
} as const;
