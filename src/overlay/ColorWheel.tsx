import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { hsvToRgb, type Hsv } from "../drawing/color";
import { t } from "../i18n";

/** Diameter of the wheel in CSS px. */
export const WHEEL_SIZE = 168;
/** Backing-store scale; 2 is enough for a smooth gradient. */
const WHEEL_SCALE = 2;
const FULL_TURN = 360;

/** Paints hue around the circle and saturation along the radius, at value `v`. */
function paintWheel(canvas: HTMLCanvasElement, v: number): void {
  const size = WHEEL_SIZE * WHEEL_SCALE;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(size, size);
  const radius = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - radius;
      const dy = y + 0.5 - radius;
      const s = Math.hypot(dx, dy) / radius;
      if (s > 1) continue;
      const { r, g, b } = hsvToRgb({ h: hueOf(dx, dy), s, v });
      const offset = (y * size + x) * 4;
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** Red at three o'clock, hue growing counter-clockwise. */
function hueOf(dx: number, dy: number): number {
  const degrees = (Math.atan2(-dy, dx) * FULL_TURN) / (2 * Math.PI);
  return (degrees + FULL_TURN) % FULL_TURN;
}

function markerPosition({ h, s }: Hsv): { left: number; top: number } {
  const angle = (h * 2 * Math.PI) / FULL_TURN;
  const radius = (WHEEL_SIZE / 2) * s;
  return {
    left: WHEEL_SIZE / 2 + Math.cos(angle) * radius,
    top: WHEEL_SIZE / 2 - Math.sin(angle) * radius,
  };
}

interface ColorWheelProps {
  readonly hsv: Hsv;
  readonly onChange: (hsv: Hsv) => void;
}

/** Hue and saturation picker; brightness comes from the slider next to it. */
export function ColorWheel({ hsv, onChange }: ColorWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) paintWheel(canvasRef.current, hsv.v);
  }, [hsv.v]);

  const pick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const s = Math.min(1, Math.hypot(dx, dy) / (rect.width / 2));
    onChange({ h: hueOf(dx, dy), s, v: hsv.v });
  };

  return (
    <div
      className="color-wheel"
      role="img"
      aria-label={t("color.wheel")}
      data-testid="color-wheel"
      style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pick(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event);
      }}
    >
      <canvas ref={canvasRef} />
      <span className="color-wheel-marker" style={markerPosition(hsv)} />
    </div>
  );
}
