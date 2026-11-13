import { describe, expect, it } from "vitest";
import {
  BridgeError,
  INVALID_RESPONSE_CODE,
  UNKNOWN_ERROR_CODE,
} from "./bridge";
import { parsePayload, toBridgeError } from "./tauriBridge";
import {
  DEFAULT_SETTINGS,
  bootstrapSchema,
  cursorSchema,
  overlayCommandSchema,
  sessionFromSettings,
  sessionPatchSchema,
  sessionSchema,
  settingsSchema,
} from "./types";

const session = sessionFromSettings(DEFAULT_SETTINGS, true);

describe("bridge schemas", () => {
  it("accepts the contract defaults", () => {
    expect(settingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(sessionSchema.parse(session)).toEqual(session);
    expect(
      bootstrapSchema.parse({
        settings: DEFAULT_SETTINGS,
        session,
        platform: "windows",
        unavailableShortcuts: ["clearAll"],
      }).platform,
    ).toBe("windows");
  });

  it.each([
    ["an unknown tool", { ...session, tool: "spray" }],
    ["a width out of range", { ...session, width: 41 }],
    ["a fractional width", { ...session, width: 2.5 }],
    ["a short colour", { ...session, color: "#fff" }],
    ["an unknown board", { ...session, board: "green" }],
    ["a missing field", { ...session, active: undefined }],
  ])("rejects a session with %s", (_, payload) => {
    expect(sessionSchema.safeParse(payload).success).toBe(false);
  });

  it.each([
    [
      "a palette with seven colours",
      { ...DEFAULT_SETTINGS, palette: DEFAULT_SETTINGS.palette.slice(1) },
    ],
    ["fade seconds out of range", { ...DEFAULT_SETTINGS, fadeSeconds: 0 }],
    [
      "a spotlight radius out of range",
      { ...DEFAULT_SETTINGS, spotlightRadius: 301 },
    ],
    ["an unknown version", { ...DEFAULT_SETTINGS, version: 2 }],
    [
      "an unknown spotlight style",
      { ...DEFAULT_SETTINGS, spotlightStyle: "laser" },
    ],
    [
      "a non-string shortcut",
      {
        ...DEFAULT_SETTINGS,
        shortcuts: { ...DEFAULT_SETTINGS.shortcuts, clearAll: 1 },
      },
    ],
  ])("rejects settings with %s", (_, payload) => {
    expect(settingsSchema.safeParse(payload).success).toBe(false);
  });

  it("validates partial session patches field by field", () => {
    expect(sessionPatchSchema.parse({ tool: "arrow" })).toEqual({
      tool: "arrow",
    });
    expect(sessionPatchSchema.safeParse({ width: 0 }).success).toBe(false);
  });

  it("validates event payloads", () => {
    expect(cursorSchema.parse(null)).toBeNull();
    expect(cursorSchema.safeParse({ x: "1", y: 2 }).success).toBe(false);
    expect(overlayCommandSchema.safeParse({ type: "explode" }).success).toBe(
      false,
    );
  });

  it("rejects a bootstrap from an unknown platform", () => {
    const payload = { settings: DEFAULT_SETTINGS, session, platform: "beos" };
    expect(bootstrapSchema.safeParse(payload).success).toBe(false);
  });
});

describe("bridge errors", () => {
  it("keeps the code and message of an IpcError", () => {
    const error = toBridgeError({
      code: "shortcut_unavailable",
      message: "Taken",
    });
    expect(error).toBeInstanceOf(BridgeError);
    expect(error.code).toBe("shortcut_unavailable");
    expect(error.message).toBe("Taken");
  });

  it("wraps anything else as an unknown error", () => {
    expect(toBridgeError("boom")).toMatchObject({
      code: UNKNOWN_ERROR_CODE,
      message: "boom",
    });
    expect(toBridgeError(new Error("bad"))).toMatchObject({
      code: UNKNOWN_ERROR_CODE,
      message: "bad",
    });
  });

  it("turns an invalid response into an invalid_response error", () => {
    expect(() =>
      parsePayload(sessionSchema, { tool: "pen" }, "update_session"),
    ).toThrow(BridgeError);
    try {
      parsePayload(sessionSchema, {}, "update_session");
    } catch (error) {
      expect(error).toMatchObject({ code: INVALID_RESPONSE_CODE });
    }
  });
});
