//! Platform-specific window, focus and permission integration.
//!
//! Each backend exposes the same functions: `configure_overlay`,
//! `show_passive`, `capture_focus`, `restore_focus`, `set_interaction_lock`
//! and `ensure_screen_capture_permission`, plus a `PreviousFocus` handle.

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
mod macos_lock;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::*;

#[cfg(not(any(target_os = "macos", windows)))]
mod other;
#[cfg(not(any(target_os = "macos", windows)))]
pub use other::*;

/// Value of `Bootstrap.platform`.
pub fn name() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    }
}

/// What the keyboard lock needs to know when it is switched on.
pub struct LockConfig {
    /// The shortcut that leaves draw mode. The lock recognises it by itself,
    /// so leaving never depends on the overlay's web view.
    pub exit_shortcut: Option<tauri_plugin_global_shortcut::Shortcut>,
    /// Called on the main thread when the user asks to leave draw mode.
    pub on_exit: std::sync::Arc<dyn Fn() + Send + Sync>,
    /// Whether macOS may show its permission dialog now.
    pub may_prompt: bool,
}
