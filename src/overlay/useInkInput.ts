import { useCallback, useEffect, useMemo } from "react";
import type { Session } from "../bridge";
import { createIdGenerator, finishDraft, type Draft } from "../drawing/draft";
import type { InkStyle, Point } from "../drawing/types";
import type { TextDraft } from "./TextEditor";
import type { DocumentActions } from "./useDrawingDocument";
import { textShapeFromDraft, useTextEntry } from "./useTextEntry";

const nextShapeId = createIdGenerator();

/** Turns finished gestures and typed text into committed shapes. */
export function useInkInput(session: Session, actions: DocumentActions) {
  const style: InkStyle = useMemo(
    () => ({
      color: session.color,
      width: session.width,
      fade: session.fadeEnabled,
    }),
    [session.color, session.width, session.fadeEnabled],
  );

  const addText = useCallback(
    (draft: TextDraft) => {
      const { editingId } = draft;
      const id = editingId ?? nextShapeId();
      const shape = textShapeFromDraft(draft, id, performance.now());
      if (editingId === undefined) {
        if (shape) actions.add(shape);
        return;
      }
      // Edited text replaces the original; emptied text removes it.
      if (shape) actions.replace(shape);
      else actions.erase(new Set([editingId]));
    },
    [actions],
  );
  const text = useTextEntry(addText);
  const { commit: commitText, open: openText, edit: onTextEdit } = text;

  // Leaving draw mode or the text tool keeps what was typed.
  useEffect(() => {
    if (!session.active || session.spotlight || session.tool !== "text")
      commitText();
  }, [session.active, session.spotlight, session.tool, commitText]);

  const onDraftEnd = useCallback(
    (draft: Draft) => {
      const shape = finishDraft(draft, nextShapeId(), performance.now());
      if (shape) actions.add(shape);
    },
    [actions],
  );

  const onTextRequest = useCallback(
    (point: Point) => openText(point, style),
    [openText, style],
  );

  return { style, text, onDraftEnd, onTextRequest, onTextEdit };
}
