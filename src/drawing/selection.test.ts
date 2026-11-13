import { describe, expect, it } from "vitest";
import { addShape, emptyDocument, moveShapes, undo } from "./document";
import {
  pickShape,
  shapeBounds,
  shapesInRect,
  toggleId,
  translateShape,
} from "./selection";
import type { Shape } from "./types";

const base = { color: "#ff3b30", width: 4, createdAt: 0, fade: false };

const line: Shape = {
  ...base,
  id: "line",
  kind: "line",
  from: { x: 0, y: 0 },
  to: { x: 100, y: 0 },
};
const box: Shape = {
  ...base,
  id: "box",
  kind: "rect",
  from: { x: 200, y: 200 },
  to: { x: 400, y: 300 },
};
const inner: Shape = {
  ...base,
  id: "inner",
  kind: "ellipse",
  from: { x: 250, y: 220 },
  to: { x: 300, y: 260 },
};
const stroke: Shape = {
  ...base,
  id: "stroke",
  kind: "freehand",
  brush: "pen",
  points: [
    { x: 500, y: 500, pressure: 0.5 },
    { x: 600, y: 520, pressure: 0.5 },
  ],
};
const label: Shape = {
  ...base,
  id: "label",
  kind: "text",
  at: { x: 700, y: 100 },
  text: "hello",
  fontSize: 24,
  size: { width: 80, height: 30 },
};

describe("picking a shape", () => {
  it("picks the ink under the pointer, topmost first", () => {
    expect(pickShape([line, box], { x: 50, y: 3 })?.id).toBe("line");
    const over: Shape = { ...line, id: "over" };
    expect(pickShape([line, over], { x: 50, y: 0 })?.id).toBe("over");
  });

  it("picks a box, ellipse or text by its inside, the smallest first", () => {
    expect(pickShape([box, inner], { x: 380, y: 280 })?.id).toBe("box");
    expect(pickShape([box, inner], { x: 275, y: 240 })?.id).toBe("inner");
    expect(pickShape([label], { x: 740, y: 115 })?.id).toBe("label");
  });

  it("does not pick a stroke by the empty space around it", () => {
    expect(pickShape([stroke], { x: 520, y: 518 })).toBeNull();
    expect(pickShape([line, box], { x: 150, y: 150 })).toBeNull();
  });
});

describe("selection geometry", () => {
  it("bounds include the stroke width", () => {
    expect(shapeBounds(line)).toEqual({ x: -2, y: -2, width: 104, height: 4 });
  });

  it("a rubber band selects everything it touches", () => {
    const hit = shapesInRect([line, box, stroke], {
      x: 90,
      y: -10,
      width: 150,
      height: 250,
    });
    expect([...hit].sort()).toEqual(["box", "line"]);
  });

  it("moves every kind of shape and keeps its id", () => {
    expect(translateShape(line, 5, 7)).toMatchObject({
      id: "line",
      from: { x: 5, y: 7 },
      to: { x: 105, y: 7 },
    });
    expect(translateShape(label, -10, 10)).toMatchObject({
      at: { x: 690, y: 110 },
    });
    const moved = translateShape(stroke, 1, 2);
    expect(moved.kind === "freehand" && moved.points[1]).toEqual({
      x: 601,
      y: 522,
      pressure: 0.5,
    });
    expect(stroke.points[1].x).toBe(600);
  });

  it("toggles an id in and out of a selection", () => {
    const one = toggleId(new Set(), "a");
    expect([...one]).toEqual(["a"]);
    expect(toggleId(one, "a").size).toBe(0);
  });
});

describe("moving shapes in the document", () => {
  const doc = addShape(addShape(emptyDocument, line), box);

  it("moves only the listed shapes as one undo step", () => {
    const moved = moveShapes(doc, new Set(["box"]), 10, 20);
    expect(moved.shapes[0]).toBe(line);
    expect(moved.shapes[1]).toMatchObject({ from: { x: 210, y: 220 } });
    expect(undo(moved).shapes).toEqual(doc.shapes);
  });

  it("does nothing for a zero move or unknown ids", () => {
    expect(moveShapes(doc, new Set(["box"]), 0, 0)).toBe(doc);
    expect(moveShapes(doc, new Set(["nope"]), 5, 5)).toBe(doc);
  });
});

describe("editing text", () => {
  it("finds the topmost text under the pointer and nothing else", async () => {
    const { textAt } = await import("./selection");
    const above: Shape = { ...label, id: "above" };
    expect(textAt([label, above, box], { x: 740, y: 115 })?.id).toBe("above");
    expect(textAt([label, box], { x: 300, y: 250 })).toBeNull();
  });

  it("replaces a text as one undo step and skips an unchanged one", async () => {
    const { replaceShape } = await import("./document");
    const doc = addShape(emptyDocument, label);
    const edited: Shape = { ...label, text: "bye" };
    const next = replaceShape(doc, edited);
    expect(next.shapes).toEqual([edited]);
    expect(undo(next).shapes).toEqual([label]);
    expect(replaceShape(doc, { ...label })).toBe(doc);
    // The original faded away during the edit: the edit is kept, not lost.
    const orphan: Shape = { ...edited, id: "missing" };
    expect(replaceShape(doc, orphan).shapes).toEqual([label, orphan]);
  });
});
