import { arrowHeadLength, hitShape, normalizeRect, textBox } from "./geometry";
import { paintedWidth } from "./style";
import type { Point, Rect, Shape } from "./types";

// Picking, bounding and moving shapes for the selection gestures. Pure.

/** How close a click must be to a shape's ink to pick it, in CSS px. */
export const PICK_RADIUS = 6;

function padded(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + by * 2,
    height: rect.height + by * 2,
  };
}

function boundsOfPoints(points: readonly Point[]): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    x: left,
    y: top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
}

/** The box that encloses everything a shape paints. */
export function shapeBounds(shape: Shape): Rect {
  const half = paintedWidth(shape) / 2;
  switch (shape.kind) {
    case "freehand":
      return padded(boundsOfPoints(shape.points), half);
    case "arrow":
      return padded(
        normalizeRect(shape.from, shape.to),
        half + arrowHeadLength(shape.width) / 2,
      );
    case "line":
    case "rect":
    case "ellipse":
      return padded(normalizeRect(shape.from, shape.to), half);
    case "text":
      return textBox(shape.at, shape.size);
  }
}

export function rectContains(rect: Rect, p: Point): boolean {
  return (
    p.x >= rect.x &&
    p.x <= rect.x + rect.width &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.height
  );
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    b.x <= a.x + a.width &&
    a.y <= b.y + b.height &&
    b.y <= a.y + a.height
  );
}

function isClosed(shape: Shape): boolean {
  return (
    shape.kind === "rect" || shape.kind === "ellipse" || shape.kind === "text"
  );
}

function area(rect: Rect): number {
  return rect.width * rect.height;
}

/**
 * The shape a click at `p` means: the topmost one whose ink is under the
 * pointer, otherwise the smallest box, ellipse or text that surrounds it.
 */
export function pickShape(shapes: readonly Shape[], p: Point): Shape | null {
  const topFirst = [...shapes].reverse();
  const onInk = topFirst.find((shape) => hitShape(shape, p, PICK_RADIUS));
  if (onInk) return onInk;
  const around = topFirst.filter(
    (shape) => isClosed(shape) && rectContains(shapeBounds(shape), p),
  );
  return around.reduce<Shape | null>(
    (best, shape) =>
      best === null || area(shapeBounds(shape)) < area(shapeBounds(best))
        ? shape
        : best,
    null,
  );
}

/** Ids of the shapes that a selection rectangle touches. */
export function shapesInRect(
  shapes: readonly Shape[],
  rect: Rect,
): ReadonlySet<string> {
  return new Set(
    shapes
      .filter((shape) => rectsIntersect(shapeBounds(shape), rect))
      .map((shape) => shape.id),
  );
}

function shifted(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy };
}

/** A copy of the shape moved by (`dx`, `dy`); the id stays the same. */
export function translateShape(shape: Shape, dx: number, dy: number): Shape {
  switch (shape.kind) {
    case "freehand":
      return {
        ...shape,
        points: shape.points.map((point) => ({
          ...point,
          x: point.x + dx,
          y: point.y + dy,
        })),
      };
    case "text":
      return { ...shape, at: shifted(shape.at, dx, dy) };
    default:
      return {
        ...shape,
        from: shifted(shape.from, dx, dy),
        to: shifted(shape.to, dx, dy),
      };
  }
}

/** Adds the id when it is missing and removes it when it is present. */
export function toggleId(
  ids: ReadonlySet<string>,
  id: string,
): ReadonlySet<string> {
  const next = new Set(ids);
  if (!next.delete(id)) next.add(id);
  return next;
}
