import { appendToEcho, backspaceEcho, ECHO_MAX_CHARS, keyboardRows } from "./onScreenKeyboard";

const charsOf = (row: ReturnType<typeof keyboardRows>[number]) => row.filter((k) => k.kind === "char").map((k) => (k.kind === "char" ? k.char : ""));

describe("keyboardRows", () => {
  test("letters layer is a number row plus qwerty rows, lowercase by default", () => {
    const rows = keyboardRows("letters", false);
    expect(charsOf(rows[0]).join("")).toBe("1234567890");
    expect(charsOf(rows[1]).join("")).toBe("qwertyuiop");
    expect(charsOf(rows[2]).join("")).toBe("asdfghjkl");
    expect(charsOf(rows[3]).join("")).toBe("zxcvbnm");
  });

  test("shift uppercases letters but not the number row", () => {
    const rows = keyboardRows("letters", true);
    expect(charsOf(rows[0]).join("")).toBe("1234567890");
    expect(charsOf(rows[1]).join("")).toBe("QWERTYUIOP");
  });

  test("every layer has backspace, space and enter, and a way to switch layers", () => {
    for (const layer of ["letters", "symbols"] as const) {
      const kinds = keyboardRows(layer, false).flat().map((k) => k.kind);
      expect(kinds).toEqual(expect.arrayContaining(["backspace", "space", "enter", "layer"]));
    }
  });

  test("the symbols layer offers punctuation search terms and URLs need", () => {
    const all = keyboardRows("symbols", false).flat().filter((k) => k.kind === "char").map((k) => (k.kind === "char" ? k.char : ""));
    for (const c of [".", ",", "-", "/", "@", ":", "?"]) expect(all).toContain(c);
  });
});

describe("local echo", () => {
  test("appends and removes characters", () => {
    expect(backspaceEcho(appendToEcho(appendToEcho("", "h"), "i"))).toBe("h");
    expect(backspaceEcho("")).toBe("");
  });

  test("keeps only the most recent characters", () => {
    const long = "x".repeat(ECHO_MAX_CHARS);
    expect(appendToEcho(long, "y")).toHaveLength(ECHO_MAX_CHARS);
    expect(appendToEcho(long, "y").endsWith("y")).toBe(true);
  });
});
