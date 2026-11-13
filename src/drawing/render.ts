import { shapeOpacity } from "./fade";
import {
  arrowHead,
  arrowHeadLength,
  distance,
  hasPressureVariation,
  normalizeRect,
} from "./geometry";
import {
  HIGHLIGHTER_ALPHA,
  TEXT_LINE_HEIGHT,
  paintedWidth,
  textFont,
} from "./style";
import type {
  BoxShape,
  FreehandShape,
  Point,
  PressurePoint,
  Rect,
  SegmentShape,
  Shape,
  Size,
  TextShape,
} from "./types";

// Canvas 2D painting. Takes a context; never touches the DOM itself.

/** Width multiplier at pressure 0 and its growth per unit of pressure (0.5 → 1×). */
export const PRESSURE_MIN_SCALE = 0.25;
export const PRESSURE_SCALE_RANGE = 1.5;

type Ctx = CanvasRenderingContext2D;
const HALF = 0.5;

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pressureScale(pressure: number): number {
  return PRESSURE_MIN_SCALE + PRESSURE_SCALE_RANGE * pressure;
}

function strokeStyle(ctx: Ctx, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function drawDot(ctx: Ctx, point: Point, width: number): void {
  ctx.beginPath();
  ctx.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Midpoint quadratic smoothing through every point, as a single path. */
function traceSmooth(ctx: Ctx, points: readonly Point[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i += 1) {
    const mid = midpoint(points[i], points[i + 1]);
    ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

/** Same curve, stroked piece by piece so each piece follows its pressure. */
function strokeVariable(
  ctx: Ctx,
  points: readonly PressurePoint[],
  width: number,
): void {
  let start: Point = points[0];
  for (let i = 1; i < points.length; i += 1) {
    const isLast = i === points.length - 1;
    const end = isLast ? points[i] : midpoint(points[i], points[i + 1]);
    const pressure = (points[i - 1].pressure + points[i].pressure) / 2;
    ctx.lineWidth = width * pressureScale(pressure);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(points[i].x, points[i].y, end.x, end.y);
    ctx.stroke();
    start = end;
  }
}

function drawFreehand(ctx: Ctx, shape: FreehandShape): void {
  const width = paintedWidth(shape);
  strokeStyle(ctx, shape.color, width);
  const { points } = shape;
  if (points.length === 0) return;
  const isDot =
    points.length === 1 ||
    points.every((point) => distance(point, points[0]) === 0);
  if (shape.brush === "highlighter") {
    ctx.globalAlpha *= HIGHLIGHTER_ALPHA;
    if (isDot) drawDot(ctx, points[0], width);
    else {
      traceSmooth(ctx, points);
      ctx.stroke();
    }
    return;
  }
  const variable = hasPressureVariation(points);
  if (isDot) {
    drawDot(
      ctx,
      points[0],
      variable ? width * pressureScale(points[0].pressure) : width,
    );
    return;
  }
  if (variable) {
    strokeVariable(ctx, points, width);
    return;
  }
  traceSmooth(ctx, points);
  ctx.stroke();
}

function drawSegment(ctx: Ctx, shape: SegmentShape): void {
  strokeStyle(ctx, shape.color, shape.width);
  const { from, to } = shape;
  if (shape.kind === "line") {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    return;
  }
  const [left, right] = arrowHead(from, to, shape.width);
  const length = distance(from, to);
  // Stop the shaft inside the head so its round cap does not poke out.
  const shaftRatio =
    length === 0
      ? 0
      : Math.max(0, 1 - arrowHeadLength(shape.width) / 2 / length);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(
    from.x + (to.x - from.x) * shaftRatio,
    from.y + (to.y - from.y) * shaftRatio,
  );
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawBox(ctx: Ctx, shape: BoxShape): void {
  strokeStyle(ctx, shape.color, shape.width);
  const rect = normalizeRect(shape.from, shape.to);
  ctx.beginPath();
  if (shape.kind === "rect") ctx.rect(rect.x, rect.y, rect.width, rect.height);
  else
    ctx.ellipse(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      rect.width / 2,
      rect.height / 2,
      0,
      0,
      Math.PI * 2,
    );
  ctx.stroke();
}

export function textLines(text: string): string[] {
  return text.split("\n");
}

function drawText(ctx: Ctx, shape: TextShape): void {
  ctx.fillStyle = shape.color;
  ctx.font = textFont(shape.fontSize);
  // Centre each line in its line box, matching how the editor lays it out.
  ctx.textBaseline = "middle";
  const lineHeight = shape.fontSize * TEXT_LINE_HEIGHT;
  textLines(shape.text).forEach((line, index) => {
    const y = shape.at.y + (index + HALF) * lineHeight;
    ctx.fillText(line, shape.at.x, y);
  });
}

export function drawShape(ctx: Ctx, shape: Shape, opacity = 1): void {
  if (opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  switch (shape.kind) {
    case "freehand":
      drawFreehand(ctx, shape);
      break;
    case "line":
    case "arrow":
      drawSegment(ctx, shape);
      break;
    case "rect":
    case "ellipse":
      drawBox(ctx, shape);
      break;
    case "text":
      drawText(ctx, shape);
      break;
  }
  ctx.restore();
}

export interface PaintOptions {
  readonly now: number;
  readonly fadeMs: number;
  readonly hidden?: ReadonlySet<string>;
}

export function clearCanvas(ctx: Ctx): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

export function paintShapes(
  ctx: Ctx,
  shapes: readonly Shape[],
  options: PaintOptions,
): void {
  clearCanvas(ctx);
  shapes.forEach((shape) => {
    if (options.hidden?.has(shape.id)) return;
    drawShape(ctx, shape, shapeOpacity(shape, options.now, options.fadeMs));
  });
}

export function measureTextBlock(
  ctx: Ctx,
  text: string,
  fontSize: number,
): Size {
  ctx.save();
  ctx.font = textFont(fontSize);
  const lines = textLines(text);
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width));
  ctx.restore();
  return { width, height: lines.length * fontSize * TEXT_LINE_HEIGHT };
}

const SELECTION_COLOR = "#0a84ff";
const SELECTION_HALO = "rgba(255, 255, 255, 0.9)";
const SELECTION_DASH = [6, 4];
const SELECTION_PADDING = 4;
const MARQUEE_FILL = "rgba(10, 132, 255, 0.12)";

function strokeDashedRect(ctx: Ctx, rect: Rect): void {
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = SELECTION_HALO;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.setLineDash(SELECTION_DASH);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
}

/** Dashed frame around a selected shape, readable on light and dark. */
export function drawSelectionBox(ctx: Ctx, bounds: Rect): void {
  ctx.save();
  strokeDashedRect(ctx, {
    x: bounds.x - SELECTION_PADDING,
    y: bounds.y - SELECTION_PADDING,
    width: bounds.width + SELECTION_PADDING * 2,
    height: bounds.height + SELECTION_PADDING * 2,
  });
  ctx.restore();
}

/** The rubber band drawn while dragging over empty space. */
export function drawMarquee(ctx: Ctx, rect: Rect): void {
  ctx.save();
  ctx.fillStyle = MARQUEE_FILL;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  strokeDashedRect(ctx, rect);
  ctx.restore();
}
