# ratelpen

English · [한국어](README.ko.md)

[![Verify desktop builds](https://github.com/likeratel/ratelpen/actions/workflows/verify.yml/badge.svg)](https://github.com/likeratel/ratelpen/actions/workflows/verify.yml)

<img src="design/icon.svg" alt="ratelpen icon: a pen drawing a yellow line" width="120" />

> **Made with AI.** I wrote the requirements and tried each build on my own Mac. Everything else, meaning all of the code, the tests and this documentation, was written by AI in sessions with [Claude Code](https://claude.com/claude-code).

ratelpen lets you draw on top of your screen while you present, share your screen, or record. Press one shortcut, mark up whatever is on screen with a pen, shapes, arrows and text, and press it again to get your screen back. It lives in the menu bar (system tray on Windows), keeps nothing on disk unless you ask for a screenshot, and never uses the network. Built with Tauri 2, React, TypeScript, and Rust.

> **Verification status.** Developed and used on one Mac (Apple Silicon, one display); the behaviour is also covered by unit and browser tests. Windows builds in CI but has never been run. What has not been checked is listed under [Limits](#limits).

## Contents

- [Quick start](#quick-start)
- [Shortcuts](#shortcuts)
- [Features](#features)
- [Settings](#settings)
- [Install](#install)
- [Permissions (macOS)](#permissions-macos)
- [Privacy](#privacy)
- [Limits](#limits)
- [Development](#development)

## Quick start

1. Start ratelpen. A pen icon appears in the menu bar; there is no Dock icon.
2. Press **Option+Tab** (**Alt+Shift+D** on Windows) to turn draw mode on. A toolbar appears at the bottom of the screen.
3. Draw. Pick tools and colours from the toolbar or with the keys below.
4. Press **Option+Tab** or **Esc** to leave draw mode. Your drawing is cleared and clicks go to your apps again.

The menu bar icon offers the same actions: Draw, Clear All, Spotlight, Settings…, Quit.

The first time you turn draw mode on, macOS asks for the Accessibility permission and ratelpen steps out of draw mode so you can answer. See [Permissions](#permissions-macos).

## Shortcuts

### Anywhere

These work in any app and can be changed in Settings.

| Action | macOS | Windows |
| --- | --- | --- |
| Turn draw mode on or off | `Option+Tab` | `Alt+Shift+D` |
| Clear every screen | `Option+Shift+C` | `Alt+Shift+C` |
| Turn the cursor spotlight on or off | `Option+Shift+S` | `Alt+Shift+S` |

### While drawing

These work only in draw mode and are fixed. Letter keys work the same with a Korean or other non-Latin input source selected.

**Tools**

| Key | Tool |
| --- | --- |
| `P` | Pen |
| `H` | Highlighter |
| `L` | Line |
| `A` | Arrow |
| `R` | Rectangle |
| `O` | Ellipse |
| `T` | Text |
| `E` | Eraser (removes whole shapes it touches) |

**Colour and width**

| Key | Action |
| --- | --- |
| `1` – `8` | Pick a palette colour |
| `[` / `]` | Thinner / thicker |
| hold `Shift` while dragging | Snap lines to 45° steps; draw squares and circles |

**Select, move, delete**

| Key | Action |
| --- | --- |
| hold `Space` + click | Select a shape (`Shift` adds or removes one) |
| hold `Space` + drag a shape | Move the selection |
| hold `Space` + drag on empty space | Select everything the rectangle touches |
| hold `Space` + double-click a text | Edit that text |
| `D` | Delete the selection |
| `Delete` / `Backspace` | Delete the selection, or clear this screen when nothing is selected |
| `Cmd+Z` / `Ctrl+Z` | Undo |
| `Shift+Cmd+Z` / `Shift+Ctrl+Z` | Redo |

**Modes**

| Key | Action |
| --- | --- |
| `F` | Fading ink on or off |
| `S` | Cursor spotlight on or off |
| `B` | Cycle the board: none → whiteboard → blackboard |
| `Esc` | Drop the selection, or leave draw mode when nothing is selected |

## Features

### Drawing

- **Pen and highlighter.** The pen follows pressure from a pen tablet; the highlighter is wide and see-through.
- **Shapes.** Line, arrow, rectangle, ellipse.
- **Text.** Click where the text should go and type. `Enter` places it, `Shift+Enter` starts a new line, `Esc` cancels. To change a text later, click it with the text tool, or hold `Space` and double-click it from any tool.
- **Select, move, delete.** Hold `Space` and click a stroke, shape or text to select it; a dashed frame marks it. Keep `Space` held and drag to move it, or press `D` to delete it. Moving and deleting are each one undo step.
- **Several displays.** Each display gets its own drawing. Undo and `Delete` act on the display that has keyboard focus.

### Colour

- **Palette and picker.** Eight palette colours sit on the toolbar (keys `1`–`8`). The palette button next to them opens a picker with a colour wheel, a brightness slider, and a field that takes `#rrggbb` or `255, 0, 0`.
- **Favourites.** The star in the picker keeps the current colour, up to ten. Select a favourite and press the star again to remove it.
- **A colour per tool.** Each tool remembers the colour you last used with it, so the pen can stay red while text stays black.

### Presenting

- **Cursor spotlight.** Dims the screen except for a circle around the cursor (or shows a halo instead; choose in Settings). While it is on, no drawing tool is selected; pick a tool to go back to drawing. It keeps working when draw mode is off.
- **Tap rings.** A tap shows a ring that bursts out from the pointer and leaves no ink, so viewers can see where you clicked.
- **Fading ink.** With `F` on, new ink disappears by itself after a few seconds (5 by default), which suits pointing at things as you talk.
- **Boards.** Cover the screen with a whiteboard or blackboard to sketch on.
- **Keyboard lock (macOS).** While draw mode is on, key presses go only to ratelpen: the app switcher, Mission Control and other apps' shortcuts do nothing, so the screen underneath stays put. `Option+Tab` and Force Quit (`Cmd+Option+Esc`) always get you out, and the lock pauses whenever another app comes to the front. Needs the Accessibility permission; can be turned off in Settings.

### Everything else

- **Screenshots.** The two camera buttons on the toolbar save the screen with your drawing to `Pictures/ratelpen`, or copy it to the clipboard.
- **Toolbar.** Drag it by the grip on its left edge. It stays where you put it.

## Settings

Open **Settings…** from the menu bar icon or the gear on the toolbar.

- Global shortcuts: click a field and press the new combination. The ✕ button turns a shortcut off.
- The eight palette colours, the default colour and width. The default colour applies until a tool has a colour of its own.
- How long fading ink stays, and whether it is on by default.
- Spotlight style and size.
- **Clear drawings when leaving draw mode** (on by default). Turn it off to keep your drawing on screen, click-through, after you leave draw mode.
- **Lock the keyboard while drawing** (macOS, on by default).
- Launch at login.

## Install

No installer is published yet. Build it from source:

```sh
pnpm install --frozen-lockfile
pnpm tauri build
```

The app is written to `src-tauri/target/release/bundle/`. Requires macOS 12 or later; a locally built app is not notarized.

## Permissions (macOS)

| Permission | Used for | Without it |
| --- | --- | --- |
| Accessibility | The keyboard lock while drawing | Everything else works; other apps' shortcuts keep firing while you draw |
| Screen Recording | Screenshots | Screenshots fail with a message; drawing is unaffected |

- **Granting Accessibility.** The first time draw mode is turned on, macOS shows a dialog and ratelpen leaves draw mode so you can click it. Choose **Open System Settings**, turn ratelpen on under Privacy & Security › Accessibility, then turn draw mode on again. The dialog is shown only that first time; after that ratelpen draws without the lock and reminds you once per launch.
- ratelpen uses the permission only to keep key presses from reaching the system while you draw. It does not record them.
- A locally built app that is not signed with a stable identity loses its permissions every time it is rebuilt. Set `APPLE_SIGNING_IDENTITY` when building to keep them.

## Privacy

- ratelpen makes no network requests.
- Drawings exist only in memory.
- The screen is captured only when you press a screenshot button, and the image goes only to `Pictures/ratelpen` or the clipboard. Clipboard managers and clipboard syncing can carry a copied screenshot further.
- Settings are stored in `settings.json` in the app's configuration folder. The toolbar position, favourite colours and the colour of each tool are kept in the app's web view storage.

## Limits

**Windows**

- Experimental: the code builds on Windows in CI, but nobody has run it there yet. Focus hand-back, click-through and screenshots are unverified.
- No keyboard lock, and `Alt+Tab` cannot be used as a shortcut.

**Not verified on real hardware**

- Several displays with different scaling, and drawing over full-screen apps.
- Pressure from a tablet. A trackpad's pressure is not available to the app at all.
- Whether the keyboard lock also stops trackpad gestures (swiping to Mission Control or another Space), and whether the input source can be switched while it is on.
- The Screen Recording permission prompt in a signed build.

**Known behaviour**

- While the keyboard lock is on, media keys still work, and the global shortcuts for clearing and the spotlight act only on the screen that has the keyboard.
- A shortcut that another app already owns may be refused; Settings then marks it and asks for a different one. On macOS some conflicts cannot be detected.
- While you record a new shortcut in Settings, your existing global shortcuts still fire. To swap two of them, clear one, save, then set the other.
- A display added or removed while draw mode is on is picked up the next time draw mode is turned on.
- Linux is not supported.

## Development

Prerequisites: Node.js 22, pnpm 10, and a current stable Rust toolchain.

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
```

`pnpm dev` alone opens the UI in a browser against an in-memory stand-in for the core (`http://localhost:1420/?view=overlay` and `?view=settings`), which is what the browser tests use.

### Checks

```sh
pnpm check
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm format:check
cd src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
```

The UI and the Rust core talk only through the commands and events in [CONTRACT.md](CONTRACT.md). See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

[MIT](LICENSE)
