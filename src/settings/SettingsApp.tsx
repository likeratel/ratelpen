import type { FormEvent } from "react";
import { t } from "../i18n";
import { KeyReference } from "./KeyReference";
import {
  FadeSection,
  GeneralSection,
  InkSection,
  ShortcutsSection,
  SpotlightSection,
} from "./sections";
import { useSettingsForm, type SaveStatus } from "./useSettingsForm";

function StatusLine({
  status,
  dirty,
}: {
  readonly status: SaveStatus;
  readonly dirty: boolean;
}) {
  switch (status.kind) {
    case "saving":
      return (
        <p className="save-status" role="status">
          {t("settings.saving")}
        </p>
      );
    case "saved":
      return (
        <p className="save-status is-success" role="status">
          {t("settings.saved")}
        </p>
      );
    case "invalid":
      return (
        <p className="save-status is-error" role="alert">
          {t("settings.invalid")}
        </p>
      );
    case "failed":
      return (
        <p className="save-status is-error" role="alert">
          {t("common.errorWithDetail", {
            summary: t("settings.saveFailed"),
            detail: status.message,
          })}
        </p>
      );
    case "idle":
      return (
        <p className="save-status" role="status">
          {dirty ? t("settings.unsaved") : ""}
        </p>
      );
  }
}

export function SettingsApp() {
  const { load, status, errors, dirty, update, save } = useSettingsForm();

  if (load.status === "loading")
    return (
      <main className="settings">
        <p role="status">{t("settings.loading")}</p>
      </main>
    );
  if (load.status === "error")
    return (
      <main className="settings">
        <p className="save-status is-error" role="alert">
          {t("common.errorWithDetail", {
            summary: t("settings.loadFailed"),
            detail: load.message,
          })}
        </p>
      </main>
    );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };
  const sectionProps = { draft: load.draft, errors, update };

  return (
    <main className="settings">
      <h1>{t("settings.title")}</h1>
      <form onSubmit={onSubmit} noValidate>
        <ShortcutsSection
          {...sectionProps}
          platform={load.platform}
          unavailable={load.unavailable}
        />
        <InkSection {...sectionProps} />
        <FadeSection {...sectionProps} />
        <SpotlightSection {...sectionProps} />
        <GeneralSection {...sectionProps} />
        <KeyReference platform={load.platform} />
        <footer className="settings-footer">
          <StatusLine status={status} dirty={dirty} />
          <button
            type="submit"
            className="primary-button"
            disabled={status.kind === "saving"}
          >
            {t("settings.save")}
          </button>
        </footer>
      </form>
    </main>
  );
}
