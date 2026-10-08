import { parseDemoRePair } from "./demoRePair";

describe("parseDemoRePair", () => {
  test("maps each ?repair= value to the outcome of tapping Re-pair", () => {
    expect(parseDemoRePair("rejected")).toBe("waiting");
    expect(parseDemoRePair("rejected-fails")).toBe("fails");
    expect(parseDemoRePair("rejected-ok")).toBe("succeeds");
  });

  test("anything else, including a missing value, asks for nothing", () => {
    expect(parseDemoRePair(null)).toBeNull();
    expect(parseDemoRePair("")).toBeNull();
    expect(parseDemoRePair("toString")).toBeNull();
  });
});
