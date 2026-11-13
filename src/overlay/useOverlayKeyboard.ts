import { useEffect, useRef } from "react";
import type { UiAction } from "./actions";
import { actionForKey } from "./shortcuts";

/** keyCode reported for keys consumed by an input method. */
const IME_PROCESS_KEY_CODE = 229;

/** Text fields keep every key to themselves. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

/** Draw-mode keyboard shortcuts from CONTRACT.md, active only while `enabled`. */
export function useOverlayKeyboard(
  enabled: boolean,
  onAction: (action: UiAction) => void,
): void {
  const latest = useRef(onAction);
  useEffect(() => {
    latest.current = onAction;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      if (event.isComposing || event.keyCode === IME_PROCESS_KEY_CODE) return;
      const action = actionForKey(event);
      if (!action) return;
      event.preventDefault();
      latest.current(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
