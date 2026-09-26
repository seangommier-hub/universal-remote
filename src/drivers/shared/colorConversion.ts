// Hearth describes a light's colour as hue 0-360 and saturation 0-100 (the Hue driver's convention);
// some bulbs want red/green/blue instead. Brightness is handled separately by each driver.

const HUE_DEGREES = 360;
const HUE_SECTORS = 6;
const SATURATION_SCALE = 100;
const RGB_MAX = 255;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Converts hue (0-360) and saturation (0-100) at full value into 0-255 red/green/blue. */
export function hueSaturationToRgb(hue: number, saturation: number): Rgb {
  const wrappedHue = ((hue % HUE_DEGREES) + HUE_DEGREES) % HUE_DEGREES;
  const sat = Math.min(Math.max(saturation, 0), SATURATION_SCALE) / SATURATION_SCALE;
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
  return { r: Math.round((r + floor) * RGB_MAX), g: Math.round((g + floor) * RGB_MAX), b: Math.round((b + floor) * RGB_MAX) };
}

/** Converts 0-255 red/green/blue into hue (0-360) and saturation (0-100). */
export function rgbToHueSaturation(rgb: Rgb): { hue: number; saturation: number } {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((channel) => channel / RGB_MAX);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return { hue: 0, saturation: 0 };
  let sector: number;
  if (max === r) sector = ((g - b) / delta + HUE_SECTORS) % HUE_SECTORS;
  else if (max === g) sector = (b - r) / delta + 2;
  else sector = (r - g) / delta + 4;
  return { hue: Math.round(sector * (HUE_DEGREES / HUE_SECTORS)) % HUE_DEGREES, saturation: Math.round((delta / max) * SATURATION_SCALE) };
}
