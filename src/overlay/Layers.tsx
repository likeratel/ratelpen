import type { Board, CursorPosition, SpotlightStyle } from "../bridge";
import type { ToastMessage } from "../shared/useToast";

export function BoardLayer({ board }: { readonly board: Board }) {
  if (board === "none") return null;
  return <div className={`board board-${board}`} data-testid="board" />;
}

interface SpotlightProps {
  readonly enabled: boolean;
  readonly cursor: CursorPosition;
  readonly style: SpotlightStyle;
  readonly radius: number;
}

export function SpotlightLayer({
  enabled,
  cursor,
  style,
  radius,
}: SpotlightProps) {
  if (!enabled || cursor === null) return null;
  if (style === "focus")
    return (
      <div
        className="spotlight-focus"
        data-testid="spotlight"
        style={{
          background: `radial-gradient(circle ${radius}px at ${cursor.x}px ${cursor.y}px, transparent ${radius - 1}px, var(--spotlight-dim) ${radius}px)`,
        }}
      />
    );
  return (
    <div
      className="spotlight-halo"
      data-testid="spotlight"
      style={{
        left: cursor.x - radius,
        top: cursor.y - radius,
        width: radius * 2,
        height: radius * 2,
      }}
    />
  );
}

export function Toast({ toast }: { readonly toast: ToastMessage | null }) {
  if (toast === null) return null;
  return (
    <div
      key={toast.id}
      className={`toast toast-${toast.kind}`}
      role={toast.kind === "error" ? "alert" : "status"}
    >
      {toast.text}
    </div>
  );
}
