//! Windows focus hand-back and passive overlay display (experimental).

use tauri::{AppHandle, WebviewWindow};
use windows_sys::Win32::{
    Foundation::HWND,
    UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow, ShowWindow,
        SW_SHOWNOACTIVATE,
    },
};

/// Previously foreground window handle, stored as an integer so it is `Send`.
#[derive(Clone, Copy, Debug)]
pub struct PreviousFocus(isize);

/// Overlay level and Space behaviour are macOS concepts; `always_on_top` and
/// `skip_taskbar` from the window builder cover Windows.
pub fn configure_overlay(_window: &WebviewWindow) {}

/// Shows the overlay without activating it, so the foreground app keeps focus.
pub fn show_passive(window: &WebviewWindow) {
    let target = window.clone();
    let scheduled = window.run_on_main_thread(move || match target.hwnd() {
        Ok(handle) => {
            // SAFETY: `handle` is the live HWND of `target`, used on the UI thread.
            unsafe {
                ShowWindow(handle.0 as HWND, SW_SHOWNOACTIVATE);
            }
        }
        Err(error) => log::error!("The overlay's native window is unavailable: {error}"),
    });
    if let Err(error) = scheduled {
        log::error!("Could not schedule showing the overlay: {error}");
    }
}

/// Records the foreground window unless it belongs to this process.
pub fn capture_focus() -> Option<PreviousFocus> {
    // SAFETY: plain Win32 queries; a null HWND is handled below.
    let (handle, owner) = unsafe {
        let handle = GetForegroundWindow();
        let mut owner = 0u32;
        GetWindowThreadProcessId(handle, &mut owner);
        (handle, owner)
    };
    let foreign = !handle.is_null() && owner != std::process::id();
    foreign.then_some(PreviousFocus(handle as isize))
}

pub fn restore_focus(app: &AppHandle, previous: PreviousFocus) {
    let scheduled = app.run_on_main_thread(move || {
        // SAFETY: a stale HWND makes SetForegroundWindow fail, which is logged.
        let restored = unsafe { SetForegroundWindow(previous.0 as HWND) };
        if restored == 0 {
            log::warn!("The previously focused window could not be brought back.");
        }
    });
    if let Err(error) = scheduled {
        log::error!("Could not schedule focus restoration: {error}");
    }
}

/// Windows has no screen recording permission gate.
pub fn ensure_screen_capture_permission() -> bool {
    true
}
