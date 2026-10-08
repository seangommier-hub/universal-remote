import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  fontScaleFor,
  maxScaleForWidth,
  REMOTE_BASE_WIDTH_PX,
  remoteMaxContentWidth,
  ROCKER_LABEL_MIN_SCALE,
  scaleFont,
  scaleSize,
  shouldShowRockerLabel,
} from "./remoteScale";

describe("scaleSize", () => {
  test("multiplies a layout size by the total scale, with no clamping", () => {
    expect(scaleSize(52, 1)).toBe(52);
    expect(scaleSize(52, 0.5)).toBe(26);
    expect(scaleSize(52, 1.6)).toBeCloseTo(83.2, 5);
  });
});

describe("scaleFont", () => {
  test("follows the scale inside the legibility band", () => {
    expect(scaleFont(15, 1)).toBe(15);
    expect(scaleFont(20, 1.1)).toBeCloseTo(22, 5);
    expect(scaleFont(20, 0.9)).toBeCloseTo(18, 5);
  });

  test("never shrinks below the minimum fraction of the base size", () => {
    expect(scaleFont(20, 0.3)).toBeCloseTo(20 * FONT_SCALE_MIN, 5);
    expect(fontScaleFor(0)).toBe(FONT_SCALE_MIN);
  });

  test("never grows beyond the maximum fraction of the base size", () => {
    expect(scaleFont(20, 1.6)).toBeCloseTo(20 * FONT_SCALE_MAX, 5);
    expect(fontScaleFor(10)).toBe(FONT_SCALE_MAX);
  });

  test("the band keeps the roughly 85%-125% legibility range the remote was specified with", () => {
    expect(FONT_SCALE_MIN).toBeGreaterThanOrEqual(0.85);
    expect(FONT_SCALE_MAX).toBeLessThanOrEqual(1.25);
  });
});

describe("maxScaleForWidth", () => {
  test("is the window width over the remote's design width", () => {
    expect(maxScaleForWidth(REMOTE_BASE_WIDTH_PX)).toBe(1);
    expect(maxScaleForWidth(REMOTE_BASE_WIDTH_PX * 1.5)).toBeCloseTo(1.5, 5);
  });

  test("lets an iPhone SE (375) show slightly more than its own width scale but not the hub clipped", () => {
    expect(maxScaleForWidth(375)).toBeGreaterThan(1);
    expect(maxScaleForWidth(375)).toBeLessThan(1.1);
  });
});

describe("remoteMaxContentWidth", () => {
  test("grows in proportion to the total scale once past the design size", () => {
    expect(remoteMaxContentWidth(2)).toBeCloseTo(remoteMaxContentWidth(1) * 2, 5);
  });

  test("never narrows below the scale-1 design width when the remote is shrunk for a short screen", () => {
    expect(remoteMaxContentWidth(0.6)).toBe(remoteMaxContentWidth(1));
  });

  test("never constrains a phone (the column's own width at its max width-driven scale fits)", () => {
    const phoneWidth = 440;
    const scale = maxScaleForWidth(phoneWidth);
    expect(remoteMaxContentWidth(scale)).toBeGreaterThanOrEqual(phoneWidth - 24 * scale);
  });
});

describe("shouldShowRockerLabel", () => {
  test("shows the Vol/Ch caption at normal sizes and drops it below the minimum scale", () => {
    expect(shouldShowRockerLabel(1)).toBe(true);
    expect(shouldShowRockerLabel(ROCKER_LABEL_MIN_SCALE)).toBe(true);
    expect(shouldShowRockerLabel(ROCKER_LABEL_MIN_SCALE - 0.01)).toBe(false);
  });
});
