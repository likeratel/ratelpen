//! Fallbacks for platforms without native overlay integration.

use tauri::{AppHandle, WebviewWindow};

#[derive(Clone, Copy, Debug)]
pub struct PreviousFocus;

pub fn configure_overlay(_window: &WebviewWindow) {}

pub fn show_passive(window: &WebviewWindow) {
    if let Err(error) = window.show() {
        log::error!("Could not show the overlay: {error}");
    }
}

pub fn capture_focus() -> Option<PreviousFocus> {
    None
}

pub fn restore_focus(_app: &AppHandle, _previous: PreviousFocus) {}

pub fn ensure_screen_capture_permission() -> bool {
    true
}

/// Result of asking for the interaction lock.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LockOutcome {
    Changed,
    #[allow(dead_code)]
    PermissionPrompted,
    #[allow(dead_code)]
    NeedsPermission,
    #[allow(dead_code)]
    Failed,
}

/// Holding the keyboard while drawing is only implemented on macOS.
pub fn set_interaction_lock(
    _app: &AppHandle,
    _config: Option<super::LockConfig>,
    on_result: impl FnOnce(LockOutcome) + Send + 'static,
) {
    on_result(LockOutcome::Changed);
}
