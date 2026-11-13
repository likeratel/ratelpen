import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { clampToBounds } from "../drawing/geometry";
import type { Point } from "../drawing/types";

interface DragStart {
  readonly pointerId: number;
  readonly pointer: Point;
  readonly origin: Point;
}

type GripEvent = ReactPointerEvent<HTMLElement>;

function windowBounds() {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Lets the toolbar be dragged by its grip. `null` keeps the default
 * bottom-centre placement; the position lives in memory only.
 */
export function useToolbarDrag(toolbar: RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState<Point | null>(null);
  const drag = useRef<DragStart | null>(null);

  const clamped = useCallback(
    (point: Point): Point => {
      const rect = toolbar.current?.getBoundingClientRect();
      const size = rect
        ? { width: rect.width, height: rect.height }
        : { width: 0, height: 0 };
      return clampToBounds(point, size, windowBounds());
    },
    [toolbar],
  );

  useEffect(() => {
    const onResize = () =>
      setPosition((current) => current && clamped(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamped]);

  const onPointerDown = (event: GripEvent) => {
    const rect = toolbar.current?.getBoundingClientRect();
    if (!rect || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      pointer: { x: event.clientX, y: event.clientY },
      origin: { x: rect.left, y: rect.top },
    };
  };

  const onPointerMove = (event: GripEvent) => {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setPosition(
      clamped({
        x: start.origin.x + event.clientX - start.pointer.x,
        y: start.origin.y + event.clientY - start.pointer.y,
      }),
    );
  };

  const onPointerEnd = (event: GripEvent) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  return {
    position,
    gripHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  };
}
