import { BACKOFF_JITTER_FRACTION, withBackoffJitter } from "./backoffJitter";

describe("withBackoffJitter", () => {
  it("returns the exact delay when the random source is 0", () => {
    expect(withBackoffJitter(4000, () => 0)).toBe(4000);
  });

  it("adds up to the jitter fraction and never more", () => {
    const nearlyOne = 0.999999;
    expect(withBackoffJitter(10000, () => nearlyOne)).toBeLessThanOrEqual(10000 * (1 + BACKOFF_JITTER_FRACTION));
    expect(withBackoffJitter(10000, () => 0.5)).toBe(11000);
  });

  it("differs between two devices that draw different random values", () => {
    expect(withBackoffJitter(8000, () => 0.1)).not.toBe(withBackoffJitter(8000, () => 0.9));
  });
});
