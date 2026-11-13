import type { Tool } from "../bridge";
import {
  extendDraft,
  isDraftTool,
  startDraft,
  type Draft,
} from "../drawing/draft";
import { hitAlongSegment, normalizePressure } from "../drawing/geometry";
import type {
  InkStyle,
  Point,
  PressurePoint,
  Rect,
  Shape,
} from "../drawing/types";
import {
  extendSelect,
  isClick,
  marqueeSelection,
  NO_SELECTION,
  startSelect,
  type SelectGesture,
} from "./selectGestures";

/** Radius of the eraser around the pointer, in CSS px. */
export const ERASER_RADIUS = 12;
const PRIMARY_BUTTON = 0;

export interface GestureOptions {
  readonly active: boolean;
  readonly tool: Tool;
  readonly style: InkStyle;
  readonly shapes: readonly Shape[];
  /** Space is held: presses select and move instead of drawing. */
  readonly selecting: boolean;
  readonly selection: ReadonlySet<string>;
  readonly onSelect: (ids: ReadonlySet<string>) => void;
  readonly onMove: (ids: ReadonlySet<string>, dx: number, dy: number) => void;
  readonly onDraftEnd: (draft: Draft) => void;
  readonly onErase: (ids: ReadonlySet<string>) => void;
  /** Shapes to leave out of the committed layer while a gesture shows them. */
  readonly onHide: (ids: ReadonlySet<string>) => void;
  readonly onTextRequest: (point: Point) => void;
  readonly onDrawingChange: (drawing: boolean) => void;
  readonly paintLive: (preview: LivePreview | null) => void;
}

/** What the gesture in flight wants drawn on the live layer. */
export type LivePreview =
  | { readonly type: "draft"; readonly draft: Draft }
  | {
      readonly type: "move";
      readonly ids: ReadonlySet<string>;
      readonly dx: number;
      readonly dy: number;
    }
  | { readonly type: "marquee"; readonly rect: Rect };

interface DraftGesture {
  readonly type: "draft";
  readonly pointerId: number;
  readonly draft: Draft;
}

interface EraseGesture {
  readonly type: "erase";
  readonly pointerId: number;
  readonly last: Point;
  readonly hits: ReadonlySet<string>;
}

type Gesture = DraftGesture | EraseGesture | SelectGesture;

function previewOf(gesture: Gesture | null): LivePreview | null {
  if (!gesture || gesture.type === "erase") return null;
  if (gesture.type === "marquee")
    return gesture.rect ? { type: "marquee", rect: gesture.rect } : null;
  return gesture;
}

function toPoint(event: PointerEvent): PressurePoint {
  return {
    x: event.clientX,
    y: event.clientY,
    pressure: normalizePressure(event.pressure),
  };
}

/** Every sample since the last event, so fast strokes keep their detail. */
function samples(event: PointerEvent): PressurePoint[] {
  const coalesced =
    typeof event.getCoalescedEvents === "function"
      ? event.getCoalescedEvents()
      : [];
  return (coalesced.length > 0 ? coalesced : [event]).map(toPoint);
}

/** Extends an eraser gesture along `points`; one drag is one erase. */
export function eraseAlong(
  gesture: EraseGesture,
  shapes: readonly Shape[],
  points: readonly Point[],
): EraseGesture {
  const remaining = shapes.filter((shape) => !gesture.hits.has(shape.id));
  const swept = points.reduce(
    (acc, point) => ({
      last: point,
      hits: [
        ...acc.hits,
        ...hitAlongSegment(remaining, acc.last, point, ERASER_RADIUS),
      ],
    }),
    { last: gesture.last, hits: [] as string[] },
  );
  if (swept.hits.length === 0) return { ...gesture, last: swept.last };
  return {
    ...gesture,
    last: swept.last,
    hits: new Set([...gesture.hits, ...swept.hits]),
  };
}

/**
 * Turns raw pointer events on the drawing surface into drafts, erasures and
 * selection changes. Holds only the in-flight gesture; committed shapes and
 * the selection stay in React state.
 */
export class PointerGestures {
  private gesture: Gesture | null = null;
  private frame = 0;

  constructor(
    private readonly element: HTMLElement,
    private readonly read: () => GestureOptions,
  ) {}

