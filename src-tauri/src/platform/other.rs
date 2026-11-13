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
