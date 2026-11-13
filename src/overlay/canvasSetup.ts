import type { Viewport } from "./useViewport";

/** Sizes the backing store for devicePixelRatio and scales drawing to CSS px. */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  viewport: Viewport,
): CanvasRenderingContext2D | null {
  const { pixelRatio } = viewport;
  const width = Math.max(1, Math.round(viewport.width * pixelRatio));
  const height = Math.max(1, Math.round(viewport.height * pixelRatio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d", { desynchronized: true });
  ctx?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return ctx;
}

let measureContext: CanvasRenderingContext2D | null = null;

/** A detached 2D context for measuring text. */
export function getMeasureContext(): CanvasRenderingContext2D {
  if (measureContext) return measureContext;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  measureContext = ctx;
  return ctx;
}
