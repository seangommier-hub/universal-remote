import { charToKeysym, Keysym } from "./keysym";

describe("charToKeysym", () => {
  test("maps a lowercase letter to its own char code (X11's direct ASCII convention)", () => {
    expect(charToKeysym("a")).toBe(0x61);
  });

  test("maps an uppercase letter, a digit, space, and punctuation the same way", () => {
    expect(charToKeysym("A")).toBe(0x41);
    expect(charToKeysym("7")).toBe(0x37);
    expect(charToKeysym(" ")).toBe(0x20);
    expect(charToKeysym("!")).toBe(0x21);
    expect(charToKeysym("~")).toBe(0x7e); // top of the printable ASCII range
  });

  test("returns undefined for a control character (below the printable range)", () => {
    expect(charToKeysym("\n")).toBeUndefined();
    expect(charToKeysym("\t")).toBeUndefined();
  });

  test("returns undefined for a character outside Latin-1's printable range", () => {
    expect(charToKeysym("€")).toBeUndefined();
    expect(charToKeysym("日")).toBeUndefined();
  });
});

describe("Keysym", () => {
  test("Return, Backspace, and the arrow keys match X11's real keysymdef.h values", () => {
    // Spot-checked against X11/keysymdef.h directly — these are the values every real VNC server
    // (x11vnc, TigerVNC) expects; a wrong constant here fails silently against a real server
    // (the keypress is just ignored), not loudly, so this test is worth keeping precise.
    expect(Keysym.Return).toBe(0xff0d);
    expect(Keysym.Backspace).toBe(0xff08);
    expect(Keysym.Left).toBe(0xff51);
    expect(Keysym.Up).toBe(0xff52);
    expect(Keysym.Right).toBe(0xff53);
    expect(Keysym.Down).toBe(0xff54);
  });
});
