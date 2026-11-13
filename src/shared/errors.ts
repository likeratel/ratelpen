import { errorMessage } from "../bridge";
import { t, type MessageKey } from "../i18n";

/** A translated summary followed by the underlying error message. */
export function describeError(summary: MessageKey, error: unknown): string {
  return t("common.errorWithDetail", {
    summary: t(summary),
    detail: errorMessage(error),
  });
}
