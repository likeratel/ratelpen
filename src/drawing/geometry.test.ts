import { describe, expect, it } from "vitest";
import {
  arrowHead,
  arrowHeadLength,
  clampToBounds,
  constrainBox,
  constrainLine,
  distance,
  distanceToSegment,
  hasPressureVariation,
  hitAlongSegment,
  hitShape,
  normalizePressure,
  normalizeRect,
  sampleSegment,
} from "./geometry";
import type { Shape } from "./types";

const base = { color: "#000000", width: 2, createdAt: 0, fade: false };

describe("Shift constraints", () => {
  it("snaps lines to the nearest 45° step and keeps their length", () => {
    const end = constrainLine({ x: 0, y: 0 }, { x: 100, y: 10 });
    expect(end.x).toBeCloseTo(Math.hypot(100, 10));
    expect(end.y).toBeCloseTo(0);
    const diagonal = constrainLine({ x: 0, y: 0 }, { x: 50, y: 40 });
    expect(diagonal.x).toBeCloseTo(diagonal.y);
  });

  it("keeps a zero-length line unchanged", () => {
    expect(constrainLine({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({
      x: 3,
      y: 3,
    });
  });

  it("turns boxes into squares in the drag direction", () => {
    expect(constrainBox({ x: 10, y: 10 }, { x: 40, y: 20 })).toEqual({
      x: 40,
      y: 40,
    });
    expect(constrainBox({ x: 10, y: 10 }, { x: -20, y: 5 })).toEqual({
      x: -20,
      y: -20,
    });
  });

  it("normalizes rectangles dragged in any direction", () => {
    expect(normalizeRect({ x: 50, y: 40 }, { x: 10, y: 0 })).toEqual({
      x: 10,
      y: 0,
      width: 40,
      height: 40,
    });
  });
});

describe("arrow heads", () => {
  it("places both barbs behind the tip, symmetric around the shaft", () => {
    const [left, right] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 4);
    const length = arrowHeadLength(4);
    expect(left.x).toBeLessThan(100);
    expect(right.x).toBeCloseTo(left.x);
    expect(left.y).toBeCloseTo(-right.y);
    expect(distance(left, { x: 100, y: 0 })).toBeCloseTo(length);
  });

  it("never shrinks below the minimum head length", () => {
    expect(arrowHeadLength(1)).toBeGreaterThanOrEqual(10);
    expect(arrowHeadLength(10)).toBe(30);
  });
});

describe("hit testing", () => {
  it("measures distance to a segment, clamped to its ends", () => {
    expect(
      distanceToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }),
    ).toBe(5);
    expect(
      distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 }),
    ).toBe(5);
  });

  it("hits rectangles on their outline only", () => {
    const rect: Shape = {
      ...base,
      id: "r",
      kind: "rect",
      from: { x: 0, y: 0 },
      to: { x: 100, y: 100 },
    };
    expect(hitShape(rect, { x: 50, y: 2 }, 4)).toBe(true);
    expect(hitShape(rect, { x: 50, y: 50 }, 4)).toBe(false);
  });

  it("hits ellipses on their outline only", () => {
    const ellipse: Shape = {
      ...base,
      id: "e",
      kind: "ellipse",
      from: { x: 0, y: 0 },
      to: { x: 200, y: 100 },
    };
    expect(hitShape(ellipse, { x: 200, y: 50 }, 4)).toBe(true);
    expect(hitShape(ellipse, { x: 100, y: 0 }, 4)).toBe(true);
    expect(hitShape(ellipse, { x: 100, y: 50 }, 4)).toBe(false);
    expect(hitShape(ellipse, { x: 2, y: 2 }, 4)).toBe(false);
  });

  it("hits text anywhere inside its box", () => {
    const text: Shape = {
      ...base,
      id: "t",
      kind: "text",
      at: { x: 10, y: 10 },
      text: "hi",
      fontSize: 20,
      size: { width: 40, height: 25 },
    };
    expect(hitShape(text, { x: 30, y: 20 }, 2)).toBe(true);
    expect(hitShape(text, { x: 80, y: 20 }, 2)).toBe(false);
  });

  it("hits arrow heads as well as the shaft", () => {
    const arrow: Shape = {
      ...base,
      id: "a",
      kind: "arrow",
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
    };
    const [left] = arrowHead(arrow.from, arrow.to, arrow.width);
    expect(hitShape(arrow, left, 1)).toBe(true);
  });

  it("uses the wide painted width for highlighter strokes", () => {
    const stroke: Shape = {
      ...base,
      id: "h",
      kind: "freehand",
      brush: "highlighter",
      width: 10,
      points: [
        { x: 0, y: 0, pressure: 0.5 },
        { x: 100, y: 0, pressure: 0.5 },
      ],
    };
    expect(hitShape(stroke, { x: 50, y: 14 }, 1)).toBe(true);
    expect(hitShape({ ...stroke, brush: "pen" }, { x: 50, y: 14 }, 1)).toBe(
      false,
    );
  });

  it("finds shapes crossed by a fast eraser move", () => {
    const vertical: Shape = {
      ...base,
      id: "v",
      kind: "line",
      from: { x: 50, y: 0 },
      to: { x: 50, y: 100 },
    };
    const far: Shape = {
      ...base,
      id: "f",
      kind: "line",
      from: { x: 500, y: 0 },
      to: { x: 500, y: 100 },
    };
    expect(
      hitAlongSegment([vertical, far], { x: 0, y: 50 }, { x: 100, y: 50 }, 4),
    ).toEqual(["v"]);
  });

  it("samples segments densely and includes both ends", () => {
    const points = sampleSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 10, y: 0 });
    expect(points).toHaveLength(6);
  });
});

describe("pressure and bounds", () => {
  it("treats missing pressure as neutral", () => {
    expect(normalizePressure(0)).toBe(0.5);
    expect(normalizePressure(Number.NaN)).toBe(0.5);
    expect(normalizePressure(0.8)).toBe(0.8);
    expect(normalizePressure(3)).toBe(1);
  });

  it("detects pressure variation", () => {
    expect(hasPressureVariation([{ pressure: 0.5 }, { pressure: 0.5 }])).toBe(
      false,
    );
    expect(hasPressureVariation([{ pressure: 0.5 }, { pressure: 0.7 }])).toBe(
      true,
    );
  });

  it("clamps a box inside the bounds", () => {
    const bounds = { width: 800, height: 600 };
    const size = { width: 200, height: 40 };
    expect(clampToBounds({ x: -20, y: 700 }, size, bounds)).toEqual({
      x: 0,
      y: 560,
    });
    expect(clampToBounds({ x: 900, y: -5 }, size, bounds)).toEqual({
      x: 600,
      y: 0,
    });
  });
});
