import { useCallback, useEffect, useState } from "react";

export type ToastKind = "info" | "error";

export interface ToastMessage {
  readonly id: number;
  readonly kind: ToastKind;
  readonly text: string;
}

export const TOAST_INFO_MS = 2500;
export const TOAST_ERROR_MS = 6000;

export function useToast(): {
  toast: ToastMessage | null;
  showToast: (text: string, kind?: ToastKind) => void;
  dismissToast: () => void;
} {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, kind: ToastKind = "info") => {
    setToast((current) => ({ id: (current?.id ?? 0) + 1, kind, text }));
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (toast === null) return;
    const duration = toast.kind === "error" ? TOAST_ERROR_MS : TOAST_INFO_MS;
    const timer = window.setTimeout(() => setToast(null), duration);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return { toast, showToast, dismissToast };
}
