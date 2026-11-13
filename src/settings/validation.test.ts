import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../bridge/types";
import { parseNumberInput, validateSettingsForm } from "./validation";

describe("settings form validation", () => {
  it("accepts the defaults", () => {
    expect(validateSettingsForm(DEFAULT_SETTINGS)).toEqual({
      ok: true,
      settings: DEFAULT_SETTINGS,
    });
  });

  it("allows disabled shortcuts", () => {
    const draft = {
      ...DEFAULT_SETTINGS,
      shortcuts: { toggleDraw: "", clearAll: "", toggleSpotlight: "" },
    };
    expect(validateSettingsForm(draft).ok).toBe(true);
  });

  it("rejects duplicate shortcuts", () => {
    const shortcuts = {
      ...DEFAULT_SETTINGS.shortcuts,
      clearAll: DEFAULT_SETTINGS.shortcuts.toggleDraw,
    };
    const result = validateSettingsForm({ ...DEFAULT_SETTINGS, shortcuts });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.shortcuts).toBeTruthy();
  });

  it("reports out-of-range and empty numbers per field", () => {
    const result = validateSettingsForm({
      ...DEFAULT_SETTINGS,
      defaultWidth: 0,
      fadeSeconds: parseNumberInput(""),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual([
      "defaultWidth",
      "fadeSeconds",
    ]);
  });
});
