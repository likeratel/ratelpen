import {
  BridgeError,
  type Bridge,
  type Listener,
  type Unlisten,
} from "./bridge";
import {
  DEFAULT_SETTINGS,
  sessionFromSettings,
  sessionPatchSchema,
  settingsSchema,
  type Bootstrap,
  type CursorPosition,
  type OverlayCommand,
  type Session,
  type SessionPatch,
  type Settings,
} from "./types";

// In-memory stand-in for the core, used in a plain browser and in Playwright.
// It keeps session and settings state, validates input like the core does and
// emits the same events.

/** Shortcuts the fake core pretends another app already owns. */
export const FAKE_UNAVAILABLE_SHORTCUTS: readonly string[] = ["CmdOrCtrl+Q"];

type Channel<T> = Set<Listener<T>>;

export interface FakeBridgeControls {
  emitCursor(position: CursorPosition): void;
  emitOverlayCommand(command: OverlayCommand): void;
  setSession(patch: SessionPatch): void;
  snapshot(): { session: Session; settings: Settings; hasContent: boolean };
}

export interface FakeBridge extends Bridge {
  controls: FakeBridgeControls;
}

function emit<T>(channel: Channel<T>, payload: T): void {
  channel.forEach((listener) => listener(payload));
}

function listenTo<T>(channel: Channel<T>, listener: Listener<T>): Unlisten {
  channel.add(listener);
  return () => {
    channel.delete(listener);
  };
}

function invalid(message: string): BridgeError {
  return new BridgeError("invalid_argument", message);
}

function applyPatch(session: Session, patch: SessionPatch): Session {
  const next = { ...session, ...patch };
  return next.active ? next : { ...next, board: "none" };
}

export function createFakeBridge(
  platform: Bootstrap["platform"] = "macos",
): FakeBridge {
  let settings: Settings = DEFAULT_SETTINGS;
  let session: Session = sessionFromSettings(settings, true);
  let hasContent = false;
  const sessionChannel: Channel<Session> = new Set();
  const settingsChannel: Channel<Settings> = new Set();
  const commandChannel: Channel<OverlayCommand> = new Set();
  const cursorChannel: Channel<CursorPosition> = new Set();

  const setSession = (patch: SessionPatch): Session => {
    session = applyPatch(session, patch);
    emit(sessionChannel, session);
    if (!session.spotlight) emit(cursorChannel, null);
    return session;
  };

  const controls: FakeBridgeControls = {
    emitCursor: (position) => emit(cursorChannel, position),
    emitOverlayCommand: (command) => emit(commandChannel, command),
    setSession: (patch) => {
      setSession(patch);
    },
    snapshot: () => ({ session, settings, hasContent }),
  };

  return {
    controls,
    getBootstrap: async () => ({
      settings,
      session,
      platform,
      unavailableShortcuts: [],
    }),
    updateSession: async (patch) => {
      const parsed = sessionPatchSchema.safeParse(patch);
      if (!parsed.success) throw invalid("Invalid session patch");
      return setSession(parsed.data);
    },
    saveSettings: async (next) => {
      const parsed = settingsSchema.safeParse(next);
      if (!parsed.success) throw invalid("Invalid settings");
      const taken = Object.values(parsed.data.shortcuts).find((shortcut) =>
        FAKE_UNAVAILABLE_SHORTCUTS.includes(shortcut),
      );
      if (taken)
        throw new BridgeError(
          "shortcut_unavailable",
          `The shortcut ${taken} is already used by another app.`,
        );
      settings = parsed.data;
      emit(settingsChannel, settings);
      return settings;
    },
    reportContent: async (value) => {
      hasContent = value;
    },
    captureScreen: async () => ({ path: null }),
    openSettings: async () => {
      setSession({ active: false });
    },
    quitApp: async () => {
      setSession({ active: false, spotlight: false });
    },
    onSessionChanged: async (listener) => listenTo(sessionChannel, listener),
    onSettingsChanged: async (listener) => listenTo(settingsChannel, listener),
    onOverlayCommand: async (listener) => listenTo(commandChannel, listener),
    onCursor: async (listener) => {
      const unlisten = listenTo(cursorChannel, listener);
      // Stand-in for the core's cursor tracking: follow this window's pointer.
      const followPointer = (event: PointerEvent) => {
        if (session.spotlight) listener({ x: event.clientX, y: event.clientY });
      };
      window.addEventListener("pointermove", followPointer);
      return () => {
        unlisten();
        window.removeEventListener("pointermove", followPointer);
      };
    },
  };
}
