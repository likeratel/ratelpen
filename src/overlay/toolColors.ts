import { TOOLS, type Tool } from "../bridge/types";
import { parseColorInput } from "../drawing/color";

// The colour last used with each tool (red pen, black text, …), kept on this
// machine in the web view's storage so it survives relaunches.

export type ToolColors = Readonly<Partial<Record<Tool, string>>>;

const STORAGE_KEY = "ratelpen.toolColors";

/** The eraser paints nothing, so it never owns a colour. */
function hasColor(tool: Tool): boolean {
  return tool !== "eraser";
}

/** Keeps only known tools with valid colours; stored data is not trusted. */
export function sanitizeToolColors(value: unknown): ToolColors {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  return TOOLS.reduce<ToolColors>((colors, tool) => {
    const stored = record[tool];
    const color = typeof stored === "string" ? parseColorInput(stored) : null;
    return color && hasColor(tool) ? { ...colors, [tool]: color } : colors;
  }, {});
}

export function rememberColor(
  colors: ToolColors,
  tool: Tool,
  color: string,
): ToolColors {
  return hasColor(tool) ? { ...colors, [tool]: color } : colors;
}

/**
 * Leaving `from` for `to`: the colour in use is remembered for `from`, and
 * `to` gets back the colour it last had (or keeps the current one).
 */
export function switchTool(
  colors: ToolColors,
  from: Tool,
  to: Tool,
  current: string,
): { readonly colors: ToolColors; readonly color: string } {
  const remembered = rememberColor(colors, from, current);
  return { colors: remembered, color: remembered[to] ?? current };
}

export function loadToolColors(): ToolColors {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return sanitizeToolColors(JSON.parse(stored ?? "{}"));
  } catch {
    return {};
  }
}

/** Storage can be unavailable; colours then last only for this session. */
export function saveToolColors(colors: ToolColors): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch {
    // Nothing to do: the session keeps the colour that is in use.
  }
}
