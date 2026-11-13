import { parseColorInput } from "../drawing/color";

// The user's own colours, kept on this machine in the web view's storage.

export const FAVORITE_LIMIT = 10;
const STORAGE_KEY = "ratelpen.favoriteColors";

/** Newest first, without duplicates, at most `FAVORITE_LIMIT`. */
export function addFavorite(
  favorites: readonly string[],
  color: string,
): readonly string[] {
  const rest = favorites.filter((item) => item !== color);
  return [color, ...rest].slice(0, FAVORITE_LIMIT);
}

export function removeFavorite(
  favorites: readonly string[],
  color: string,
): readonly string[] {
  return favorites.filter((item) => item !== color);
}

/** Keeps only valid colours; stored data is not trusted. */
export function sanitizeFavorites(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const colors = value
    .map((item) => (typeof item === "string" ? parseColorInput(item) : null))
    .filter((item): item is string => item !== null);
  return [...new Set(colors)].slice(0, FAVORITE_LIMIT);
}

export function loadFavorites(): readonly string[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return sanitizeFavorites(JSON.parse(stored ?? "[]"));
  } catch {
    return [];
  }
}

/** Returns false when storage is unavailable, so the UI can say so. */
export function saveFavorites(favorites: readonly string[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    return true;
  } catch {
    return false;
  }
}
