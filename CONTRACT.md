# ratelpen IPC contract

The Rust core (`src-tauri`) owns windows, global shortcuts, the tray, settings persistence, cursor
tracking and screen capture. The web UI (`src`) owns drawing, the toolbar and the settings form.
They talk only through the commands and events below. All payloads are JSON with camelCase keys.

## Windows

| Label | URL | Purpose |
| --- | --- | --- |
| `overlay-<n>` | `index.html?view=overlay` | One per monitor. Transparent, borderless, always on top, covers the whole monitor. Created the first time draw mode or the spotlight is turned on. |
| `settings` | `index.html?view=settings` | Normal window, created on demand. |

Launching the app a second time opens the settings window of the running instance. So does a
stored shortcut that cannot be registered at launch. Closing the last window never quits the app.
Each overlay keeps its own drawing. Session state (tool, colour, …) is shared by all overlays.

## Types

```ts
type Tool = "pen" | "highlighter" | "line" | "arrow" | "rect" | "ellipse" | "text" | "eraser";
type Board = "none" | "white" | "black";
type SpotlightStyle = "halo" | "focus";

interface Session {            // not persisted; reset on launch from Settings defaults
  active: boolean;             // draw mode: overlays take input. false = click-through
  tool: Tool;
  color: string;               // "#rrggbb"
  width: number;               // 1..=40, logical px
  fadeEnabled: boolean;        // new ink disappears after settings.fadeSeconds
  spotlight: boolean;
  board: Board;                // forced to "none" whenever active becomes false
}

interface Settings {           // persisted as settings.json in the app config dir
  version: 1;
  shortcuts: {                 // Tauri accelerator strings; "" disables the shortcut
    toggleDraw: string;        // default "Alt+Tab" on macOS, "Alt+Shift+D" elsewhere
    clearAll: string;          // default "Alt+Shift+C"
    toggleSpotlight: string;   // default "Alt+Shift+S"
  };
  palette: string[];           // exactly 8 "#rrggbb" colours
  defaultColor: string;        // "#rrggbb"
  defaultWidth: number;        // 1..=40
  fadeSeconds: number;         // 1..=60
  fadeByDefault: boolean;
  spotlightStyle: SpotlightStyle;
  spotlightRadius: number;     // 20..=300, logical px
  clearOnExit: boolean;        // default true: clear every overlay when draw mode is turned off
  launchAtLogin: boolean;
}

interface Bootstrap {
  settings: Settings;
  session: Session;
  platform: "macos" | "windows" | "linux";
  // Stored shortcuts the system refused to register (taken by another app).
  unavailableShortcuts: ("toggleDraw" | "clearAll" | "toggleSpotlight")[];
}

interface IpcError { code: string; message: string; }   // rejected value of every command
```

`width`, `defaultWidth`, `fadeSeconds` and `spotlightRadius` are integers. Unknown fields in a session
patch or in `Settings` are rejected.

Error codes: `invalid_session`, `invalid_settings` (also malformed or duplicate shortcuts),
`invalid_argument`, `shortcut_unavailable`, `settings_save_failed`, `autostart_failed`,
`capture_permission`, `capture_failed`, `window_failed`.

Default palette: `#ff3b30 #ff9500 #ffd60a #34c759 #0a84ff #bf5af2 #ffffff #1c1c1e`.
Default colour `#ff3b30`, width `4`, fade `5`s off, spotlight style `halo`, radius `60`.

## Commands (UI → core)

| Command | Arguments | Returns | Notes |
| --- | --- | --- | --- |
| `get_bootstrap` | – | `Bootstrap` | |
| `update_session` | `{ patch: Partial<Session> }` | `Session` | Validates every field, applies side effects (click-through, focus, cursor tracking), emits `session-changed`. |
| `save_settings` | `{ settings: Settings }` | `Settings` | Validates, re-registers global shortcuts, applies launch at login, persists, emits `settings-changed`. Unchanged shortcuts that failed earlier are only retried and never fail the call. On a new or changed shortcut that cannot be registered: rejects with `code: "shortcut_unavailable"` and leaves the previous settings in force. |
| `report_content` | `{ hasContent: boolean }` | – | Called by an overlay when it goes from empty to non-empty or back. The core hides overlays only when draw mode is off, spotlight is off and no overlay has content, and shows them again (click-through) when content is reported while draw mode is off. |
| `capture_screen` | `{ destination: "file" \| "clipboard" }` | `{ path: string \| null }` | Captures the monitor of the calling overlay, annotations included. `file` writes `ratelpen-YYYYMMDD-HHMMSS.png` into the user's Pictures folder under `ratelpen/`. Rejects with `code: "capture_permission"` when screen recording is not permitted, `code: "capture_failed"` otherwise. A second capture within the same second gets a `-2`, `-3`, … suffix; files are never overwritten. A call made while another capture is running is rejected with `capture_failed`. The UI hides its toolbar before calling. |
| `open_settings` | – | – | Turns draw mode off and shows the settings window. |
| `quit_app` | – | – | |

## Events (core → UI)

| Event | Payload | Target |
| --- | --- | --- |
| `session-changed` | `Session` | all windows |
| `settings-changed` | `Settings` | all windows |
| `overlay-command` | `{ type: "clear" }` | all overlays (tray menu, global shortcut) |
| `cursor` | `{ x: number, y: number } \| null` | each overlay, in that overlay's logical CSS pixels; `null` when the cursor is on another monitor. Sent at up to 60 Hz while `session.spotlight` is true; unchanged positions are skipped but re-sent every 0.5 s. |

## Keyboard (handled by the focused overlay while draw mode is on)

`P` pen, `H` highlighter, `L` line, `A` arrow, `R` rectangle, `O` ellipse, `T` text, `E` eraser,
`1`–`8` palette colour, `[` / `]` thinner / thicker, `F` fading ink, `S` spotlight, `B` cycle board,
`Cmd/Ctrl+Z` undo, `Shift+Cmd/Ctrl+Z` redo, `Delete`/`Backspace` clear this screen, `Esc` leave draw mode.
Holding `Space` turns the pointer into a selection tool: click selects a shape (`Shift` toggles one),
dragging a shape moves the selection, dragging over empty space selects what the rectangle touches.
With a selection, `D`, `Delete` and `Backspace` delete it and `Esc` drops it instead of leaving draw mode.
Holding `Shift` while dragging constrains lines to 45° steps and rectangles/ellipses to squares/circles.
