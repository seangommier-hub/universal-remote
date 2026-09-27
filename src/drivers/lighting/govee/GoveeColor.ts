// Hearth's universal setColor capability (Capability.ts) is hue 0-360 / saturation 0-100 at full
// value -- the same convention HueLightDriver.ts already normalizes to (Hue's own bri field is a
// separate, independent brightness). Govee's LAN API only takes plain 0-255 RGB, so this converts
// at full value (V=100%), leaving perceived brightness to the driver's own separate setBrightness
// call, exactly like Hue's bri/hue/sat split.

const HUE_DEGREES = 360;
const HUE_SECTORS = 6;
const SATURATION_SCALE = 100;
const RGB_MAX = 255;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Converts hue (0-360) and saturation (0-100) at full value into 0-255 red/green/blue. */
export function hueSaturationToRgb(hue: number, saturation: number): Rgb {
  const wrappedHue = ((hue % HUE_DEGREES) + HUE_DEGREES) % HUE_DEGREES;
  const sat = clampPercent(saturation) / SATURATION_SCALE;
  const sector = wrappedHue / (HUE_DEGREES / HUE_SECTORS);
  const chroma = sat;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const floor = 1 - chroma;
  const [r, g, b] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ][Math.min(Math.floor(sector), HUE_SECTORS - 1)];
  return {
    r: Math.round((r + floor) * RGB_MAX),
    g: Math.round((g + floor) * RGB_MAX),
    b: Math.round((b + floor) * RGB_MAX),
  };
}

/** Converts 0-255 red/green/blue into hue (0-360) and saturation (0-100). */
export function rgbToHueSaturation(rgb: Rgb): { hue: number; saturation: number } {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((channel) => clampPercent((channel / RGB_MAX) * 100) / 100);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return { hue: 0, saturation: 0 };
  let sector: number;
  if (max === r) sector = ((g - b) / delta + HUE_SECTORS) % HUE_SECTORS;
  else if (max === g) sector = (b - r) / delta + 2;
  else sector = (r - g) / delta + 4;
  return {
    hue: Math.round(sector * (HUE_DEGREES / HUE_SECTORS)) % HUE_DEGREES,
    saturation: Math.round((delta / max) * SATURATION_SCALE),
  };
}
