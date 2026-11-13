import { describe, expect, it } from "vitest";
import type { Shape } from "../drawing/types";
import {
  extendSelect,
  marqueeSelection,
  startSelect,
  type MarqueeGesture,
} from "./selectGestures";

const base = { color: "#ff3b30", width: 4, createdAt: 0, fade: false };
const a: Shape = {
  ...base,
  id: "a",
  kind: "line",
  from: { x: 0, y: 0 },
  to: { x: 100, y: 0 },
};
const b: Shape = {
  ...base,
  id: "b",
  kind: "line",
  from: { x: 0, y: 100 },
  to: { x: 100, y: 100 },
};
const shapes = [a, b];
const press = (x: number, y: number, shiftKey = false) => ({
  point: { x, y },
  pointerId: 1,
  shiftKey,
});

describe("selection gestures", () => {
  it("a press on a shape selects it and starts a move", () => {
    const start = startSelect(shapes, new Set(["b"]), press(50, 0));
    expect([...start.selection]).toEqual(["a"]);
    expect(start.gesture?.type).toBe("move");
  });

  it("a press on a selected shape moves the whole selection", () => {
    const both = new Set(["a", "b"]);
    const start = startSelect(shapes, both, press(50, 0));
    expect(start.selection).toBe(both);
    const moved = start.gesture && extendSelect(start.gesture, { x: 60, y: 8 });
    expect(moved).toMatchObject({ type: "move", dx: 10, dy: 8, ids: both });
  });

  it("Shift+press adds or removes one shape without moving", () => {
    const added = startSelect(shapes, new Set(["a"]), press(50, 100, true));
    expect([...added.selection].sort()).toEqual(["a", "b"]);
    expect(added.gesture).toBeNull();
    const removed = startSelect(shapes, added.selection, press(50, 0, true));
    expect([...removed.selection]).toEqual(["b"]);
  });

  it("a press on empty space clears the selection and rubber-bands", () => {
    const start = startSelect(shapes, new Set(["a"]), press(300, 300));
    expect(start.selection.size).toBe(0);
    expect(start.gesture?.type).toBe("marquee");
    // A click without a drag selects nothing.
    expect(marqueeSelection(start.gesture as MarqueeGesture, shapes).size).toBe(
      0,
    );
  });

  it("a rubber band selects what it covers, adding with Shift", () => {
    const start = startSelect(shapes, new Set(["a"]), press(-20, 80, true));
    const dragged =
      start.gesture && extendSelect(start.gesture, { x: 50, y: 120 });
    const result = marqueeSelection(dragged as MarqueeGesture, shapes);
    expect([...result].sort()).toEqual(["a", "b"]);
  });
});

describe("a click that does not drag", () => {
  it("remembers the pressed shape so the selection can narrow to it", async () => {
    const { isClick } = await import("./selectGestures");
    const start = startSelect(shapes, new Set(["a", "b"]), press(50, 100));
    const gesture = start.gesture;
    if (gesture?.type !== "move") throw new Error("expected a move gesture");
    expect(gesture.hitId).toBe("b");
    expect(isClick(gesture)).toBe(true);
    const dragged = extendSelect(gesture, { x: 55, y: 100 });
    expect(dragged.type === "move" && isClick(dragged)).toBe(false);
  });
});
