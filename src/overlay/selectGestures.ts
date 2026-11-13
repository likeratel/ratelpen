import { normalizeRect } from "../drawing/geometry";
import { pickShape, shapesInRect, toggleId } from "../drawing/selection";
import type { Point, Rect, Shape } from "../drawing/types";

// Selection gestures (hold Space): click to pick, drag a shape to move the
// selection, drag over empty space to rubber-band. Pure state transitions.

export const NO_SELECTION: ReadonlySet<string> = new Set();

export interface MoveGesture {
  readonly type: "move";
  readonly pointerId: number;
  readonly start: Point;
  /** The shape that was pressed. */
  readonly hitId: string;
  readonly ids: ReadonlySet<string>;
  readonly dx: number;
  readonly dy: number;
}

export interface MarqueeGesture {
  readonly type: "marquee";
  readonly pointerId: number;
  readonly start: Point;
  /** Selection kept from before the drag (Shift adds to it). */
  readonly base: ReadonlySet<string>;
  readonly rect: Rect | null;
}

export type SelectGesture = MoveGesture | MarqueeGesture;

export interface SelectStart {
  readonly selection: ReadonlySet<string>;
  /** Null when the press only toggled a shape (Shift+click). */
  readonly gesture: SelectGesture | null;
}

export interface SelectPress {
  readonly point: Point;
  readonly pointerId: number;
  readonly shiftKey: boolean;
}

/** What a press means while selecting, given what is under the pointer. */
export function startSelect(
  shapes: readonly Shape[],
  selection: ReadonlySet<string>,
  press: SelectPress,
): SelectStart {
  const { point, pointerId, shiftKey } = press;
  const hit = pickShape(shapes, point);
  if (hit && shiftKey)
    return { selection: toggleId(selection, hit.id), gesture: null };
  if (hit) {
    const ids = selection.has(hit.id) ? selection : new Set([hit.id]);
    return {
      selection: ids,
      gesture: {
        type: "move",
        pointerId,
        start: point,
        hitId: hit.id,
        ids,
        dx: 0,
        dy: 0,
      },
    };
  }
  const base = shiftKey ? selection : NO_SELECTION;
  return {
    selection: base,
    gesture: { type: "marquee", pointerId, start: point, base, rect: null },
  };
}

export function extendSelect(
  gesture: SelectGesture,
  point: Point,
): SelectGesture {
  if (gesture.type === "move")
    return {
      ...gesture,
      dx: point.x - gesture.start.x,
      dy: point.y - gesture.start.y,
    };
  return { ...gesture, rect: normalizeRect(gesture.start, point) };
}

/** The selection a finished rubber band leaves behind. */
export function marqueeSelection(
  gesture: MarqueeGesture,
  shapes: readonly Shape[],
): ReadonlySet<string> {
  if (!gesture.rect) return gesture.base;
  return new Set([...gesture.base, ...shapesInRect(shapes, gesture.rect)]);
}

/** True when the press was released without dragging. */
export function isClick(gesture: MoveGesture): boolean {
  return gesture.dx === 0 && gesture.dy === 0;
}
