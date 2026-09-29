import { nameToCommit } from "./bulkFollowupNaming";

describe("nameToCommit", () => {
  test("trims and returns a genuinely different name", () => {
    expect(nameToCommit("Roku", "  Guest Room Roku  ")).toBe("Guest Room Roku");
  });

  test("returns null for a blank draft", () => {
    expect(nameToCommit("Roku", "   ")).toBeNull();
  });

  test("returns null when the trimmed draft matches the current name", () => {
    expect(nameToCommit("Roku", "Roku")).toBeNull();
    expect(nameToCommit("Roku", "  Roku  ")).toBeNull();
  });
});
