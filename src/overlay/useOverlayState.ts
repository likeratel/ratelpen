import { useCallback, useEffect, useRef, useState } from "react";
import {
  bridge,
  type Platform,
  type Session,
  type SessionPatch,
  type Settings,
} from "../bridge";
import { useBridgeEvent } from "../shared/useBridgeEvent";

export type OverlayState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: unknown }
  | {
      readonly status: "ready";
      readonly session: Session;
      readonly settings: Settings;
      readonly platform: Platform;
    };

const onSessionChanged = (listener: (session: Session) => void) =>
  bridge.onSessionChanged(listener);
const onSettingsChanged = (listener: (settings: Settings) => void) =>
  bridge.onSettingsChanged(listener);

/** Mirrors the core rule that leaving draw mode turns the board off. */
export function mergeSession(session: Session, patch: SessionPatch): Session {
  const next = { ...session, ...patch };
  return next.active ? next : { ...next, board: "none" };
}

/**
 * Session and settings shared with the core. `patchSession` updates the
 * screen optimistically and rolls back (reporting through `onError`) when the
 * core rejects the change.
 */
export function useOverlayState(onError: (error: unknown) => void): {
  state: OverlayState;
  patchSession: (patch: SessionPatch) => void;
} {
  const [state, setState] = useState<OverlayState>({ status: "loading" });
  const latest = useRef(state);
  // Events that arrive before the bootstrap answer are newer than it.
  const early = useRef<{ session?: Session; settings?: Settings }>({});

  const commit = useCallback((next: OverlayState) => {
    latest.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    bridge
      .getBootstrap()
      .then((boot) => {
        if (disposed) return;
        commit({
          status: "ready",
          platform: boot.platform,
          session: early.current.session ?? boot.session,
          settings: early.current.settings ?? boot.settings,
        });
        early.current = {};
      })
      .catch((error: unknown) => {
        if (!disposed) commit({ status: "error", error });
      });
    return () => {
      disposed = true;
    };
  }, [commit]);

  useBridgeEvent(onSessionChanged, (session) => {
    const current = latest.current;
    if (current.status === "ready") commit({ ...current, session });
    else early.current = { ...early.current, session };
  });

  useBridgeEvent(onSettingsChanged, (settings) => {
    const current = latest.current;
    if (current.status === "ready") commit({ ...current, settings });
    else early.current = { ...early.current, settings };
  });

  const patchSession = useCallback(
    (patch: SessionPatch) => {
      const before = latest.current;
      if (before.status !== "ready") return;
      commit({ ...before, session: mergeSession(before.session, patch) });
      bridge
        .updateSession(patch)
        .then((session) => {
          const current = latest.current;
          if (current.status === "ready") commit({ ...current, session });
        })
        .catch((error: unknown) => {
          onError(error);
          // Ask the core what is true now; the snapshot from before this
          // patch may already be stale.
          bridge
            .getBootstrap()
            .then(({ session }) => {
              const current = latest.current;
              if (current.status === "ready") commit({ ...current, session });
            })
            .catch(onError);
        });
    },
    [commit, onError],
  );

  return { state, patchSession };
}
