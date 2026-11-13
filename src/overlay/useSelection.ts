import { useCallback, useEffect, useMemo, useState } from "react";
import type { Shape } from "../drawing/types";
import type { UiAction } from "./actions";
import { NO_SELECTION } from "./selectGestures";
import { isEditableTarget } from "./useOverlayKeyboard";

const SPACE_CODE = "Space";

/**
 * True while Space is held. Space must not also press a focused toolbar
 * button, so its default action is cancelled and that button loses focus.
 */
function useSpaceHeld(enabled: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      // macOS sends no keyup for other keys while Cmd is down, so releasing
      // Cmd ends selecting; a Space still held comes back with its repeat.
      if (event.key === "Meta" && event.type === "keyup") setHeld(false);
      if (event.code !== SPACE_CODE || isEditableTarget(event.target)) return;
      // Cmd/Ctrl/Alt+Space belong to the system (input source, search).
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      setHeld(event.type === "keydown");
    };
    const release = () => setHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", release);
      setHeld(false);
    };
  }, [enabled]);

  return enabled && held;
}

interface SelectionDeps {
  readonly active: boolean;
  readonly shapes: readonly Shape[];
  readonly erase: (ids: ReadonlySet<string>) => void;
  readonly dispatch: (action: UiAction) => void;
}

/**
 * Which shapes are selected, and the keys that act on them: D or Delete
 * removes the selection, Esc drops it before it leaves draw mode.
 */
export function useSelection(deps: SelectionDeps) {
  const { active, shapes, erase, dispatch } = deps;
  const [chosen, setChosen] = useState<ReadonlySet<string>>(NO_SELECTION);
  const selecting = useSpaceHeld(active);

  // Shapes can vanish under the selection (undo, fading ink, clear).
  const selection = useMemo(() => {
    if (!active || chosen.size === 0) return NO_SELECTION;
    const alive = shapes.filter((shape) => chosen.has(shape.id));
    return alive.length === chosen.size
      ? chosen
      : new Set(alive.map((shape) => shape.id));
  }, [active, chosen, shapes]);

  // Forget what is gone, so undo/redo cannot bring a selection back.
  useEffect(() => {
    if (selection !== chosen) setChosen(selection);
  }, [selection, chosen]);

  const onKeyAction = useCallback(
    (action: UiAction) => {
      const removes =
        action.type === "deleteSelection" || action.type === "clear";
      if (selection.size > 0 && removes) {
        erase(selection);
        setChosen(NO_SELECTION);
        return;
      }
      if (selection.size > 0 && action.type === "exit") {
        setChosen(NO_SELECTION);
        return;
      }
      if (action.type !== "deleteSelection") dispatch(action);
    },
    [selection, erase, dispatch],
  );

  return { selection, selecting, select: setChosen, onKeyAction };
}
