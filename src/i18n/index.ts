import { en, type MessageKey } from "./en";
import { ko } from "./ko";

export type { MessageKey } from "./en";
export type Locale = "en" | "ko";
export type MessageValues = Readonly<Record<string, string | number>>;
export type Translate = (key: MessageKey, values?: MessageValues) => string;

const catalogs: Record<Locale, Readonly<Record<MessageKey, string>>> = {
  en,
  ko,
};

export function resolveLocale(languages: readonly string[]): Locale {
  const match = languages.find((tag) => {
    const lower = tag.toLowerCase();
    return lower.startsWith("ko") || lower.startsWith("en");
  });
  return match?.toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function translate(
  locale: Locale,
  key: MessageKey,
  values: MessageValues = {},
): string {
  return catalogs[locale][key].replace(
    /\{(\w+)\}/g,
    (placeholder, name: string) =>
      Object.prototype.hasOwnProperty.call(values, name)
        ? String(values[name])
        : placeholder,
  );
}

function systemLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];
}

export const locale: Locale = resolveLocale(systemLanguages());

export const t: Translate = (key, values) => translate(locale, key, values);
