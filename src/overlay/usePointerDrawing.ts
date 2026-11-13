import { useEffect, useRef, type RefObject } from "react";
import { PointerGestures, type GestureOptions } from "./pointerGestures";

/** The lowest-latency move event the engine offers. */
function moveEventName(): "pointerrawupdate" | "pointermove" {
  return "onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove";
}

/**
 * Binds native pointer listeners to the drawing surface. React state is not
 * touched per sample; options are read through a ref.
 */
export function usePointerDrawing(
  target: RefObject<HTMLElement | null>,
  options: GestureOptions,
): void {
  const latest = useRef(options);
  const gesturesRef = useRef<PointerGestures | null>(null);
  useEffect(() => {
    latest.current = options;
  });

  // The window turns click-through when draw mode ends, so the pointerup of
  // a drag in progress may never arrive.
  const { active } = options;
  useEffect(() => {
    if (!active) gesturesRef.current?.abort();
  }, [active]);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const gestures = new PointerGestures(element, () => latest.current);
    gesturesRef.current = gestures;
    const onLostCapture = () => gestures.abort();
    const moveEvent = moveEventName();
    element.addEventListener("pointerdown", gestures.begin);
    element.addEventListener(moveEvent, gestures.move);
    element.addEventListener("pointerup", gestures.up);
    element.addEventListener("pointercancel", gestures.cancel);
    element.addEventListener("lostpointercapture", onLostCapture);
    element.addEventListener("dblclick", gestures.doubleClick);
    window.addEventListener("keydown", gestures.shiftChanged);
    window.addEventListener("keyup", gestures.shiftChanged);
    return () => {
      gestures.dispose();
      gesturesRef.current = null;
      element.removeEventListener("lostpointercapture", onLostCapture);
      element.removeEventListener("dblclick", gestures.doubleClick);
      element.removeEventListener("pointerdown", gestures.begin);
      element.removeEventListener(moveEvent, gestures.move);
      element.removeEventListener("pointerup", gestures.up);
      element.removeEventListener("pointercancel", gestures.cancel);
      window.removeEventListener("keydown", gestures.shiftChanged);
      window.removeEventListener("keyup", gestures.shiftChanged);
    };
  }, [target]);
}
