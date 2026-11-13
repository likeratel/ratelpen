import type { ReactNode } from "react";
import { t } from "../i18n";

export const ICON_SIZE = 18;
export const ICON_STROKE = 2;

interface ToolbarButtonProps {
  readonly label: string;
  readonly shortcut?: string;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}

export function ToolbarButton({
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
}: ToolbarButtonProps) {
  const title = shortcut
    ? t("common.withShortcut", { label, shortcut })
    : label;
  return (
    <button
      type="button"
      className="tb-button"
      aria-label={label}
      aria-pressed={pressed}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ToolbarDivider() {
  return <span className="tb-divider" aria-hidden="true" />;
}
