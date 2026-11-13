import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  addShape,
  canRedo,
  canUndo,
  clearDocument,
  emptyDocument,
  eraseShapes,
  redo,
  removeExpired,
  undo,
  type DrawingDocument,
} from "./document";
import type { Shape } from "./types";

function line(id: string, fade = false): Shape {
  return {
    id,
    kind: "line",
    color: "#ff3b30",
    width: 4,
    createdAt: 0,
    fade,
    from: { x: 0, y: 0 },
    to: { x: 10, y: 10 },
  };
}

const ids = (doc: DrawingDocument) => doc.shapes.map((shape) => shape.id);

describe("drawing document", () => {
  it("adds shapes without mutating the previous document", () => {
    const one = addShape(emptyDocument, line("a"));
    const two = addShape(one, line("b"));
    expect(ids(one)).toEqual(["a"]);
    expect(ids(two)).toEqual(["a", "b"]);
    expect(emptyDocument.shapes).toEqual([]);
  });

  it("undoes and redoes in order", () => {
    const doc = addShape(addShape(emptyDocument, line("a")), line("b"));
    const undone = undo(doc);
    expect(ids(undone)).toEqual(["a"]);
    expect(canRedo(undone)).toBe(true);
    expect(ids(undo(undone))).toEqual([]);
    expect(ids(redo(undone))).toEqual(["a", "b"]);
  });

  it("drops the redo stack after a new change", () => {
    const doc = undo(addShape(emptyDocument, line("a")));
    const changed = addShape(doc, line("b"));
    expect(canRedo(changed)).toBe(false);
    expect(redo(changed)).toBe(changed);
  });

  it("returns the same document when there is nothing to undo or redo", () => {
    expect(undo(emptyDocument)).toBe(emptyDocument);
    expect(redo(emptyDocument)).toBe(emptyDocument);
    expect(canUndo(emptyDocument)).toBe(false);
  });

  it("erases several shapes as one undo step", () => {
    const doc = [line("a"), line("b"), line("c")].reduce(
      addShape,
      emptyDocument,
    );
    const erased = eraseShapes(doc, new Set(["a", "c"]));
    expect(ids(erased)).toEqual(["b"]);
    expect(ids(undo(erased))).toEqual(["a", "b", "c"]);
  });

  it("ignores erasing ids that are not present", () => {
    const doc = addShape(emptyDocument, line("a"));
    expect(eraseShapes(doc, new Set(["x"]))).toBe(doc);
  });

  it("clears with undo and skips clearing an empty document", () => {
    const doc = addShape(emptyDocument, line("a"));
    const cleared = clearDocument(doc);
    expect(ids(cleared)).toEqual([]);
    expect(ids(undo(cleared))).toEqual(["a"]);
    expect(clearDocument(emptyDocument)).toBe(emptyDocument);
  });

  it("caps the history length", () => {
    const shapes = Array.from({ length: HISTORY_LIMIT + 20 }, (_, i) =>
      line(`s${i}`),
    );
    const doc = shapes.reduce(addShape, emptyDocument);
    expect(doc.past).toHaveLength(HISTORY_LIMIT);
  });

  it("removes expired shapes without an undo step and keeps them from returning", () => {
    const doc = addShape(
      addShape(emptyDocument, line("keep")),
      line("fade", true),
    );
    const expired = removeExpired(doc, new Set(["fade"]));
    expect(ids(expired)).toEqual(["keep"]);
    // The step that only added the faded shape collapses away.
    expect(expired.past).toHaveLength(1);
    const undone = undo(expired);
    expect(ids(undone)).toEqual([]);
    expect(ids(redo(undone))).toEqual(["keep"]);
  });

  it("strips expired shapes from the redo stack too", () => {
    const doc = undo(
      addShape(addShape(emptyDocument, line("a")), line("f", true)),
    );
    const expired = removeExpired(doc, new Set(["f"]));
    expect(canRedo(expired)).toBe(false);
    expect(ids(expired)).toEqual(["a"]);
  });
});
