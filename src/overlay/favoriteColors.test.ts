import { describe, expect, it } from "vitest";
import {
  FAVORITE_LIMIT,
  addFavorite,
  removeFavorite,
  sanitizeFavorites,
} from "./favoriteColors";

describe("favourite colours", () => {
  it("adds newest first without duplicates", () => {
    const list = addFavorite(addFavorite([], "#111111"), "#222222");
    expect(list).toEqual(["#222222", "#111111"]);
    expect(addFavorite(list, "#111111")).toEqual(["#111111", "#222222"]);
  });

  it("drops the oldest beyond the limit", () => {
    const many = Array.from({ length: FAVORITE_LIMIT }, (_, i) => `#0000${i}0`);
    const next = addFavorite(many, "#ffffff");
    expect(next).toHaveLength(FAVORITE_LIMIT);
    expect(next[0]).toBe("#ffffff");
    expect(next).not.toContain(many[FAVORITE_LIMIT - 1]);
  });

  it("removes a colour", () => {
    expect(removeFavorite(["#111111", "#222222"], "#111111")).toEqual([
      "#222222",
    ]);
  });

  it("does not trust stored data", () => {
    expect(sanitizeFavorites("nope")).toEqual([]);
    expect(
      sanitizeFavorites(["#FF0000", 3, "javascript:x", "#ff0000"]),
    ).toEqual(["#ff0000"]);
  });
});
