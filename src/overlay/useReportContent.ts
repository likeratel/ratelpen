import { useEffect, useRef } from "react";
import { bridge } from "../bridge";

/**
 * Tells the core when this overlay goes from empty to non-empty or back,
 * including once on start. A failed report is retried on the next change.
 */
export function useReportContent(
  hasContent: boolean,
  onError: (error: unknown) => void,
): void {
  const reported = useRef<boolean | null>(null);

  useEffect(() => {
    if (reported.current === hasContent) return;
    reported.current = hasContent;
    bridge.reportContent(hasContent).catch((error: unknown) => {
      if (reported.current === hasContent) reported.current = null;
      onError(error);
    });
  }, [hasContent, onError]);
}
