import { useEffect, useRef, type KeyboardEvent } from "react";
import { measureTextBlock } from "../drawing/render";
import { TEXT_LINE_HEIGHT, textFont } from "../drawing/style";
import type { Point } from "../drawing/types";
import { t } from "../i18n";
import { getMeasureContext } from "./canvasSetup";

/** IME composition reports this keyCode in engines without `isComposing`. */
const IME_PROCESS_KEY_CODE = 229;
/** Room for the caret beyond the measured text. */
const CARET_ALLOWANCE = 2;

export interface TextDraft {
  readonly at: Point;
  readonly value: string;
  readonly color: string;
  readonly width: number;
  readonly fade: boolean;
  readonly fontSize: number;
  /** Id of the text being edited; absent for new text. */
  readonly editingId?: string;
}

interface TextEditorProps {
  readonly draft: TextDraft;
  readonly onChange: (value: string) => void;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
}

function isComposing(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return (
    event.nativeEvent.isComposing ||
    event.nativeEvent.keyCode === IME_PROCESS_KEY_CODE
  );
}

/** Inline text box at the clicked point. Enter commits, Shift+Enter breaks the line, Esc cancels. */
export function TextEditor({
  draft,
  onChange,
  onCommit,
  onCancel,
}: TextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Editing starts with Space still held (Space + double-click); its key
  // repeat must not type spaces until the key has been released once.
  const spaceStillHeld = useRef(draft.editingId !== undefined);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.code === "Space" && event.repeat && spaceStillHeld.current) {
      event.preventDefault();
      return;
    }
    spaceStillHeld.current = false;
    if (isComposing(event)) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onCommit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  const placeholder = t("text.placeholder");
  const measured = measureTextBlock(
    getMeasureContext(),
    draft.value === "" ? placeholder : draft.value,
    draft.fontSize,
  );
  const lineHeight = draft.fontSize * TEXT_LINE_HEIGHT;

  return (
    <textarea
      ref={ref}
      className="text-editor"
      aria-label={t("text.label")}
      placeholder={placeholder}
      value={draft.value}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      onKeyUp={() => {
        spaceStillHeld.current = false;
      }}
      onBlur={onCommit}
      style={{
        left: draft.at.x,
        top: draft.at.y,
        width: Math.ceil(measured.width) + CARET_ALLOWANCE,
        height: Math.max(lineHeight, measured.height),
        color: draft.color,
        font: textFont(draft.fontSize),
        lineHeight: `${lineHeight}px`,
      }}
    />
  );
}
