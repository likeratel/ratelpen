import { useCallback, useRef, useState } from "react";
import { measureTextBlock } from "../drawing/render";
import { fontSizeForWidth } from "../drawing/style";
import type { InkStyle, Point, Shape } from "../drawing/types";
import { getMeasureContext } from "./canvasSetup";
import type { TextDraft } from "./TextEditor";

export function textShapeFromDraft(
  draft: TextDraft,
  id: string,
  createdAt: number,
): Shape | null {
  if (draft.value.trim() === "") return null;
  return {
    kind: "text",
    id,
    createdAt,
    color: draft.color,
    width: draft.width,
    fade: draft.fade,
    at: draft.at,
    text: draft.value,
    fontSize: draft.fontSize,
    size: measureTextBlock(getMeasureContext(), draft.value, draft.fontSize),
  };
}

/**
 * The text box being typed into. `commit` is idempotent, so Enter, blur and
 * a click elsewhere can all call it safely.
 */
export function useTextEntry(onCommitShape: (draft: TextDraft) => void): {
  draft: TextDraft | null;
  open: (at: Point, style: InkStyle) => void;
  change: (value: string) => void;
  commit: () => void;
  cancel: () => void;
} {
  const [draft, setDraftState] = useState<TextDraft | null>(null);
  const latest = useRef<TextDraft | null>(null);

  const setDraft = useCallback((next: TextDraft | null) => {
    latest.current = next;
    setDraftState(next);
  }, []);

  const commit = useCallback(() => {
    const current = latest.current;
    if (!current) return;
    setDraft(null);
    onCommitShape(current);
  }, [onCommitShape, setDraft]);

  const open = useCallback(
    (at: Point, style: InkStyle) => {
      if (latest.current) {
        commit();
        return;
      }
      setDraft({
        at,
        value: "",
        ...style,
        fontSize: fontSizeForWidth(style.width),
      });
    },
    [commit, setDraft],
  );

  const change = useCallback(
    (value: string) => {
      const current = latest.current;
      if (current) setDraft({ ...current, value });
    },
    [setDraft],
  );

  const cancel = useCallback(() => setDraft(null), [setDraft]);

  return { draft, open, change, commit, cancel };
}
