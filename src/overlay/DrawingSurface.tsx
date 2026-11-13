import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tool } from "../bridge";
import { draftToShape, type Draft } from "../drawing/draft";
import { expiredIds, hasFadingShapes } from "../drawing/fade";
import {
  clearCanvas,
  drawMarquee,
  drawSelectionBox,
  drawShape,
  paintShapes,
} from "../drawing/render";
import { shapeBounds, translateShape } from "../drawing/selection";
import type { InkStyle, Point, Shape, TextShape } from "../drawing/types";
import { prepareCanvas } from "./canvasSetup";
import type { LivePreview } from "./pointerGestures";
import { usePointerDrawing } from "./usePointerDrawing";
import type { Viewport } from "./useViewport";

const DRAFT_ID = "draft";
const NO_IDS: ReadonlySet<string> = new Set();

interface DrawingSurfaceProps {
  readonly viewport: Viewport;
  readonly shapes: readonly Shape[];
  readonly fadeMs: number;
  readonly active: boolean;
  readonly tool: Tool;
  readonly style: InkStyle;
  /** Spotlight mode: the pointer only points, nothing is drawn or selected. */
  readonly pointing: boolean;
  readonly selecting: boolean;
  readonly selection: ReadonlySet<string>;
  readonly onSelect: (ids: ReadonlySet<string>) => void;
  readonly onMove: (ids: ReadonlySet<string>, dx: number, dy: number) => void;
  readonly onDraftEnd: (draft: Draft) => void;
  readonly onErase: (ids: ReadonlySet<string>) => void;
  readonly onExpire: (ids: ReadonlySet<string>) => void;
  readonly onTextRequest: (point: Point) => void;
  readonly onTextEdit: (shape: TextShape) => void;
  /** The text open in the editor; it is not drawn while it is edited. */
  readonly editingId: string | null;
  readonly onDrawingChange: (drawing: boolean) => void;
}

/**
 * Two stacked canvases: committed shapes below, the shape being drawn above.
 * The top canvas also receives pointer input.
 */
export function DrawingSurface(props: DrawingSurfaceProps) {
  const { viewport, shapes, fadeMs, onExpire, selection } = props;
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const [gestureHidden, setHidden] = useState<ReadonlySet<string>>(NO_IDS);
  const { editingId } = props;
  const hidden = useMemo(
    () =>
      editingId === null
        ? gestureHidden
        : new Set([...gestureHidden, editingId]),
    [gestureHidden, editingId],
  );

  const paintInk = useCallback(
    (now: number) => {
      const canvas = inkRef.current;
      const ctx = canvas && prepareCanvas(canvas, viewport);
      if (ctx) paintShapes(ctx, shapes, { now, fadeMs, hidden });
    },
    [viewport, shapes, fadeMs, hidden],
  );

  // The live layer: the gesture in flight plus the selection frames.
  const preview = useRef<LivePreview | null>(null);
  const repaintLive = useCallback(() => {
    const canvas = liveRef.current;
    const ctx = canvas && prepareCanvas(canvas, viewport);
    if (ctx) paintLiveLayer(ctx, preview.current, shapes, selection);
  }, [viewport, shapes, selection]);

  const paintLive = useCallback(
    (next: LivePreview | null) => {
      preview.current = next;
      repaintLive();
    },
    [repaintLive],
  );

  useEffect(() => paintInk(performance.now()), [paintInk]);
  // Shapes or the selection changed: repaint without dropping the gesture.
  useEffect(() => repaintLive(), [repaintLive]);
  useFadeLoop(shapes, fadeMs, paintInk, onExpire);

  usePointerDrawing(liveRef, {
    active: props.active && !props.pointing,
    tool: props.tool,
    style: props.style,
    shapes,
    selecting: props.selecting,
    selection,
    onSelect: props.onSelect,
    onMove: props.onMove,
    onDraftEnd: props.onDraftEnd,
    onErase: props.onErase,
    onHide: setHidden,
    onTextRequest: props.onTextRequest,
    onTextEdit: props.onTextEdit,
    onDrawingChange: props.onDrawingChange,
    paintLive,
  });

  return (
    <>
      <canvas ref={inkRef} className="ink-layer" data-testid="ink-canvas" />
      <canvas
        ref={liveRef}
        className={`ink-layer input-layer tool-${props.tool}${
          props.selecting || props.pointing ? " is-selecting" : ""
        }`}
        data-testid="input-canvas"
      />
    </>
  );
}

function paintLiveLayer(
  ctx: CanvasRenderingContext2D,
  preview: LivePreview | null,
  shapes: readonly Shape[],
  selection: ReadonlySet<string>,
): void {
  clearCanvas(ctx);
  if (preview?.type === "draft")
    drawShape(ctx, draftToShape(preview.draft, DRAFT_ID, performance.now()));
  if (preview?.type === "marquee") drawMarquee(ctx, preview.rect);
  const moving = preview?.type === "move" ? preview : null;
  shapes.forEach((shape) => {
    const moved = moving?.ids.has(shape.id) ?? false;
    const shown =
      moving && moved ? translateShape(shape, moving.dx, moving.dy) : shape;
    // Moving shapes are hidden on the ink layer, so they are drawn here.
    if (moved) drawShape(ctx, shown);
    if (moved || selection.has(shape.id))
      drawSelectionBox(ctx, shapeBounds(shown));
  });
}

/** Animates fading shapes; runs only while at least one exists. */
function useFadeLoop(
  shapes: readonly Shape[],
  fadeMs: number,
  paint: (now: number) => void,
  onExpire: (ids: ReadonlySet<string>) => void,
): void {
  const fading = hasFadingShapes(shapes);

  useEffect(() => {
    if (!fading) return;
    let frame = 0;
    const tick = () => {
      const now = performance.now();
      const expired = expiredIds(shapes, now, fadeMs);
      if (expired.size > 0) {
        onExpire(expired);
        return;
      }
      paint(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [fading, shapes, fadeMs, paint, onExpire]);
}
