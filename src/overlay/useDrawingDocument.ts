import { useCallback, useMemo, useState } from "react";
import {
  addShape,
  canRedo,
  canUndo,
  clearDocument,
  emptyDocument,
  eraseShapes,
  moveShapes,
  redo,
  removeExpired,
  undo,
  type DrawingDocument,
} from "../drawing/document";
import type { Shape } from "../drawing/types";

export interface DocumentActions {
  add: (shape: Shape) => void;
  erase: (ids: ReadonlySet<string>) => void;
  move: (ids: ReadonlySet<string>, dx: number, dy: number) => void;
  expire: (ids: ReadonlySet<string>) => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
}

export function useDrawingDocument(): {
  doc: DrawingDocument;
  canUndo: boolean;
  canRedo: boolean;
  actions: DocumentActions;
} {
  const [doc, setDoc] = useState<DrawingDocument>(emptyDocument);

  const update = useCallback(
    (change: (current: DrawingDocument) => DrawingDocument) => setDoc(change),
    [],
  );

  const actions = useMemo<DocumentActions>(
    () => ({
      add: (shape) => update((current) => addShape(current, shape)),
      erase: (ids) => update((current) => eraseShapes(current, ids)),
      move: (ids, dx, dy) =>
        update((current) => moveShapes(current, ids, dx, dy)),
      expire: (ids) => update((current) => removeExpired(current, ids)),
      clear: () => update(clearDocument),
      undo: () => update(undo),
      redo: () => update(redo),
    }),
    [update],
  );

  return { doc, canUndo: canUndo(doc), canRedo: canRedo(doc), actions };
}
