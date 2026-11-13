import { describe, expect, it } from "vitest";
import {
  FADE_OUT_MS,
  expiredIds,
  fadeDurationMs,
  fadeOpacity,
  hasFadingShapes,
  isExpired,
  shapeOpacity,
} from "./fade";
import type { Shape } from "./types";

function dot(id: string, createdAt: number, fade: boolean): Shape {
  return {
    id,
    kind: "freehand",
    brush: "pen",
    color: "#ffffff",
    width: 4,
    createdAt,
    fade,
    points: [{ x: 1, y: 1, pressure: 0.5 }],
  };
}

describe("fading ink", () => {
  const duration = fadeDurationMs(5);

  it("stays opaque until the last half second", () => {
    expect(fadeOpacity(0, duration)).toBe(1);
    expect(fadeOpacity(duration - FADE_OUT_MS, duration)).toBe(1);
  });

  it("fades linearly during the last half second", () => {
    expect(fadeOpacity(duration - FADE_OUT_MS / 2, duration)).toBeCloseTo(0.5);
    expect(fadeOpacity(duration, duration)).toBe(0);
  });

  it("fades over the whole lifetime when it is shorter than the fade window", () => {
    expect(fadeOpacity(100, 200)).toBeCloseTo(0.5);
  });

  it("keeps non-fading shapes opaque forever", () => {
    expect(shapeOpacity(dot("a", 0, false), duration * 10, duration)).toBe(1);
    expect(isExpired(dot("a", 0, false), duration * 10, duration)).toBe(false);
  });

  it("lists only shapes past their lifetime", () => {
    const shapes = [
      dot("old", 0, true),
      dot("new", 4000, true),
      dot("solid", 0, false),
    ];
    expect([...expiredIds(shapes, duration, duration)]).toEqual(["old"]);
    expect(hasFadingShapes(shapes)).toBe(true);
    expect(hasFadingShapes([dot("solid", 0, false)])).toBe(false);
  });
});
