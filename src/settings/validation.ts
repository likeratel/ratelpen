import {
  FADE_SECONDS_MAX,
  FADE_SECONDS_MIN,
  SPOTLIGHT_RADIUS_MAX,
  SPOTLIGHT_RADIUS_MIN,
  WIDTH_MAX,
  WIDTH_MIN,
  settingsSchema,
  type Settings,
} from "../bridge/types";
import { t } from "../i18n";

export type FieldKey =
  | "shortcuts"
  | "palette"
  | "defaultColor"
  | "defaultWidth"
  | "fadeSeconds"
  | "spotlightRadius";

export type FieldErrors = Partial<Record<FieldKey, string>>;

const RANGES: Readonly<
  Record<
    "defaultWidth" | "fadeSeconds" | "spotlightRadius",
    { min: number; max: number }
  >
> = {
  defaultWidth: { min: WIDTH_MIN, max: WIDTH_MAX },
  fadeSeconds: { min: FADE_SECONDS_MIN, max: FADE_SECONDS_MAX },
  spotlightRadius: { min: SPOTLIGHT_RADIUS_MIN, max: SPOTLIGHT_RADIUS_MAX },
};

/** The core schema plus rules that only make sense for the form. */
export const settingsFormSchema = settingsSchema.superRefine(
  (settings, ctx) => {
    const used = Object.values(settings.shortcuts).filter(
      (value) => value !== "",
    );
    if (new Set(used).size !== used.length)
      ctx.addIssue({
        code: "custom",
        path: ["shortcuts"],
        message: "duplicate",
      });
  },
);

function messageFor(field: FieldKey): string {
  switch (field) {
    case "shortcuts":
      return t("settings.shortcut.duplicate");
    case "palette":
    case "defaultColor":
      return t("validation.color");
    default:
      return t("validation.range", RANGES[field]);
  }
}

function isFieldKey(value: unknown): value is FieldKey {
  return (
    value === "shortcuts" ||
    value === "palette" ||
    value === "defaultColor" ||
    value === "defaultWidth" ||
    value === "fadeSeconds" ||
    value === "spotlightRadius"
  );
}

export type FormValidation =
  | { readonly ok: true; readonly settings: Settings }
  | { readonly ok: false; readonly errors: FieldErrors };

export function validateSettingsForm(draft: unknown): FormValidation {
  const parsed = settingsFormSchema.safeParse(draft);
  if (parsed.success) return { ok: true, settings: parsed.data };
  const errors = parsed.error.issues.reduce<FieldErrors>((acc, issue) => {
    const field = issue.path[0];
    if (!isFieldKey(field) || acc[field]) return acc;
    return { ...acc, [field]: messageFor(field) };
  }, {});
  return { ok: false, errors };
}

/** Number input value; an empty or partial entry becomes NaN and fails validation. */
export function parseNumberInput(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}
