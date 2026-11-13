import { useCallback } from "react";
import {
  bridge,
  type Session,
  type SessionPatch,
  type Settings,
} from "../bridge";
import type { UiAction } from "./actions";
import { sessionPatchFor } from "./sessionPatch";
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
      if (patch) patchSession(patch);
    },
    [session, settings, patchSession, documentActions, capture, onError],
  );
}
