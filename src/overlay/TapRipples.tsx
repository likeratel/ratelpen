import { useEffect, useState } from "react";
import { TAP_SLOP } from "../drawing/draft";

const PRIMARY_BUTTON = 0;
/** Taps on the app's own controls are not echoed. */
const CHROME_SELECTOR = ".toolbar, .text-editor";

interface Ripple {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

interface Press {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
}

function onChrome(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(CHROME_SELECTOR) !== null;
}

/**
 * Shows a short ring wherever the screen is tapped, whatever tool is
 * selected, so viewers can see a click that leaves no ink.
 */
export function TapRipples({
  enabled,
  color,
}: {
  readonly enabled: boolean;
  readonly color: string;
}) {
  const [ripples, setRipples] = useState<readonly Ripple[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let press: Press | null = null;
    let nextId = 0;
    const onDown = (event: PointerEvent) => {
      const counts = event.button === PRIMARY_BUTTON && !onChrome(event.target);
      press = counts
        ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
        : null;
    };
    const onUp = (event: PointerEvent) => {
      const started = press;
      press = null;
      if (!started || started.pointerId !== event.pointerId) return;
      const moved = Math.hypot(
        event.clientX - started.x,
        event.clientY - started.y,
      );
      if (moved > TAP_SLOP) return;
      nextId += 1;
      const ripple = { id: nextId, x: event.clientX, y: event.clientY };
      setRipples((current) => [...current, ripple]);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      setRipples([]);
    };
  }, [enabled]);

  return (
    <>
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="tap-ripple"
          data-testid="tap-ripple"
          style={{ left: ripple.x, top: ripple.y, color }}
          onAnimationEnd={(event) => {
            // The dot and the ring both end here; the ring is the last one.
            if (event.pseudoElement !== "::after") return;
            setRipples((current) =>
              current.filter((item) => item.id !== ripple.id),
            );
          }}
        />
      ))}
    </>
  );
}
