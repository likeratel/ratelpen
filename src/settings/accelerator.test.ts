import { describe, expect, it } from "vitest";
import {
  acceleratorFromEvent,
  keyNameForCode,
  type AcceleratorInput,
} from "./accelerator";

function press(
  code: string,
  mods: Partial<AcceleratorInput> = {},
  key = "x",
): AcceleratorInput {
  return {
    key,
    code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  };
}

describe("accelerator strings", () => {
  it("uses the physical key even when Option changes the character", () => {
    expect(
      acceleratorFromEvent(
        press("KeyD", { altKey: true, shiftKey: true }, "Î"),
        "macos",
      ),
    ).toEqual({
      kind: "ok",
      accelerator: "Alt+Shift+D",
    });
  });

  it("maps Command on macOS and Control elsewhere to CmdOrCtrl", () => {
    expect(
      acceleratorFromEvent(
        press("KeyK", { metaKey: true, shiftKey: true }),
        "macos",
      ),
    ).toEqual({
      kind: "ok",
      accelerator: "CmdOrCtrl+Shift+K",
    });
    expect(
      acceleratorFromEvent(
        press("KeyK", { ctrlKey: true, shiftKey: true }),
        "windows",
      ),
    ).toEqual({
      kind: "ok",
      accelerator: "CmdOrCtrl+Shift+K",
    });
  });

  it("keeps Control distinct from Command on macOS and maps the Windows key to Super", () => {
    expect(
      acceleratorFromEvent(
        press("Digit1", { ctrlKey: true, metaKey: true }),
        "macos",
      ),
    ).toEqual({
      kind: "ok",
      accelerator: "CmdOrCtrl+Ctrl+1",
    });
    expect(
      acceleratorFromEvent(press("F5", { metaKey: true }), "windows"),
    ).toEqual({
      kind: "ok",
      accelerator: "Super+F5",
    });
  });

  it("rejects combinations without a primary modifier", () => {
    expect(acceleratorFromEvent(press("KeyA"), "macos").kind).toBe(
      "needsModifier",
    );
    expect(
      acceleratorFromEvent(press("KeyA", { shiftKey: true }), "macos").kind,
    ).toBe("needsModifier");
  });

  it("waits while only modifiers are held", () => {
    expect(
      acceleratorFromEvent(press("AltLeft", { altKey: true }, "Alt"), "macos")
        .kind,
    ).toBe("pending");
  });

  it("rejects keys it cannot name", () => {
    expect(
      acceleratorFromEvent(press("IntlYen", { altKey: true }), "macos").kind,
    ).toBe("unsupported");
  });

  it("names arrows, punctuation and function keys", () => {
    expect(keyNameForCode("ArrowUp")).toBe("Up");
    expect(keyNameForCode("Slash")).toBe("Slash");
    expect(keyNameForCode("F12")).toBe("F12");
    expect(keyNameForCode("F25")).toBeNull();
  });
});
