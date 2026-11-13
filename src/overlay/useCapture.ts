import { useCallback, useRef, useState } from "react";
import { bridge, errorCode, type CaptureDestination } from "../bridge";
import { t } from "../i18n";
import { describeError } from "../shared/errors";
import type { ToastKind } from "../shared/useToast";

/** Frames to wait after hiding the toolbar so the compositor has dropped it. */
export const FRAMES_BEFORE_CAPTURE = 2;
export const CAPTURE_PERMISSION_CODE = "capture_permission";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitFrames(count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) await nextFrame();
}

export function captureSuccessText(
  destination: CaptureDestination,
  path: string | null,
): string {
  if (destination === "clipboard") return t("toast.copied");
  if (!path) return t("toast.savedNoPath");
  // File name only: the full path holds the account name and this toast can
  // appear on a shared screen.
  const name = path.split(/[\\/]/).pop() ?? path;
  return t("toast.saved", { path: name });
}

export function captureErrorText(error: unknown): string {
  if (errorCode(error) === CAPTURE_PERMISSION_CODE)
    return t("error.capturePermission");
  return describeError("error.captureFailed", error);
}

/** Hides the overlay chrome, captures the monitor, then reports the result. */
export function useCapture(
  showToast: (text: string, kind?: ToastKind) => void,
): {
  capturing: boolean;
  capture: (destination: CaptureDestination) => Promise<void>;
} {
  const [capturing, setCapturing] = useState(false);
  const busy = useRef(false);

  const capture = useCallback(
    async (destination: CaptureDestination) => {
      if (busy.current) return;
      busy.current = true;
      setCapturing(true);
      try {
        await waitFrames(FRAMES_BEFORE_CAPTURE);
        const result = await bridge.captureScreen(destination);
        showToast(captureSuccessText(destination, result.path));
      } catch (error) {
        console.error("Screen capture failed", error);
        showToast(captureErrorText(error), "error");
      } finally {
        busy.current = false;
        setCapturing(false);
      }
    },
    [showToast],
  );

  return { capturing, capture };
}
