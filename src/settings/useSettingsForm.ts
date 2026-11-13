import { useCallback, useEffect, useRef, useState } from "react";
import {
  bridge,
  errorMessage,
  type Platform,
  type Settings,
  type Shortcuts,
} from "../bridge";
import { useBridgeEvent } from "../shared/useBridgeEvent";
import { validateSettingsForm, type FieldErrors } from "./validation";

export type SaveStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved" }
  | { readonly kind: "invalid" }
  | { readonly kind: "failed"; readonly message: string };

export type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly platform: Platform;
      readonly saved: Settings;
      readonly draft: Settings;
      /** Shortcuts the system refused to register (taken by another app). */
      readonly unavailable: readonly (keyof Shortcuts)[];
    };

const onSettingsChanged = (listener: (settings: Settings) => void) =>
  bridge.onSettingsChanged(listener);

function sameSettings(a: Settings, b: Settings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Loads settings once and follows saves made by other windows. */
function useLoadedSettings() {
  const [load, setLoadState] = useState<LoadState>({ status: "loading" });
  const latest = useRef(load);
  const setLoad = useCallback((next: LoadState) => {
    latest.current = next;
    setLoadState(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    bridge
      .getBootstrap()
      .then(({ settings, platform, unavailableShortcuts }) => {
        if (!disposed)
          setLoad({
            status: "ready",
            platform,
            saved: settings,
            draft: settings,
            unavailable: unavailableShortcuts,
          });
      })
      .catch((error: unknown) => {
        console.error("Loading settings failed", error);
        if (!disposed)
          setLoad({ status: "error", message: errorMessage(error) });
      });
    return () => {
      disposed = true;
    };
  }, [setLoad]);

  // Another window saved: adopt it unless the user has unsaved edits.
  useBridgeEvent(onSettingsChanged, (settings) => {
    const current = latest.current;
    if (current.status !== "ready") return;
    const dirty = !sameSettings(current.draft, current.saved);
    setLoad({
      ...current,
      saved: settings,
      draft: dirty ? current.draft : settings,
    });
  });

  return { load, latest, setLoad };
}

export function useSettingsForm() {
  const { load, latest, setLoad } = useLoadedSettings();
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });

  const update = useCallback(
    (change: (draft: Settings) => Settings) => {
      const current = latest.current;
      if (current.status !== "ready") return;
      setLoad({ ...current, draft: change(current.draft) });
      setStatus({ kind: "idle" });
    },
    [latest, setLoad],
  );

  // A failed save can leave a shortcut unregistered; show that right away.
  const refreshUnavailable = useCallback(async () => {
    try {
      const { unavailableShortcuts } = await bridge.getBootstrap();
      const now = latest.current;
      if (now.status === "ready")
        setLoad({ ...now, unavailable: unavailableShortcuts });
    } catch (error) {
      console.error("Reading the shortcut status failed", error);
    }
  }, [latest, setLoad]);

  const save = useCallback(async () => {
    const current = latest.current;
    if (current.status !== "ready") return;
    const validation = validateSettingsForm(current.draft);
    if (!validation.ok) {
      setStatus({ kind: "invalid" });
      return;
    }
    setStatus({ kind: "saving" });
    try {
      const saved = await bridge.saveSettings(validation.settings);
      const { unavailableShortcuts } = await bridge.getBootstrap();
      const now = latest.current;
      if (now.status === "ready")
        setLoad({
          ...now,
          saved,
          draft: saved,
          unavailable: unavailableShortcuts,
        });
      setStatus({ kind: "saved" });
    } catch (error) {
      console.error("Saving settings failed", error);
      setStatus({ kind: "failed", message: errorMessage(error) });
      await refreshUnavailable();
    }
  }, [latest, setLoad, refreshUnavailable]);

  const errors: FieldErrors =
    load.status === "ready" ? fieldErrorsOf(load.draft) : {};
  const dirty =
    load.status === "ready" && !sameSettings(load.draft, load.saved);

  return { load, status, errors, dirty, update, save };
}

function fieldErrorsOf(draft: Settings): FieldErrors {
  const validation = validateSettingsForm(draft);
  return validation.ok ? {} : validation.errors;
}