  readonly begin = (event: PointerEvent): void => {
    const opts = this.read();
    if (!opts.active || this.gesture || event.button !== PRIMARY_BUTTON) return;
    event.preventDefault();
    const point = toPoint(event);
    if (opts.selecting) {
      this.beginSelect(event, opts, point);
      return;
    }
    if (opts.selection.size > 0) opts.onSelect(NO_SELECTION);
    if (opts.tool === "text") {
      opts.onTextRequest(point);
      return;
    }
    if (opts.tool !== "eraser" && !isDraftTool(opts.tool)) return;
    this.element.setPointerCapture(event.pointerId);
    if (opts.tool === "eraser") {
      const start: EraseGesture = {
        type: "erase",
        pointerId: event.pointerId,
        last: point,
        hits: new Set(),
      };
      const gesture = eraseAlong(start, opts.shapes, [point]);
      this.gesture = gesture;
      opts.onHide(gesture.hits);
    } else {
      const draft = startDraft(opts.tool, point, opts.style);
      this.gesture = { type: "draft", pointerId: event.pointerId, draft };
      this.schedulePaint();
    }
    opts.onDrawingChange(true);
  };

  /** Typed as Event because `pointerrawupdate` is not in the DOM typings. */
  readonly move = (event: Event): void => {
    if (!(event instanceof PointerEvent)) return;
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (gesture.type === "move" || gesture.type === "marquee") {
      this.gesture = extendSelect(gesture, toPoint(event));
      this.schedulePaint();
      return;
    }
    const points = samples(event);
    if (gesture.type === "draft") {
      this.updateDraft(extendDraft(gesture.draft, points, event.shiftKey));
      return;
    }
    const next = eraseAlong(gesture, this.read().shapes, points);
    this.gesture = next;
    if (next.hits !== gesture.hits) this.read().onHide(next.hits);
  };

  readonly up = (event: PointerEvent): void => this.end(event, true);

  readonly cancel = (event: PointerEvent): void => this.end(event, false);

  /** Re-applies the Shift constraint when Shift changes without movement. */
  readonly shiftChanged = (event: KeyboardEvent): void => {
    const gesture = this.gesture;
    if (event.key !== "Shift" || gesture?.type !== "draft") return;
    this.updateDraft(extendDraft(gesture.draft, [], event.shiftKey));
  };

  /** Drops the gesture in flight, e.g. when draw mode is turned off mid-drag. */
  abort(): void {
    if (!this.gesture) return;
    this.gesture = null;
    this.finish(this.read());
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.gesture = null;
  }

  private beginSelect(
    event: PointerEvent,
    opts: GestureOptions,
    point: Point,
  ): void {
    const start = startSelect(opts.shapes, opts.selection, {
      point,
      pointerId: event.pointerId,
      shiftKey: event.shiftKey,
    });
    opts.onSelect(start.selection);
    if (!start.gesture) return;
    this.element.setPointerCapture(event.pointerId);
    this.gesture = start.gesture;
    // The shapes being moved are drawn on the live layer until the drop.
    if (start.gesture.type === "move") opts.onHide(start.gesture.ids);
    this.schedulePaint();
    opts.onDrawingChange(true);
  }

  private updateDraft(draft: Draft): void {
    if (this.gesture?.type !== "draft") return;
    this.gesture = { ...this.gesture, draft };
    this.schedulePaint();
  }

  private end(event: PointerEvent, keep: boolean): void {
    const finished = this.gesture;
    if (!finished || event.pointerId !== finished.pointerId) return;
    this.gesture = null;
    const opts = this.read();
    if (keep) this.commit(finished, opts);
    this.finish(opts);
  }

  private commit(finished: Gesture, opts: GestureOptions): void {
    switch (finished.type) {
      case "draft":
        opts.onDraftEnd(finished.draft);
        return;
      case "erase":
        if (finished.hits.size > 0) opts.onErase(finished.hits);
        return;
      case "move":
        // A click on one of several selected shapes narrows to that shape.
        if (isClick(finished)) opts.onSelect(new Set([finished.hitId]));
        else opts.onMove(finished.ids, finished.dx, finished.dy);
        return;
      case "marquee":
        opts.onSelect(marqueeSelection(finished, opts.shapes));
    }
  }

  /** Clears everything a gesture put on screen, kept or not. */
  private finish(opts: GestureOptions): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    opts.onHide(NO_SELECTION);
    opts.paintLive(null);
    opts.onDrawingChange(false);
  }

  private schedulePaint(): void {
    if (this.frame !== 0) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.read().paintLive(previewOf(this.gesture));
    });
  }
}
