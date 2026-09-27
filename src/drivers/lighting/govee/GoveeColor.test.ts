import { hueSaturationToRgb, rgbToHueSaturation } from "./GoveeColor";

describe("hueSaturationToRgb", () => {
  test("zero saturation is white regardless of hue", () => {
    expect(hueSaturationToRgb(200, 0)).toEqual({ r: 255, g: 255, b: 255 });
  });

  test("pure red at hue 0, full saturation", () => {
    expect(hueSaturationToRgb(0, 100)).toEqual({ r: 255, g: 0, b: 0 });
  });

  test("pure green at hue 120, full saturation", () => {
    expect(hueSaturationToRgb(120, 100)).toEqual({ r: 0, g: 255, b: 0 });
  });

  test("pure blue at hue 240, full saturation", () => {
    expect(hueSaturationToRgb(240, 100)).toEqual({ r: 0, g: 0, b: 255 });
  });

  test("wraps a hue outside 0-360", () => {
    expect(hueSaturationToRgb(360, 100)).toEqual(hueSaturationToRgb(0, 100));
    expect(hueSaturationToRgb(-120, 100)).toEqual(hueSaturationToRgb(240, 100));
  });
});

describe("rgbToHueSaturation", () => {
  test("white has zero saturation", () => {
    expect(rgbToHueSaturation({ r: 255, g: 255, b: 255 })).toEqual({ hue: 0, saturation: 0 });
  });

  test("black has zero saturation", () => {
    expect(rgbToHueSaturation({ r: 0, g: 0, b: 0 })).toEqual({ hue: 0, saturation: 0 });
  });

  test("round-trips pure red/green/blue through hueSaturationToRgb", () => {
    for (const hue of [0, 120, 240]) {
      const rgb = hueSaturationToRgb(hue, 100);
      expect(rgbToHueSaturation(rgb)).toEqual({ hue, saturation: 100 });
    }
  });
});
