import { hueSaturationToRgb, rgbToHueSaturation } from "./colorConversion";

describe("hueSaturationToRgb", () => {
  test.each([
    [0, 100, { r: 255, g: 0, b: 0 }],
    [120, 100, { r: 0, g: 255, b: 0 }],
    [240, 100, { r: 0, g: 0, b: 255 }],
    [60, 100, { r: 255, g: 255, b: 0 }],
    [180, 100, { r: 0, g: 255, b: 255 }],
    [300, 100, { r: 255, g: 0, b: 255 }],
    [200, 0, { r: 255, g: 255, b: 255 }],
  ])("hue %i saturation %i", (hue, saturation, expected) => {
    expect(hueSaturationToRgb(hue, saturation)).toEqual(expected);
  });

  test("a hue of 360 wraps to red and out-of-range saturation is clamped", () => {
    expect(hueSaturationToRgb(360, 500)).toEqual({ r: 255, g: 0, b: 0 });
    expect(hueSaturationToRgb(-120, 100)).toEqual({ r: 0, g: 0, b: 255 });
  });
});

describe("rgbToHueSaturation", () => {
  test("round-trips the primary and secondary colours", () => {
    for (const hue of [0, 60, 120, 180, 240, 300]) {
      expect(rgbToHueSaturation(hueSaturationToRgb(hue, 100))).toEqual({ hue, saturation: 100 });
    }
  });

  test("white and grey have no hue or saturation", () => {
    expect(rgbToHueSaturation({ r: 255, g: 255, b: 255 })).toEqual({ hue: 0, saturation: 0 });
    expect(rgbToHueSaturation({ r: 10, g: 10, b: 10 })).toEqual({ hue: 0, saturation: 0 });
  });
});
