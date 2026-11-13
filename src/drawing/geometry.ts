import { paintedWidth } from "./style";
import type { Point, Rect, Shape, Size } from "./types";

// Pure geometry: Shift constraints, arrow heads, hit testing for the eraser.

export const SNAP_ANGLE = Math.PI / 4;
export const ARROW_HEAD_ANGLE = Math.PI / 6;
export const ARROW_HEAD_MIN = 10;
export const ARROW_HEAD_PER_WIDTH = 3;
/** Polyline resolution used to approximate an ellipse outline. */
export const ELLIPSE_SEGMENTS = 64;
/** Mouse and touch report 0 or 0.5; treat both as "no pressure data". */
export const NEUTRAL_PRESSURE = 0.5;

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Snaps the segment from `from` to `to` to the nearest 45° direction. */
export function constrainLine(from: Point, to: Point): Point {
  const length = distance(from, to);
  if (length === 0) return to;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const snapped = Math.round(angle / SNAP_ANGLE) * SNAP_ANGLE;
  return {
    x: from.x + Math.cos(snapped) * length,
    y: from.y + Math.sin(snapped) * length,
  };
}

/** Forces the box spanned by `from` and `to` to a square, keeping direction. */
export function constrainBox(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: from.x + (dx < 0 ? -side : side),
    y: from.y + (dy < 0 ? -side : side),
  };
}

/** Rectangle with non-negative width and height from two corners. */
export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export function arrowHeadLength(width: number): number {
  return Math.max(ARROW_HEAD_MIN, width * ARROW_HEAD_PER_WIDTH);
}

/** The two barb points of an arrow head whose tip is at `to`. */
export function arrowHead(
  from: Point,
  to: Point,
  width: number,
): readonly [Point, Point] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = arrowHeadLength(width);
  const barb = (offset: number): Point => ({
    x: to.x - Math.cos(angle + offset) * length,
    y: to.y - Math.sin(angle + offset) * length,
  });
  return [barb(ARROW_HEAD_ANGLE), barb(-ARROW_HEAD_ANGLE)];
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(p, a);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  const clamped = Math.min(1, Math.max(0, t));
  return distance(p, { x: a.x + clamped * dx, y: a.y + clamped * dy });
}

function nearPolyline(
  p: Point,
  points: readonly Point[],
  tolerance: number,
): boolean {
  if (points.length === 1) return distance(p, points[0]) <= tolerance;
  return points
    .slice(1)
    .some((point, i) => distanceToSegment(p, points[i], point) <= tolerance);
}

function rectOutline(rect: Rect): Point[] {
  const { x, y, width, height } = rect;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
    { x, y },
  ];
}

export function ellipseOutline(rect: Rect): Point[] {
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  const cx = rect.x + rx;
  const cy = rect.y + ry;
  return Array.from({ length: ELLIPSE_SEGMENTS + 1 }, (_, i) => {
    const angle = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
}

function insideRect(p: Point, rect: Rect, margin: number): boolean {
  return (
    p.x >= rect.x - margin &&
    p.x <= rect.x + rect.width + margin &&
    p.y >= rect.y - margin &&
    p.y <= rect.y + rect.height + margin
  );
}

export function textBox(at: Point, size: Size): Rect {
  return { x: at.x, y: at.y, width: size.width, height: size.height };
}

/** True when a circle of `radius` around `p` touches the shape's ink. */
export function hitShape(shape: Shape, p: Point, radius: number): boolean {
  const tolerance = radius + paintedWidth(shape) / 2;
  switch (shape.kind) {
    case "freehand":
      return nearPolyline(p, shape.points, tolerance);
    case "line":
      return nearPolyline(p, [shape.from, shape.to], tolerance);
    case "arrow": {
      const [left, right] = arrowHead(shape.from, shape.to, shape.width);
      return (
        nearPolyline(p, [shape.from, shape.to], tolerance) ||
        nearPolyline(p, [left, shape.to, right], tolerance)
      );
    }
    case "rect":
      return nearPolyline(
        p,
        rectOutline(normalizeRect(shape.from, shape.to)),
        tolerance,
      );
    case "ellipse":
      return nearPolyline(
        p,
        ellipseOutline(normalizeRect(shape.from, shape.to)),
        tolerance,
      );
    case "text":
      return insideRect(p, textBox(shape.at, shape.size), radius);
  }
}

/** Points every `step` px from `a` to `b`, inclusive, so fast drags hit too. */
export function sampleSegment(a: Point, b: Point, step: number): Point[] {
  const count = Math.max(1, Math.ceil(distance(a, b) / Math.max(step, 1)));
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / count,
    y: a.y + ((b.y - a.y) * i) / count,
  }));
}

/** Ids of shapes touched while the eraser moved from `a` to `b`. */
export function hitAlongSegment(
  shapes: readonly Shape[],
  a: Point,
  b: Point,
  radius: number,
): string[] {
  const samples = sampleSegment(a, b, radius / 2);
  return shapes
    .filter((shape) => samples.some((p) => hitShape(shape, p, radius)))
    .map((shape) => shape.id);
}

/** Mouse reports 0.5 while pressed and some devices report 0; both mean "unknown". */
export function normalizePressure(pressure: number): number {
  if (!Number.isFinite(pressure) || pressure <= 0) return NEUTRAL_PRESSURE;
  return Math.min(1, pressure);
}

export function hasPressureVariation(
  points: readonly { pressure: number }[],
): boolean {
  return points.some((point) => point.pressure !== NEUTRAL_PRESSURE);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Keeps a box of `size` at `position` fully inside `bounds`. */
export function clampToBounds(
  position: Point,
  size: Size,
  bounds: Size,
): Point {
  return {
    x: clamp(position.x, 0, Math.max(0, bounds.width - size.width)),
    y: clamp(position.y, 0, Math.max(0, bounds.height - size.height)),
  };
}
