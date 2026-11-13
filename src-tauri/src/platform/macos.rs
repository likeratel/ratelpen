//! macOS window behaviour, focus hand-back and screen recording permission.
//!
//! Every AppKit window call runs on the main thread through
//! `run_on_main_thread`, and the `NSWindow` pointer is read inside that
//! closure so it cannot outlive the window.

use objc2_app_kit::{
    NSApplicationActivationOptions, NSRunningApplication, NSWindow, NSWindowCollectionBehavior,
    NSWorkspace,
};
use tauri::{AppHandle, WebviewWindow};

use super::{macos_lock, LockConfig};

/// `kCGMainMenuWindowLevel` (24) and `kCGPopUpMenuWindowLevel` (101). The
/// overlay sits just below pop-up menus so the menu bar extra's menu still
/// opens above it, while covering the menu bar, Dock and status items.
const MAIN_MENU_WINDOW_LEVEL: isize = 24;
const POP_UP_MENU_WINDOW_LEVEL: isize = 101;
const OVERLAY_WINDOW_LEVEL: isize = POP_UP_MENU_WINDOW_LEVEL - 1;
const _: () = assert!(OVERLAY_WINDOW_LEVEL > MAIN_MENU_WINDOW_LEVEL);

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// Previously frontmost application, by process id.
#[derive(Clone, Copy, Debug)]
pub struct PreviousFocus(i32);

fn with_ns_window(window: &WebviewWindow, action: impl FnOnce(&NSWindow) + Send + 'static) {
    let target = window.clone();
    let scheduled = window.run_on_main_thread(move || match target.ns_window() {
        Ok(pointer) if !pointer.is_null() => {
            // SAFETY: tauri returns the live NSWindow of `target`, and this
            // closure runs on the main thread while `target` keeps it alive.
            let ns_window = unsafe { &*pointer.cast::<NSWindow>() };
            action(ns_window);
        }
        Ok(_) => log::error!("The overlay has no native window."),
        Err(error) => log::error!("The overlay's native window is unavailable: {error}"),
    });
    if let Err(error) = scheduled {
        log::error!("Could not schedule a native overlay update: {error}");
    }
}

/// Shows the overlay on every Space and above full-screen apps.
pub fn configure_overlay(window: &WebviewWindow) {
    with_ns_window(window, |ns_window| {
        ns_window.setLevel(OVERLAY_WINDOW_LEVEL);
        ns_window.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::IgnoresCycle,
        );
        ns_window.setHasShadow(false);
    });
}

/// Brings the overlay on screen without making it key or activating the app.
pub fn show_passive(window: &WebviewWindow) {
    with_ns_window(window, |ns_window| ns_window.orderFrontRegardless());
}

/// Records the frontmost application unless it is this app.
pub fn capture_focus() -> Option<PreviousFocus> {
    let application = NSWorkspace::sharedWorkspace().frontmostApplication()?;
    let pid = application.processIdentifier();
    let own_pid = i32::try_from(std::process::id()).ok()?;
    (pid > 0 && pid != own_pid).then_some(PreviousFocus(pid))
}

pub fn restore_focus(app: &AppHandle, previous: PreviousFocus) {
    let scheduled = app.run_on_main_thread(move || {
        let Some(application) =
            NSRunningApplication::runningApplicationWithProcessIdentifier(previous.0)
        else {
            log::info!("The previously focused app is no longer running.");
            return;
        };
        if !application.activateWithOptions(NSApplicationActivationOptions::empty()) {
            log::warn!("The previously focused app could not be activated.");
        }
    });
    if let Err(error) = scheduled {
        log::error!("Could not schedule focus restoration: {error}");
    }
}

/// Whether screen recording is permitted. When it is not, asks macOS to
/// prompt (or list the app in System Settings) and returns `false`.
pub fn ensure_screen_capture_permission() -> bool {
    // SAFETY: both functions take no arguments and only query or request TCC
    // state; they are documented as safe to call from any thread.
    unsafe {
        if CGPreflightScreenCaptureAccess() {
            return true;
        }
        CGRequestScreenCaptureAccess();
    }
    false
}

/// Result of asking for the interaction lock.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LockOutcome {
    Changed,
    /// macOS has just put up its dialog asking for the Accessibility
    /// permission.
    PermissionPrompted,
    /// The user has not allowed ratelpen under Accessibility yet.
    NeedsPermission,
    Failed,
}

/// With a config: holds the keyboard so that every key press and trackpad
/// gesture stays inside ratelpen. With `None`: gives it back.
/// `on_result` runs on the main thread.
pub fn set_interaction_lock(
    app: &AppHandle,
    config: Option<LockConfig>,
    on_result: impl FnOnce(LockOutcome) + Send + 'static,
) {
    let scheduled = app.run_on_main_thread(move || {
        let Some(config) = config else {
            macos_lock::remove();
            on_result(LockOutcome::Changed);
            return;
        };
        if macos_lock::is_trusted(false) {
            let exit = config
                .exit_shortcut
                .as_ref()
                .and_then(macos_lock::KeyChord::from_shortcut);
            let installed = macos_lock::install(exit, config.on_exit);
            on_result(if installed {
                LockOutcome::Changed
            } else {
                LockOutcome::Failed
            });
        } else if config.may_prompt {
            // Asks macOS to show its dialog; the answer applies next time.
            macos_lock::is_trusted(true);
            on_result(LockOutcome::PermissionPrompted);
        } else {
            on_result(LockOutcome::NeedsPermission);
        }
    });
    if let Err(error) = scheduled {
        log::error!("Could not schedule the interaction lock change: {error}");
    }
}
