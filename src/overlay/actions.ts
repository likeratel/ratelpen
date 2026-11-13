import type { CaptureDestination, Platform } from "../bridge";
import type { OverlayAction } from "./shortcuts";

/** Everything the toolbar and the keyboard can ask the overlay to do. */
export type UiAction =
  | OverlayAction
  | { type: "capture"; destination: CaptureDestination }
  | { type: "openSettings" };

/** Shortcut labels for commands with modifiers, per platform. */
export function commandShortcuts(platform: Platform): {
  undo: string;
  redo: string;
} {
  return platform === "macos"
    ? { undo: "⌘Z", redo: "⇧⌘Z" }
    : { undo: "Ctrl+Z", redo: "Ctrl+Shift+Z" };
}

export const KEY_LABELS = {
  clear: "Delete",
  exit: "Esc",
  thinner: "[",
  thicker: "]",
  fade: "F",
  spotlight: "S",
  board: "B",
} as const;
