import { useEffect, useRef } from "react";
import type { Platform, Settings } from "../bridge";
import { acceleratorFromEvent } from "../settings/accelerator";

export interface GlobalShortcutHandlers {
  readonly toggleDraw: () => void;
  readonly clearAll: () => void;
  readonly toggleSpotlight: () => void;
}

/**
 * While the keyboard lock is on, every key press comes straight to the
 * overlay and the system never sees it, so the global shortcuts are
 * recognised here instead. Without the lock the system consumes them first
 * and this never fires, so nothing runs twice.
 */
export function useGlobalShortcutKeys(
  enabled: boolean,
  shortcuts: Settings["shortcuts"],
  platform: Platform,
  handlers: GlobalShortcutHandlers,
): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const pressed = acceleratorFromEvent(event, platform);
      if (pressed.kind !== "ok") return;
      const action = (
        ["toggleDraw", "clearAll", "toggleSpotlight"] as const
      ).find((name) => shortcuts[name] === pressed.accelerator);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) latest.current[action]();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, shortcuts, platform]);
}
