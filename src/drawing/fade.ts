import type { Shape } from "./types";

// Fading ink: fully visible, then fades out linearly over the last part of
// its lifetime, then expires.

export const FADE_OUT_MS = 500;
export const MS_PER_SECOND = 1000;

export function fadeDurationMs(fadeSeconds: number): number {
  return fadeSeconds * MS_PER_SECOND;
}

/** Opacity 0..1 of a fading shape `age` ms old with lifetime `durationMs`. */
export function fadeOpacity(age: number, durationMs: number): number {
  if (age >= durationMs) return 0;
  const window = Math.min(FADE_OUT_MS, durationMs);
  const remaining = durationMs - age;
  if (remaining >= window) return 1;
  return remaining / window;
}

export function shapeOpacity(
  shape: Shape,
  now: number,
  durationMs: number,
): number {
  if (!shape.fade) return 1;
  return fadeOpacity(now - shape.createdAt, durationMs);
}

export function isExpired(
  shape: Shape,
  now: number,
  durationMs: number,
): boolean {
  return shape.fade && now - shape.createdAt >= durationMs;
}

export function expiredIds(
  shapes: readonly Shape[],
  now: number,
  durationMs: number,
): Set<string> {
  return new Set(
    shapes
      .filter((shape) => isExpired(shape, now, durationMs))
      .map((shape) => shape.id),
  );
}

export function hasFadingShapes(shapes: readonly Shape[]): boolean {
  return shapes.some((shape) => shape.fade);
}
