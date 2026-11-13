import type { Platform } from "../bridge";
import { t, type MessageKey } from "../i18n";
import { commandShortcuts } from "../overlay/actions";

function rows(
  platform: Platform,
): ReadonlyArray<readonly [MessageKey, string]> {
  const command = commandShortcuts(platform);
  return [
    ["settings.keys.tools", "P H L A R O T E"],
    ["settings.keys.colors", "1 – 8"],
    ["settings.keys.width", "[  ]"],
    ["settings.keys.fade", "F"],
    ["settings.keys.spotlight", "S"],
    ["settings.keys.board", "B"],
    ["settings.keys.undo", command.undo],
    ["settings.keys.redo", command.redo],
    ["settings.keys.select", "Space + click / drag"],
    ["settings.keys.deleteSelected", "D"],
    ["settings.keys.clear", "Delete / Backspace"],
    ["settings.keys.exit", "Esc"],
    ["settings.keys.constrain", "Shift"],
  ];
}

/** Read-only list of the fixed draw-mode keys. */
export function KeyReference({ platform }: { readonly platform: Platform }) {
  return (
    <section className="settings-section" aria-labelledby="keys-heading">
      <h2 id="keys-heading">{t("settings.keys")}</h2>
      <p className="section-hint">{t("settings.keysHint")}</p>
      <table className="key-table">
        <thead>
          <tr>
            <th scope="col">{t("settings.keys.action")}</th>
            <th scope="col">{t("settings.keys.key")}</th>
          </tr>
        </thead>
        <tbody>
          {rows(platform).map(([label, keys]) => (
            <tr key={label}>
              <td>{t(label)}</td>
              <td>
                <kbd>{keys}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
