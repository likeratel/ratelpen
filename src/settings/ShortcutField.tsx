import { X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import type { Platform } from "../bridge";
import { t, type MessageKey } from "../i18n";
import { acceleratorFromEvent } from "./accelerator";

interface ShortcutFieldProps {
  readonly label: string;
  readonly value: string;
  readonly platform: Platform;
  /** The saved shortcut could not be registered with the system. */
  readonly unavailable?: boolean;
  readonly onChange: (value: string) => void;
}

const HINTS: Readonly<Record<"needsModifier" | "unsupported", MessageKey>> = {
  needsModifier: "settings.shortcut.needsModifier",
  unsupported: "settings.shortcut.unsupported",
};

function isPlainTab(event: KeyboardEvent): boolean {
  return (
    event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey
  );
}

/** Records a key combination as a Tauri accelerator when focused. */
export function ShortcutField({
  label,
  value,
  platform,
  unavailable = false,
  onChange,
}: ShortcutFieldProps) {
  const id = useId();
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<MessageKey | null>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isPlainTab(event)) return;
    event.preventDefault();
    const result = acceleratorFromEvent(event, platform);
    if (result.kind === "pending") return;
    if (result.kind === "ok") {
      setHint(null);
      onChange(result.accelerator);
      return;
    }
    setHint(HINTS[result.kind]);
  };

  return (
    <div className="shortcut-field">
      <label htmlFor={id}>{label}</label>
      <div className="shortcut-input">
        <input
          id={id}
          readOnly
          value={value}
          placeholder={t(
            recording
              ? "settings.shortcut.recording"
              : "settings.shortcut.disabled",
          )}
          aria-describedby={hint ? `${id}-hint` : undefined}
          aria-invalid={hint ? true : undefined}
          onKeyDown={handleKeyDown}
          onFocus={() => setRecording(true)}
          onBlur={() => {
            setRecording(false);
            setHint(null);
          }}
        />
        <button
          type="button"
          className="icon-button"
          aria-label={t("settings.shortcut.clear", { name: label })}
          title={t("settings.shortcut.clear", { name: label })}
          disabled={value === ""}
          onClick={() => onChange("")}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      {unavailable && !hint && (
        <p className="field-error" role="alert">
          {t("settings.shortcut.unavailable")}
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className="field-error" role="alert">
          {t(hint)}
        </p>
      )}
    </div>
  );
}
