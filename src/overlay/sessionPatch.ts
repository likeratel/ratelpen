import type { Session, SessionPatch, Settings } from "../bridge/types";
import { nextBoard, stepWidth, type OverlayAction } from "./shortcuts";

/** Session change for an action, or null when the action is not a session change. */
export function sessionPatchFor(
  action: OverlayAction,
  session: Session,
  settings: Settings,
): SessionPatch | null {
  switch (action.type) {
    case "tool":
      return { tool: action.tool };
    case "color": {
      const color = settings.palette[action.index];
      return color ? { color } : null;
    }
    case "width":
      return { width: stepWidth(session.width, action.direction) };
    case "toggleFade":
      return { fadeEnabled: !session.fadeEnabled };
    case "toggleSpotlight":
      return { spotlight: !session.spotlight };
    case "cycleBoard":
      return { board: nextBoard(session.board) };
    case "exit":
      return { active: false };
    default:
      return null;
  }
}
