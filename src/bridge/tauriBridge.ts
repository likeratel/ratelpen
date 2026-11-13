import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { z } from "zod";
import {
  BridgeError,
  INVALID_RESPONSE_CODE,
  UNKNOWN_ERROR_CODE,
  type Bridge,
  type Listener,
  type Unlisten,
} from "./bridge";
import {
  bootstrapSchema,
  captureResultSchema,
  cursorSchema,
  ipcErrorSchema,
  overlayCommandSchema,
  sessionPatchSchema,
  sessionSchema,
  settingsSchema,
} from "./types";

/** Turns whatever a rejected `invoke` produced into a BridgeError. */
export function toBridgeError(raw: unknown): BridgeError {
  if (raw instanceof BridgeError) return raw;
  const parsed = ipcErrorSchema.safeParse(raw);
  if (parsed.success)
    return new BridgeError(parsed.data.code, parsed.data.message);
  if (raw instanceof Error)
    return new BridgeError(UNKNOWN_ERROR_CODE, raw.message);
  return new BridgeError(UNKNOWN_ERROR_CODE, String(raw));
}

/** Validates a payload from the core; a mismatch is a contract violation. */
export function parsePayload<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new BridgeError(
    INVALID_RESPONSE_CODE,
    `Unexpected payload for ${label}: ${z.prettifyError(parsed.error)}`,
  );
}

async function call<T>(
  command: string,
  schema: z.ZodType<T>,
  args?: Record<string, unknown>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await invoke<unknown>(command, args);
  } catch (error) {
    throw toBridgeError(error);
  }
  return parsePayload(schema, raw, command);
}

// Window-scoped listeners: they receive broadcasts and events targeted at
// this window, but not events targeted at another overlay (e.g. `cursor`).
async function subscribe<T>(
  event: string,
  schema: z.ZodType<T>,
  listener: Listener<T>,
): Promise<Unlisten> {
  return getCurrentWebviewWindow().listen<unknown>(event, ({ payload }) => {
    const parsed = schema.safeParse(payload);
    if (parsed.success) {
      listener(parsed.data);
      return;
    }
    console.error(
      `Ignored invalid "${event}" event`,
      z.prettifyError(parsed.error),
    );
  });
}

const nothing = z
  .null()
  .or(z.undefined())
  .transform(() => undefined);

export function createTauriBridge(): Bridge {
  return {
    getBootstrap: () => call("get_bootstrap", bootstrapSchema),
    updateSession: (patch) =>
      call("update_session", sessionSchema, {
        patch: sessionPatchSchema.parse(patch),
      }),
    saveSettings: (settings) =>
      call("save_settings", settingsSchema, {
        settings: settingsSchema.parse(settings),
      }),
    reportContent: (hasContent) =>
      call("report_content", nothing, { hasContent }),
    captureScreen: (destination) =>
      call("capture_screen", captureResultSchema, { destination }),
    openSettings: () => call("open_settings", nothing),
    quitApp: () => call("quit_app", nothing),
    onSessionChanged: (listener) =>
      subscribe("session-changed", sessionSchema, listener),
    onSettingsChanged: (listener) =>
      subscribe("settings-changed", settingsSchema, listener),
    onOverlayCommand: (listener) =>
      subscribe("overlay-command", overlayCommandSchema, listener),
    onCursor: (listener) => subscribe("cursor", cursorSchema, listener),
  };
}
