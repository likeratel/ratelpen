import type { Platform } from "../bridge";

// Converts a key press into a Tauri accelerator string such as
// "Alt+Shift+D" or "CmdOrCtrl+Shift+K". Uses `event.code` so the result does
// not depend on the keyboard layout or on Option producing special characters.

export interface AcceleratorInput {
  readonly key: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

export type AcceleratorResult =
  | { readonly kind: "ok"; readonly accelerator: string }
  /** Only modifiers are down so far; keep listening. */
  | { readonly kind: "pending" }
  /** A global shortcut needs Cmd/Ctrl, Alt or Super, not just Shift. */
  | { readonly kind: "needsModifier" }
  | { readonly kind: "unsupported" };

const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  "Meta",
  "Control",
  "Alt",
  "AltGraph",
  "Shift",
  "OS",
  "Super",
  "Hyper",
  "Fn",
  "CapsLock",
]);

const NAMED_CODES: Readonly<Record<string, string>> = {
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Escape: "Escape",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Minus: "Minus",
  Equal: "Equal",
  BracketLeft: "BracketLeft",
  BracketRight: "BracketRight",
  Backslash: "Backslash",
  Semicolon: "Semicolon",
  Quote: "Quote",
  Backquote: "Backquote",
  Comma: "Comma",
  Period: "Period",
  Slash: "Slash",
};

const MAX_FUNCTION_KEY = 24;

/** Accelerator key name for a physical key code, or null if unsupported. */
export function keyNameForCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  const fn = /^F([0-9]{1,2})$/.exec(code);
  if (fn && Number(fn[1]) >= 1 && Number(fn[1]) <= MAX_FUNCTION_KEY)
    return `F${fn[1]}`;
  return NAMED_CODES[code] ?? null;
}

function modifierNames(input: AcceleratorInput, platform: Platform): string[] {
  const isMac = platform === "macos";
  const command = isMac ? input.metaKey : input.ctrlKey;
  const extraCtrl = isMac && input.ctrlKey;
  const superKey = !isMac && input.metaKey;
  return [
    command ? "CmdOrCtrl" : null,
    extraCtrl ? "Ctrl" : null,
    superKey ? "Super" : null,
    input.altKey ? "Alt" : null,
    input.shiftKey ? "Shift" : null,
  ].filter((name): name is string => name !== null);
}

export function acceleratorFromEvent(
  input: AcceleratorInput,
  platform: Platform,
): AcceleratorResult {
  if (MODIFIER_KEYS.has(input.key)) return { kind: "pending" };
  const key = keyNameForCode(input.code);
  if (key === null) return { kind: "unsupported" };
  const modifiers = modifierNames(input, platform);
  const hasPrimary = modifiers.some((name) => name !== "Shift");
  if (!hasPrimary) return { kind: "needsModifier" };
  return { kind: "ok", accelerator: [...modifiers, key].join("+") };
}
