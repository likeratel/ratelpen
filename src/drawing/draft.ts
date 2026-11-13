import { constrainBox, constrainLine, distance } from "./geometry";
import type { InkStyle, Point, PressurePoint, Shape } from "./types";

// The shape being drawn while the pointer is down, and how it becomes a Shape.

export const DRAFT_TOOLS = [
  "pen",
  "highlighter",
  "line",
  "arrow",
  "rect",
  "ellipse",
] as const;
export type DraftTool = (typeof DRAFT_TOOLS)[number];

/** Points closer than this to the previous one add nothing visible. */
export const MIN_POINT_DISTANCE = 0.5;
/** Lines and boxes smaller than this are treated as accidental clicks. */
export const MIN_SHAPE_SIZE = 2;

interface FreehandDraft {
  readonly type: "freehand";
  readonly brush: "pen" | "highlighter";
  readonly points: readonly PressurePoint[];
  readonly style: InkStyle;
}

interface TwoPointDraft {
  readonly type: "two-point";
  readonly kind: "line" | "arrow" | "rect" | "ellipse";
  readonly from: Point;
  readonly to: Point;
  readonly constrained: boolean;
  readonly style: InkStyle;
}

export type Draft = FreehandDraft | TwoPointDraft;

export function isDraftTool(tool: string): tool is DraftTool {
  return (DRAFT_TOOLS as readonly string[]).includes(tool);
}

export function startDraft(
  tool: DraftTool,
  point: PressurePoint,
  style: InkStyle,
): Draft {
  if (tool === "pen" || tool === "highlighter")
    return { type: "freehand", brush: tool, points: [point], style };
  return {
    type: "two-point",
    kind: tool,
    from: point,
    to: point,
    constrained: false,
    style,
  };
}

function appendPoints(
  points: readonly PressurePoint[],
  added: readonly PressurePoint[],
): readonly PressurePoint[] {
  const fresh = added.reduce<PressurePoint[]>((accepted, point) => {
    const last = accepted[accepted.length - 1] ?? points[points.length - 1];
    return distance(last, point) < MIN_POINT_DISTANCE
      ? accepted
      : [...accepted, point];
  }, []);
  return fresh.length === 0 ? points : [...points, ...fresh];
}

/** Adds pointer samples; `constrained` is whether Shift is held. */
export function extendDraft(
  draft: Draft,
  points: readonly PressurePoint[],
  constrained: boolean,
): Draft {
  if (draft.type === "freehand")
    return { ...draft, points: appendPoints(draft.points, points) };
  const last = points[points.length - 1];
  return { ...draft, to: last ?? draft.to, constrained };
}

function constrainedEnd(draft: TwoPointDraft): Point {
  if (!draft.constrained) return draft.to;
  return draft.kind === "line" || draft.kind === "arrow"
    ? constrainLine(draft.from, draft.to)
    : constrainBox(draft.from, draft.to);
}

/** The shape this draft represents right now (also used for the preview). */
export function draftToShape(
  draft: Draft,
  id: string,
  createdAt: number,
): Shape {
  const base = { id, createdAt, ...draft.style };
  if (draft.type === "freehand")
    return {
      ...base,
      kind: "freehand",
      brush: draft.brush,
      points: draft.points,
    };
  return {
    ...base,
    kind: draft.kind,
    from: draft.from,
    to: constrainedEnd(draft),
  };
}

/** The shape to commit, or null when the gesture was too small to keep. */
export function finishDraft(
  draft: Draft,
  id: string,
  createdAt: number,
): Shape | null {
  const shape = draftToShape(draft, id, createdAt);
  if (shape.kind === "freehand" || shape.kind === "text") return shape;
  const tooSmall =
    shape.kind === "line" || shape.kind === "arrow"
      ? distance(shape.from, shape.to) < MIN_SHAPE_SIZE
      : Math.abs(shape.to.x - shape.from.x) < MIN_SHAPE_SIZE ||
        Math.abs(shape.to.y - shape.from.y) < MIN_SHAPE_SIZE;
  return tooSmall ? null : shape;
}

export function createIdGenerator(prefix = "shape"): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${next}`;
  };
}
