import { describe, expect, it } from "vitest";
import { createFakeBridge, FAKE_UNAVAILABLE_SHORTCUTS } from "./fakeBridge";
import { DEFAULT_SETTINGS, type Session } from "./types";

describe("fake bridge", () => {
  it("starts in draw mode and emits session changes", async () => {
    const bridge = createFakeBridge();
    const seen: Session[] = [];
    await bridge.onSessionChanged((session) => seen.push(session));
    expect((await bridge.getBootstrap()).session.active).toBe(true);
    await bridge.updateSession({ board: "white" });
    const off = await bridge.updateSession({ active: false });
    expect(off.board).toBe("none");
    expect(seen.map((session) => session.board)).toEqual(["white", "none"]);
  });

  it("rejects invalid patches like the core", async () => {
    const bridge = createFakeBridge();
    await expect(bridge.updateSession({ width: 99 })).rejects.toMatchObject({
      code: "invalid_argument",
    });
  });

  it("rejects an unavailable shortcut and keeps the previous settings", async () => {
    const bridge = createFakeBridge();
    const shortcuts = {
      ...DEFAULT_SETTINGS.shortcuts,
      toggleDraw: FAKE_UNAVAILABLE_SHORTCUTS[0],
    };
    await expect(
      bridge.saveSettings({ ...DEFAULT_SETTINGS, shortcuts }),
    ).rejects.toMatchObject({
      code: "shortcut_unavailable",
    });
    expect(bridge.controls.snapshot().settings).toEqual(DEFAULT_SETTINGS);
  });

  it("captures without a path", async () => {
    await expect(createFakeBridge().captureScreen("file")).resolves.toEqual({
      path: null,
    });
  });
});
