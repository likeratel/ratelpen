// Colour conversions for the picker. Pure; colours are "#rrggbb" strings.

export interface Hsv {
  /** Hue in degrees, 0..360. */
  readonly h: number;
  /** Saturation, 0..1. */
  readonly s: number;
  /** Value (brightness), 0..1. */
  readonly v: number;
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const CHANNEL_MAX = 255;
const HUE_SECTOR = 60;

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((hue / HUE_SECTOR) % 2) - 1));
  const m = v - chroma;
  const sector = Math.floor(hue / HUE_SECTOR);
  const [r, g, b] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][sector];
  const channel = (value: number) => Math.round((value + m) * CHANNEL_MAX);
  return { r: channel(r), g: channel(g), b: channel(b) };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const pair = (value: number) => value.toString(16).padStart(2, "0");
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv));
}

export function hexToHsv(hex: string): Hsv {
  const { r, g, b } = hexToRgb(hex);
  const [red, green, blue] = [r, g, b].map((value) => value / CHANNEL_MAX);
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  const s = max === 0 ? 0 : delta / max;
  if (delta === 0) return { h: 0, s, v: max };
  const sector =
    max === red
      ? ((green - blue) / delta) % 6
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;
  return { h: (sector * HUE_SECTOR + 360) % 360, s, v: max };
}

function channelsToHex(parts: readonly string[]): string | null {
  const values = parts.map((part) => Number(part.trim()));
  const valid = values.every(
    (value) => Number.isInteger(value) && value >= 0 && value <= CHANNEL_MAX,
  );
  if (values.length !== 3 || !valid) return null;
  return rgbToHex({ r: values[0], g: values[1], b: values[2] });
}

/**
 * Reads a typed colour: "#rrggbb", "rrggbb", "#rgb", "rgb(255, 0, 0)" or
 * "255, 0, 0". Returns a lower-case "#rrggbb", or null when it is not one.
 */
export function parseColorInput(input: string): string | null {
  const text = input.trim().toLowerCase();
  const long = /^#?([0-9a-f]{6})$/.exec(text);
  if (long) return `#${long[1]}`;
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (short)
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const rgb = /^(?:rgb\s*\()?([\d\s,]+)\)?$/.exec(text);
  if (!rgb) return null;
  return channelsToHex(rgb[1].split(/[\s,]+/).filter((part) => part !== ""));
}

/** "255, 59, 48" for a hex colour. */
export function rgbLabel(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}
