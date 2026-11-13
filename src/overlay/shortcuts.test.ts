import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, sessionFromSettings } from "../bridge/types";
import { sessionPatchFor } from "./sessionPatch";
import { actionForKey, nextBoard, stepWidth, type KeyInput } from "./shortcuts";

function key(k: string, code: string, mods: Partial<KeyInput> = {}): KeyInput {
  return {
    key: k,
    code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  };
}

describe("draw-mode keys", () => {
  it("D deletes the selection, also through an IME", () => {
    expect(actionForKey(key("d", "KeyD"))).toEqual({ type: "deleteSelection" });
    expect(actionForKey(key("ㅇ", "KeyD"))).toEqual({
      type: "deleteSelection",
    });
  });

  it("maps tool letters, also through an IME or another layout", () => {
    expect(actionForKey(key("r", "KeyR"))).toEqual({
      type: "tool",
      tool: "rect",
    });
    expect(actionForKey(key("ㅔ", "KeyP"))).toEqual({
      type: "tool",
      tool: "pen",
    });
  });

  it("maps palette digits and width brackets", () => {
    expect(actionForKey(key("3", "Digit3"))).toEqual({
      type: "color",
      index: 2,
    });
    expect(actionForKey(key("9", "Digit9"))).toBeNull();
    expect(actionForKey(key("]", "BracketRight"))).toEqual({
      type: "width",
      direction: 1,
    });
  });

  it("maps undo and redo with Cmd or Ctrl", () => {
    expect(actionForKey(key("z", "KeyZ", { metaKey: true }))).toEqual({
      type: "undo",
    });
    expect(
      actionForKey(key("Z", "KeyZ", { ctrlKey: true, shiftKey: true })),
    ).toEqual({ type: "redo" });
  });

  it("ignores other modified keys", () => {
    expect(actionForKey(key("p", "KeyP", { metaKey: true }))).toBeNull();
    expect(actionForKey(key("π", "KeyP", { altKey: true }))).toBeNull();
  });

  it("maps clear and exit", () => {
    expect(actionForKey(key("Backspace", "Backspace"))).toEqual({
      type: "clear",
    });
    expect(actionForKey(key("Escape", "Escape"))).toEqual({ type: "exit" });
  });
});

describe("session helpers", () => {
  it("steps widths through comfortable stops within range", () => {
    expect(stepWidth(4, 1)).toBe(6);
    expect(stepWidth(5, -1)).toBe(4);
    expect(stepWidth(1, -1)).toBe(1);
    expect(stepWidth(40, 1)).toBe(40);
  });

  it("cycles the board", () => {
    expect(nextBoard("none")).toBe("white");
    expect(nextBoard("white")).toBe("black");
    expect(nextBoard("black")).toBe("none");
  });

  it("turns actions into session patches", () => {
    const session = sessionFromSettings(DEFAULT_SETTINGS, true);
    expect(
      sessionPatchFor({ type: "color", index: 4 }, session, DEFAULT_SETTINGS),
    ).toEqual({
      color: DEFAULT_SETTINGS.palette[4],
    });
    expect(
      sessionPatchFor({ type: "toggleFade" }, session, DEFAULT_SETTINGS),
    ).toEqual({ fadeEnabled: true });
    expect(
      sessionPatchFor({ type: "exit" }, session, DEFAULT_SETTINGS),
    ).toEqual({ active: false });
    expect(
      sessionPatchFor({ type: "undo" }, session, DEFAULT_SETTINGS),
    ).toBeNull();
  });
});
