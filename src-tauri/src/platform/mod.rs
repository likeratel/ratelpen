//! Platform-specific window, focus and permission integration.
//!
//! Each backend exposes the same functions: `configure_overlay`,
//! `show_passive`, `capture_focus`, `restore_focus` and
//! `ensure_screen_capture_permission`, plus a `PreviousFocus` handle.

#[cfg(target_os = "macos")]
mod macos;
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
