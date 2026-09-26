import { describeXboxLiveIdProblem, looksLikeXboxLiveId, normalizeXboxLiveId } from "./xboxLiveId";

describe("xboxLiveId", () => {
  it("normalizes case, spaces and dashes", () => {
    expect(normalizeXboxLiveId(" fd00-1122 3344 5566 ")).toBe("FD00112233445566");
  });

  it("accepts a 16-character hex Live ID", () => {
    expect(looksLikeXboxLiveId("FD00112233445566")).toBe(true);
    expect(describeXboxLiveIdProblem("fd00112233445566")).toBeNull();
  });

  it("rejects a wrong length or non-hex characters with the exact Settings path", () => {
    expect(looksLikeXboxLiveId("FD0011")).toBe(false);
    expect(looksLikeXboxLiveId("ZZ00112233445566")).toBe(false);
    expect(describeXboxLiveIdProblem("FD0011")).toContain("Settings > System > Console info");
  });
});
