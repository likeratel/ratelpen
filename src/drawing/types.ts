// Shape model for the drawing engine. Pure data; no React or DOM types.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PressurePoint extends Point {
  /** 0..1 as reported by the pointer; see `normalizePressure`. */
  readonly pressure: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends Point, Size {}

interface ShapeBase {
  readonly id: string;
  readonly color: string;
  /** Stroke width in logical px (font size is derived from it for text). */
  readonly width: number;
  /** Milliseconds on the clock the overlay uses (performance.now()). */
  readonly createdAt: number;
  /** Disappears after the fade duration when true. */
  readonly fade: boolean;
}

export type Brush = "pen" | "highlighter";

export interface FreehandShape extends ShapeBase {
  readonly kind: "freehand";
  readonly brush: Brush;
  readonly points: readonly PressurePoint[];
}

export interface SegmentShape extends ShapeBase {
  readonly kind: "line" | "arrow";
  readonly from: Point;
  readonly to: Point;
}

export interface BoxShape extends ShapeBase {
  readonly kind: "rect" | "ellipse";
  readonly from: Point;
  readonly to: Point;
}

export interface TextShape extends ShapeBase {
  readonly kind: "text";
  readonly at: Point;
  readonly text: string;
  readonly fontSize: number;
  /** Measured when the text is committed; used for erasing. */
  readonly size: Size;
}

export type Shape = FreehandShape | SegmentShape | BoxShape | TextShape;
export type ShapeKind = Shape["kind"];

/** Style shared by every shape created with the current session. */
export interface InkStyle {
  readonly color: string;
  readonly width: number;
  readonly fade: boolean;
}
