import type {
  Bootstrap,
  CaptureDestination,
  CaptureResult,
  CursorPosition,
  OverlayCommand,
  Session,
  SessionPatch,
  Settings,
} from "./types";

export type Unlisten = () => void;
export type Listener<T> = (payload: T) => void;

/** Everything the web UI may ask of the core. See CONTRACT.md. */
export interface Bridge {
  getBootstrap(): Promise<Bootstrap>;
  updateSession(patch: SessionPatch): Promise<Session>;
  saveSettings(settings: Settings): Promise<Settings>;
  reportContent(hasContent: boolean): Promise<void>;
  captureScreen(destination: CaptureDestination): Promise<CaptureResult>;
  openSettings(): Promise<void>;
  quitApp(): Promise<void>;
  onSessionChanged(listener: Listener<Session>): Promise<Unlisten>;
  onSettingsChanged(listener: Listener<Settings>): Promise<Unlisten>;
  onOverlayCommand(listener: Listener<OverlayCommand>): Promise<Unlisten>;
  onCursor(listener: Listener<CursorPosition>): Promise<Unlisten>;
}

/** Rejected value of every bridge call, mirroring the contract's IpcError. */
export class BridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
  }
}

export const UNKNOWN_ERROR_CODE = "unknown";
export const INVALID_RESPONSE_CODE = "invalid_response";

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function errorCode(error: unknown): string {
  return error instanceof BridgeError ? error.code : UNKNOWN_ERROR_CODE;
}
