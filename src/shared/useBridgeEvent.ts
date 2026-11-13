import { useEffect, useRef } from "react";
import type { Listener, Unlisten } from "../bridge";

export type Subscribe<T> = (listener: Listener<T>) => Promise<Unlisten>;

/**
 * Subscribes to a bridge event for the component's lifetime. `subscribe` must
 * be stable (define it at module scope); `listener` may change every render.
 */
export function useBridgeEvent<T>(
  subscribe: Subscribe<T>,
  listener: Listener<T>,
): void {
  const latest = useRef(listener);

  useEffect(() => {
    latest.current = listener;
  });

  useEffect(() => {
    let unlisten: Unlisten | null = null;
    let disposed = false;
    subscribe((payload) => latest.current(payload))
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch((error: unknown) => {
        console.error("Event subscription failed", error);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [subscribe]);
}
