import {
  FADE_SECONDS_MAX,
  FADE_SECONDS_MIN,
  SPOTLIGHT_RADIUS_MAX,
  SPOTLIGHT_RADIUS_MIN,
  SPOTLIGHT_STYLES,
  WIDTH_MAX,
  WIDTH_MIN,
  spotlightStyleSchema,
  type Platform,
  type Settings,
  type Shortcuts,
} from "../bridge";
import { t, type MessageKey } from "../i18n";
import {
  CheckboxField,
  ColorField,
  FieldError,
  NumberField,
  Section,
} from "./fields";
import { ShortcutField } from "./ShortcutField";
import type { FieldErrors } from "./validation";

export interface SectionProps {
  readonly draft: Settings;
  readonly errors: FieldErrors;
  readonly update: (change: (draft: Settings) => Settings) => void;
}

const SHORTCUT_LABELS: Readonly<Record<keyof Shortcuts, MessageKey>> = {
  toggleDraw: "settings.shortcut.toggleDraw",
  clearAll: "settings.shortcut.clearAll",
  toggleSpotlight: "settings.shortcut.toggleSpotlight",
};

const SHORTCUT_KEYS = Object.keys(SHORTCUT_LABELS) as (keyof Shortcuts)[];

export function ShortcutsSection(
  props: SectionProps & {
    readonly platform: Platform;
    readonly unavailable: readonly (keyof Shortcuts)[];
  },
) {
  const { draft, update, unavailable } = props;
  return (
    <Section
      id="shortcuts"
      title={t("settings.shortcuts")}
      hint={t("settings.shortcutsHint")}
    >
      {SHORTCUT_KEYS.map((key) => (
        <ShortcutField
          key={key}
          label={t(SHORTCUT_LABELS[key])}
          value={draft.shortcuts[key]}
          platform={props.platform}
          unavailable={unavailable.includes(key)}
          onChange={(value) =>
            update((d) => ({
              ...d,
              shortcuts: { ...d.shortcuts, [key]: value },
            }))
          }
        />
      ))}
      <FieldError message={props.errors.shortcuts} />
    </Section>
  );
}

export function InkSection({ draft, errors, update }: SectionProps) {
  const setPaletteColor = (index: number, color: string) =>
    update((d) => ({
      ...d,
      palette: d.palette.map((value, i) => (i === index ? color : value)),
    }));
  return (
    <Section id="ink" title={t("settings.ink")}>
      <fieldset className="palette-field">
        <legend>{t("settings.palette")}</legend>
        {draft.palette.map((color, index) => (
          <ColorField
            key={index}
            compact
            label={t("settings.paletteColor", { index: index + 1 })}
            value={color}
            onChange={(value) => setPaletteColor(index, value)}
          />
        ))}
      </fieldset>
      <FieldError message={errors.palette} />
      <ColorField
        label={t("settings.defaultColor")}
        value={draft.defaultColor}
        onChange={(defaultColor) => update((d) => ({ ...d, defaultColor }))}
      />
      <FieldError message={errors.defaultColor} />
      <NumberField
        label={t("settings.defaultWidth")}
        value={draft.defaultWidth}
        min={WIDTH_MIN}
        max={WIDTH_MAX}
        error={errors.defaultWidth}
        onChange={(defaultWidth) => update((d) => ({ ...d, defaultWidth }))}
      />
    </Section>
  );
}

export function FadeSection({ draft, errors, update }: SectionProps) {
  return (
    <Section id="fade" title={t("settings.fade")}>
      <NumberField
        label={t("settings.fadeSeconds")}
        value={draft.fadeSeconds}
        min={FADE_SECONDS_MIN}
        max={FADE_SECONDS_MAX}
        error={errors.fadeSeconds}
        onChange={(fadeSeconds) => update((d) => ({ ...d, fadeSeconds }))}
      />
      <CheckboxField
        label={t("settings.fadeByDefault")}
        checked={draft.fadeByDefault}
        onChange={(fadeByDefault) => update((d) => ({ ...d, fadeByDefault }))}
      />
    </Section>
  );
}

export function SpotlightSection({ draft, errors, update }: SectionProps) {
  return (
    <Section id="spotlight" title={t("settings.spotlight")}>
      <div className="field">
        <label htmlFor="spotlight-style">{t("settings.spotlightStyle")}</label>
        <select
          id="spotlight-style"
          value={draft.spotlightStyle}
          onChange={(event) => {
            const parsed = spotlightStyleSchema.safeParse(event.target.value);
            if (parsed.success)
              update((d) => ({ ...d, spotlightStyle: parsed.data }));
          }}
        >
          {SPOTLIGHT_STYLES.map((style) => (
            <option key={style} value={style}>
              {t(`settings.spotlight.${style}`)}
            </option>
          ))}
        </select>
      </div>
      <NumberField
        label={t("settings.spotlightRadius")}
        value={draft.spotlightRadius}
        min={SPOTLIGHT_RADIUS_MIN}
        max={SPOTLIGHT_RADIUS_MAX}
        error={errors.spotlightRadius}
        onChange={(spotlightRadius) =>
          update((d) => ({ ...d, spotlightRadius }))
        }
      />
    </Section>
  );
}

export function GeneralSection({ draft, update }: SectionProps) {
  return (
    <Section id="general" title={t("settings.general")}>
      <CheckboxField
        label={t("settings.clearOnExit")}
        checked={draft.clearOnExit}
        onChange={(clearOnExit) => update((d) => ({ ...d, clearOnExit }))}
      />
      <CheckboxField
        label={t("settings.launchAtLogin")}
        checked={draft.launchAtLogin}
        onChange={(launchAtLogin) => update((d) => ({ ...d, launchAtLogin }))}
      />
    </Section>
  );
}
