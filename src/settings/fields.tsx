import { useId, type ReactNode } from "react";
import { parseNumberInput } from "./validation";

interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly error?: string;
  readonly onChange: (value: number) => void;
}

export function NumberField({
  label,
  value,
  min,
  max,
  error,
  onChange,
}: NumberFieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={Number.isNaN(value) ? "" : value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(parseNumberInput(event.target.value))}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

interface CheckboxFieldProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

export function CheckboxField({
  label,
  checked,
  onChange,
}: CheckboxFieldProps) {
  return (
    <label className="checkbox-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

interface ColorFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly compact?: boolean;
}

export function ColorField({
  label,
  value,
  onChange,
  compact,
}: ColorFieldProps) {
  const id = useId();
  return (
    <div className={compact ? "color-field compact" : "color-field"}>
      <label htmlFor={id} className={compact ? "visually-hidden" : undefined}>
        {label}
      </label>
      <input
        id={id}
        type="color"
        value={value}
        title={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function FieldError({
  id,
  message,
}: {
  readonly id?: string;
  readonly message?: string;
}) {
  if (!message) return null;
  return (
    <p id={id} className="field-error" role="alert">
      {message}
    </p>
  );
}

export function Section({
  id,
  title,
  hint,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="settings-section" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{title}</h2>
      {hint && <p className="section-hint">{hint}</p>}
      {children}
    </section>
  );
}
