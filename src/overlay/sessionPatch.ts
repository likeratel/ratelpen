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
      // Picking a tool leaves the spotlight, which is used without one.
      return session.spotlight
        ? { tool: action.tool, spotlight: false }
        : { tool: action.tool };
    case "color": {
      const color = settings.palette[action.index];
      return color ? { color } : null;
    }
    case "setColor":
      return { color: action.color };
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
