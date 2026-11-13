import type { Shape } from "./types";

export const HIGHLIGHTER_WIDTH_FACTOR = 3;
export const HIGHLIGHTER_ALPHA = 0.35;
export const TEXT_BASE_SIZE = 12;
export const TEXT_SIZE_PER_WIDTH = 3;
export const TEXT_LINE_HEIGHT = 1.25;
export const TEXT_FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
export const TEXT_FONT_WEIGHT = 600;

export function fontSizeForWidth(width: number): number {
  return TEXT_BASE_SIZE + width * TEXT_SIZE_PER_WIDTH;
}

export function textFont(fontSize: number): string {
  return `${TEXT_FONT_WEIGHT} ${fontSize}px ${TEXT_FONT_FAMILY}`;
}

/** Width of the ink actually painted for a shape. */
export function paintedWidth(shape: Shape): number {
  if (shape.kind === "freehand" && shape.brush === "highlighter")
    return shape.width * HIGHLIGHTER_WIDTH_FACTOR;
  return shape.width;
}
