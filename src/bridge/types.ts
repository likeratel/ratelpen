import { z } from "zod";

// Zod schemas for every payload in CONTRACT.md. Anything that crosses the
// bridge is parsed with these before the UI uses it.

export const TOOLS = [
  "pen",
  "highlighter",
  "line",
  "arrow",
  "rect",
  "ellipse",
  "text",
  "eraser",
] as const;
export const BOARDS = ["none", "white", "black"] as const;
export const SPOTLIGHT_STYLES = ["halo", "focus"] as const;
export const PLATFORMS = ["macos", "windows", "linux"] as const;
export const CAPTURE_DESTINATIONS = ["file", "clipboard"] as const;

export const WIDTH_MIN = 1;
export const WIDTH_MAX = 40;
export const FADE_SECONDS_MIN = 1;
export const FADE_SECONDS_MAX = 60;
export const SPOTLIGHT_RADIUS_MIN = 20;
export const SPOTLIGHT_RADIUS_MAX = 300;
export const PALETTE_SIZE = 8;

export const toolSchema = z.enum(TOOLS);
export const boardSchema = z.enum(BOARDS);
export const spotlightStyleSchema = z.enum(SPOTLIGHT_STYLES);
export const platformSchema = z.enum(PLATFORMS);
export const captureDestinationSchema = z.enum(CAPTURE_DESTINATIONS);

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb colour");

export const widthSchema = z.number().int().min(WIDTH_MIN).max(WIDTH_MAX);

export const sessionSchema = z.object({
  active: z.boolean(),
  tool: toolSchema,
  color: hexColorSchema,
  width: widthSchema,
  fadeEnabled: z.boolean(),
  spotlight: z.boolean(),
  board: boardSchema,
});

export const sessionPatchSchema = sessionSchema.partial();

export const shortcutsSchema = z.object({
  toggleDraw: z.string(),
  clearAll: z.string(),
  toggleSpotlight: z.string(),
});

export const settingsSchema = z.object({
  version: z.literal(1),
  shortcuts: shortcutsSchema,
  palette: z.array(hexColorSchema).length(PALETTE_SIZE),
  defaultColor: hexColorSchema,
  defaultWidth: widthSchema,
  fadeSeconds: z.number().int().min(FADE_SECONDS_MIN).max(FADE_SECONDS_MAX),
  fadeByDefault: z.boolean(),
  spotlightStyle: spotlightStyleSchema,
  spotlightRadius: z
    .number()
    .int()
    .min(SPOTLIGHT_RADIUS_MIN)
    .max(SPOTLIGHT_RADIUS_MAX),
  clearOnExit: z.boolean(),
  launchAtLogin: z.boolean(),
  lockWhileDrawing: z.boolean(),
});

export const bootstrapSchema = z.object({
  settings: settingsSchema,
  session: sessionSchema,
  platform: platformSchema,
  unavailableShortcuts: z.array(shortcutsSchema.keyof()),
});

export const ipcErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const captureResultSchema = z.object({
  path: z.string().nullable(),
});

export const overlayCommandSchema = z.object({
  type: z.enum(["clear", "lock-permission", "lock-failed"]),
});

export const cursorSchema = z
  .object({ x: z.number(), y: z.number() })
  .nullable();

export type Tool = z.infer<typeof toolSchema>;
export type Board = z.infer<typeof boardSchema>;
export type SpotlightStyle = z.infer<typeof spotlightStyleSchema>;
export type Platform = z.infer<typeof platformSchema>;
export type CaptureDestination = z.infer<typeof captureDestinationSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SessionPatch = z.infer<typeof sessionPatchSchema>;
export type Shortcuts = z.infer<typeof shortcutsSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export type IpcError = z.infer<typeof ipcErrorSchema>;
export type CaptureResult = z.infer<typeof captureResultSchema>;
export type OverlayCommand = z.infer<typeof overlayCommandSchema>;
export type CursorPosition = z.infer<typeof cursorSchema>;

export const DEFAULT_PALETTE: readonly string[] = [
  "#ff3b30",
  "#ff9500",
  "#ffd60a",
  "#34c759",
  "#0a84ff",
  "#bf5af2",
  "#ffffff",
  "#1c1c1e",
];

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  shortcuts: {
    toggleDraw: "Alt+Tab",
    clearAll: "Alt+Shift+C",
    toggleSpotlight: "Alt+Shift+S",
  },
  palette: [...DEFAULT_PALETTE],
  defaultColor: "#ff3b30",
  defaultWidth: 4,
  fadeSeconds: 5,
  fadeByDefault: false,
  spotlightStyle: "focus",
  spotlightRadius: 60,
  clearOnExit: true,
  launchAtLogin: false,
  lockWhileDrawing: true,
};

export function sessionFromSettings(
  settings: Settings,
  active: boolean,
): Session {
  return {
    active,
    tool: "pen",
    color: settings.defaultColor,
    width: settings.defaultWidth,
    fadeEnabled: settings.fadeByDefault,
    spotlight: false,
    board: "none",
  };
}
