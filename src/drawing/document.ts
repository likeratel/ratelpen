import { translateShape } from "./selection";
import type { Shape } from "./types";

// Immutable drawing document with snapshot-based undo/redo. Shapes are
// immutable, so a snapshot is just an array of shared references.

export const HISTORY_LIMIT = 100;

type Snapshot = readonly Shape[];

export interface DrawingDocument {
  readonly shapes: Snapshot;
  readonly past: readonly Snapshot[];
  readonly future: readonly Snapshot[];
}

export const emptyDocument: DrawingDocument = {
  shapes: [],
  past: [],
  future: [],
};

function commit(doc: DrawingDocument, shapes: Snapshot): DrawingDocument {
  const past = [...doc.past, doc.shapes].slice(-HISTORY_LIMIT);
  return { shapes, past, future: [] };
}

export function addShape(doc: DrawingDocument, shape: Shape): DrawingDocument {
  return commit(doc, [...doc.shapes, shape]);
}

/** Removes every shape whose id is listed, as one undo step. */
export function eraseShapes(
  doc: DrawingDocument,
  ids: ReadonlySet<string>,
): DrawingDocument {
  const remaining = doc.shapes.filter((shape) => !ids.has(shape.id));
  if (remaining.length === doc.shapes.length) return doc;
  return commit(doc, remaining);
}

/** Moves the listed shapes by (`dx`, `dy`), as one undo step. */
export function moveShapes(
  doc: DrawingDocument,
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): DrawingDocument {
  const moves = doc.shapes.some((shape) => ids.has(shape.id));
  if (!moves || (dx === 0 && dy === 0)) return doc;
  return commit(
    doc,
    doc.shapes.map((shape) =>
      ids.has(shape.id) ? translateShape(shape, dx, dy) : shape,
    ),
  );
}

function sameText(a: Shape, b: Shape): boolean {
  return a.kind === "text" && b.kind === "text" && a.text === b.text;
}

/**
 * Swaps in an edited version of a shape (same id), as one undo step. When the
 * original is gone (fading ink ran out while it was being edited) the edit is
 * kept as a new shape rather than lost.
 */
export function replaceShape(
  doc: DrawingDocument,
  shape: Shape,
): DrawingDocument {
  const current = doc.shapes.find((existing) => existing.id === shape.id);
  if (!current) return addShape(doc, shape);
  if (sameText(current, shape)) return doc;
  return commit(
    doc,
    doc.shapes.map((existing) => (existing.id === shape.id ? shape : existing)),
  );
}

export function clearDocument(doc: DrawingDocument): DrawingDocument {
  if (doc.shapes.length === 0) return doc;
  return commit(doc, []);
}

export function canUndo(doc: DrawingDocument): boolean {
  return doc.past.length > 0;
}

export function canRedo(doc: DrawingDocument): boolean {
  return doc.future.length > 0;
}

export function undo(doc: DrawingDocument): DrawingDocument {
  if (doc.past.length === 0) return doc;
  const previous = doc.past[doc.past.length - 1];
  return {
    shapes: previous,
    past: doc.past.slice(0, -1),
    future: [doc.shapes, ...doc.future],
  };
}

export function redo(doc: DrawingDocument): DrawingDocument {
  if (doc.future.length === 0) return doc;
  const [next, ...future] = doc.future;
  return { shapes: next, past: [...doc.past, doc.shapes], future };
}

function sameShapes(a: Snapshot, b: Snapshot): boolean {
  return a.length === b.length && a.every((shape, index) => shape === b[index]);
}

/** Drops snapshots that became identical to their newer neighbour. */
function collapse(snapshots: readonly Snapshot[], newer: Snapshot): Snapshot[] {
  return snapshots.filter((snapshot, index) => {
    const neighbour = snapshots[index + 1] ?? newer;
    return !sameShapes(snapshot, neighbour);
  });
}

/**
 * Removes faded-out shapes everywhere, including history, without creating an
 * undo step: expired ink must not come back with undo.
 */
export function removeExpired(
  doc: DrawingDocument,
  ids: ReadonlySet<string>,
): DrawingDocument {
  if (ids.size === 0) return doc;
  const keep = (snapshot: Snapshot) =>
    snapshot.filter((shape) => !ids.has(shape.id));
  const shapes = keep(doc.shapes);
  const past = collapse(doc.past.map(keep), shapes);
  const futureReversed = collapse([...doc.future.map(keep)].reverse(), shapes);
  return { shapes, past, future: futureReversed.reverse() };
}
