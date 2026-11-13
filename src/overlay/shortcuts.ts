import {
  BOARDS,
  PALETTE_SIZE,
  WIDTH_MAX,
  WIDTH_MIN,
  type Board,
  type Tool,
} from "../bridge/types";

// Pure mapping from key presses to overlay actions (CONTRACT.md, Keyboard).

export type OverlayAction =
  | { type: "tool"; tool: Tool }
  | { type: "color"; index: number }
  | { type: "setColor"; color: string }
  | { type: "width"; direction: -1 | 1 }
  | { type: "toggleFade" }
  | { type: "toggleSpotlight" }
  | { type: "cycleBoard" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" }
  | { type: "deleteSelection" }
  | { type: "exit" };

export interface KeyInput {
  readonly key: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

export const TOOL_KEYS: Readonly<Record<string, Tool>> = {
  p: "pen",
  h: "highlighter",
  l: "line",
  a: "arrow",
  r: "rect",
  o: "ellipse",
  t: "text",
  e: "eraser",
};

/** Shortcut letter shown next to each tool. */
export const TOOL_SHORTCUT: Readonly<Record<Tool, string>> = {
  pen: "P",
  highlighter: "H",
  line: "L",
  arrow: "A",
  rect: "R",
  ellipse: "O",
  text: "T",
  eraser: "E",
};

/** Comfortable width stops for `[` / `]` and the toolbar buttons. */
export const WIDTH_STEPS: readonly number[] = [
  1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 40,
];

export function stepWidth(width: number, direction: -1 | 1): number {
  const next =
    direction > 0
      ? WIDTH_STEPS.find((step) => step > width)
      : [...WIDTH_STEPS].reverse().find((step) => step < width);
  const fallback = direction > 0 ? WIDTH_MAX : WIDTH_MIN;
  return next ?? fallback;
}

export function nextBoard(board: Board): Board {
  const index = BOARDS.indexOf(board);
  return BOARDS[(index + 1) % BOARDS.length];
}

/** Letter from the key when it is ASCII, otherwise from the physical key (IME, other scripts). */
function letterOf(input: KeyInput): string | null {
  if (/^[a-z]$/i.test(input.key)) return input.key.toLowerCase();
  const match = /^Key([A-Z])$/.exec(input.code);
  return match ? match[1].toLowerCase() : null;
}

function digitOf(input: KeyInput): number | null {
  const match = /^Digit([0-9])$/.exec(input.code);
  if (match) return Number(match[1]);
  return /^[0-9]$/.test(input.key) ? Number(input.key) : null;
}

function commandAction(input: KeyInput): OverlayAction | null {
  if (letterOf(input) !== "z" || input.altKey) return null;
  return input.shiftKey ? { type: "redo" } : { type: "undo" };
}

function plainAction(input: KeyInput): OverlayAction | null {
  switch (input.key) {
    case "Escape":
      return { type: "exit" };
    case "Delete":
    case "Backspace":
      return { type: "clear" };
    case "[":
      return { type: "width", direction: -1 };
    case "]":
      return { type: "width", direction: 1 };
  }
  if (input.code === "BracketLeft") return { type: "width", direction: -1 };
  if (input.code === "BracketRight") return { type: "width", direction: 1 };
  const digit = digitOf(input);
  if (digit !== null && digit >= 1 && digit <= PALETTE_SIZE)
    return { type: "color", index: digit - 1 };
  const letter = letterOf(input);
  if (letter === null) return null;
  if (letter in TOOL_KEYS) return { type: "tool", tool: TOOL_KEYS[letter] };
  if (letter === "f") return { type: "toggleFade" };
  if (letter === "s") return { type: "toggleSpotlight" };
  if (letter === "b") return { type: "cycleBoard" };
  if (letter === "d") return { type: "deleteSelection" };
  return null;
}

export function actionForKey(input: KeyInput): OverlayAction | null {
  if (input.metaKey || input.ctrlKey) return commandAction(input);
  if (input.altKey) return null;
  return plainAction(input);
}
