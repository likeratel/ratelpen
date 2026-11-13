import { useCallback, useEffect, useRef } from "react";
import {
  bridge,
  type Session,
  type SessionPatch,
  type Settings,
} from "../bridge";
import type { UiAction } from "./actions";
import { sessionPatchFor } from "./sessionPatch";
import {
  loadToolColors,
  rememberColor,
  saveToolColors,
  switchTool,
} from "./toolColors";
import type { DocumentActions } from "./useDrawingDocument";

interface ActionDeps {
  readonly session: Session;
  readonly settings: Settings;
  readonly patchSession: (patch: SessionPatch) => void;
  readonly documentActions: DocumentActions;
  readonly capture: (destination: "file" | "clipboard") => Promise<void>;
  readonly onError: (error: unknown) => void;
}

/** One dispatcher for the toolbar and the keyboard. */
export function useOverlayActions(
  deps: ActionDeps,
): (action: UiAction) => void {
  const { session, settings, patchSession, documentActions, capture, onError } =
    deps;

  // On launch the current tool gets back the colour it had last time.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const color = loadToolColors()[session.tool];
    if (color && color !== session.color) patchSession({ color });
  }, [session.tool, session.color, patchSession]);

  return useCallback(
    (action: UiAction) => {
      switch (action.type) {
        case "undo":
          documentActions.undo();
          return;
        case "redo":
          documentActions.redo();
          return;
        case "clear":
          documentActions.clear();
          return;
        case "deleteSelection":
          // Handled where the selection lives (useSelection).
          return;
        case "capture":
          void capture(action.destination);
          return;
        case "openSettings":
          bridge.openSettings().catch(onError);
          return;
      }
      const patch = sessionPatchFor(action, session, settings);
      if (!patch) return;
      // Each tool keeps the colour it was last used with.
      if (action.type === "tool") {
        const next = switchTool(
          loadToolColors(),
          session.tool,
          action.tool,
          session.color,
        );
        saveToolColors(next.colors);
        patchSession({ ...patch, color: next.color });
        return;
      }
      if (patch.color !== undefined)
        saveToolColors(
          rememberColor(loadToolColors(), session.tool, patch.color),
        );
      patchSession(patch);
    },
    [session, settings, patchSession, documentActions, capture, onError],
  );
}
