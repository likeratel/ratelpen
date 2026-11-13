# Contributing

Thanks for your interest in ratelpen. It is a small screen annotation tool, so contributions are
expected to stay inside that scope.

## Ground rules

- ratelpen never uses the network. Do not add telemetry, uploads, or anything that sends screen
  content off the machine.
- Drawings live in memory only. Captures are written only when the user asks, and only to the
  Pictures folder or the clipboard.
- The keyboard lock exists only while draw mode is on. It hands key presses to ratelpen and does
  nothing else with them: no logging, no storing, no sending. Force Quit must always get through.
- The UI and the Rust core talk only through [CONTRACT.md](CONTRACT.md). When you change a command,
  an event, or a payload, update the contract, the Rust models, and the zod schemas together.
- Validate every IPC input in the core and reject out-of-range values. Do not build shell command
  strings; pass fixed argument lists.
- Keep platform-specific code behind `#[cfg(target_os)]` and keep the Windows build compiling.
- A failure must be shown as a failure: an unavailable shortcut, a missing capture permission, or a
  settings file that could not be saved.
- Keep the README honest about what is supported and what has been verified.

## Development setup

See the [README](README.md#development) for prerequisites. In short:

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
```

## Checks before a pull request

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

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/), for example `feat: add dashed lines`.
