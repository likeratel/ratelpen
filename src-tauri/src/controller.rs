//! Session transitions and their window side effects.
//!
//! Everything here waits on the main thread, so it must run on an async task,
//! never directly inside a main-thread callback. `dispatch` does that for the
//! tray and global shortcuts.

use std::future::Future;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    cursor::CursorTracker,
    error::{IpcError, IpcResult, INVALID_ARGUMENT, INVALID_SESSION},
    overlay, platform,
    session::{Session, SessionPatch},
    state::AppState,
    tray,
};

pub const SESSION_CHANGED: &str = "session-changed";
pub const SETTINGS_CHANGED: &str = "settings-changed";
pub const OVERLAY_COMMAND: &str = "overlay-command";

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum OverlayCommand {
    Clear,
}

/// What to do with the app that was frontmost before draw mode.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FocusReturn {
    Restore,
    /// Another of our windows is about to take focus.
    Keep,
}

/// Runs `task` on the async runtime and logs a failure.
pub fn dispatch<F>(context: &'static str, task: F)
where
    F: Future<Output = IpcResult<()>> + Send + 'static,
{
    tauri::async_runtime::spawn(async move {
        if let Err(error) = task.await {
            log::error!("{context} failed: {error}");
        }
    });
}

pub async fn update_session(app: &AppHandle, patch: SessionPatch) -> IpcResult<Session> {
    update_session_with(app, move |_| patch, FocusReturn::Restore).await
}

/// Applies the patch built from the current session, under the transition lock
/// so toggles from the tray, shortcuts and UI never interleave.
pub async fn update_session_with(
    app: &AppHandle,
    build: impl FnOnce(&Session) -> SessionPatch,
    focus: FocusReturn,
) -> IpcResult<Session> {
    let state = app.state::<AppState>();
    let _transition = state.transitions.lock().await;
    let previous = state.session();
    let next = previous
        .apply(&build(&previous))
        .map_err(|reason| IpcError::new(INVALID_SESSION, reason))?;
    apply_effects(app, &previous, &next, focus)?;
    state.set_session(next.clone());
    publish_session(app, &next);
    Ok(next)
}

pub async fn toggle_draw(app: AppHandle) -> IpcResult<()> {
    let build = |session: &Session| SessionPatch::active(!session.active);
    let result = update_session_with(&app, build, FocusReturn::Restore).await;
    if result.is_err() {
        tray::resync(&app);
    }
    result.map(drop)
}

pub async fn toggle_spotlight(app: AppHandle) -> IpcResult<()> {
    let build = |session: &Session| SessionPatch::spotlight(!session.spotlight);
    let result = update_session_with(&app, build, FocusReturn::Restore).await;
    if result.is_err() {
        tray::resync(&app);
    }
    result.map(drop)
}

pub async fn clear_all(app: AppHandle) -> IpcResult<()> {
    let state = app.state::<AppState>();
    let _transition = state.transitions.lock().await;
    send_clear(&app);
    hide_if_unneeded(&app, &state.session());
    Ok(())
}

pub async fn report_content(app: &AppHandle, label: &str, has_content: bool) -> IpcResult<()> {
    if !overlay::is_overlay(label) {
        return Err(IpcError::new(
            INVALID_ARGUMENT,
            "Only an overlay can report drawing content.",
        ));
    }
    let state = app.state::<AppState>();
    let _transition = state.transitions.lock().await;
    state.set_content(label, has_content);
    let session = state.session();
    // Text typed just before leaving draw mode is committed after the
    // overlays were hidden; bring them back so it stays visible.
    if has_content && !session.active {
        if let Err(error) = overlay::show_passive(app) {
            log::error!("The overlays could not be shown again: {error}");
        }
    }
    hide_if_unneeded(app, &session);
    Ok(())
}

fn apply_effects(
    app: &AppHandle,
    previous: &Session,
    next: &Session,
    focus: FocusReturn,
) -> IpcResult<()> {
    if next.active && !previous.active {
        activate(app)?;
    } else if previous.active && !next.active {
        deactivate(app, focus);
    }
    let needs_passive_overlays =
        next.spotlight && !next.active && (previous.active || !previous.spotlight);
    if needs_passive_overlays {
        match show_for_spotlight(app) {
            // Draw mode is already off at this point, so finish the change.
            Err(error) if previous.active => {
                log::error!("The spotlight overlays could not be shown: {error}");
            }
            Err(error) => return Err(error),
            Ok(()) => {}
        }
    }
    app.state::<CursorTracker>()
        .set_enabled(app, next.spotlight);
    hide_if_unneeded(app, next);
    Ok(())
}

fn activate(app: &AppHandle) -> IpcResult<()> {
    let state = app.state::<AppState>();
    state.remember_focus(platform::capture_focus());
    let shown = overlay::ensure_overlays(app).and_then(|layout| {
        let target = overlay::overlay_under_cursor(app, &layout);
        overlay::show_interactive(app, target.as_deref())
    });
    if let Err(error) = shown {
        deactivate(app, FocusReturn::Restore);
        hide_if_unneeded(app, &state.session());
        return Err(error);
    }
    Ok(())
}

/// Best effort: each step logs its own failure so the rest still runs.
fn deactivate(app: &AppHandle, focus: FocusReturn) {
    let state = app.state::<AppState>();
    if let Err(error) = overlay::make_click_through(app) {
        log::error!("Leaving draw mode left an overlay taking input: {error}");
    }
    if state.settings().clear_on_exit {
        send_clear(app);
    }
    let previous = state.take_focus();
    if let (Some(previous), FocusReturn::Restore) = (previous, focus) {
        platform::restore_focus(app, previous);
    }
}

fn show_for_spotlight(app: &AppHandle) -> IpcResult<()> {
    overlay::ensure_overlays(app)?;
    overlay::show_passive(app)
}

fn hide_if_unneeded(app: &AppHandle, session: &Session) {
    let has_content = app.state::<AppState>().has_content();
    if overlay::should_hide(session.active, session.spotlight, has_content) {
        if let Err(error) = overlay::hide_all(app) {
            log::error!("Overlays could not be hidden: {error}");
        }
    }
}

/// Tells every overlay to clear. Overlays report back through
/// `report_content`; the content set is cleared now so hiding is immediate.
fn send_clear(app: &AppHandle) {
    app.state::<AppState>().clear_content();
    for window in overlay::overlay_windows(app) {
        if let Err(error) = app.emit_to(window.label(), OVERLAY_COMMAND, OverlayCommand::Clear) {
            log::error!(
                "The clear command could not reach {}: {error}",
                window.label()
            );
        }
    }
}

fn publish_session(app: &AppHandle, session: &Session) {
    if let Err(error) = app.emit(SESSION_CHANGED, session) {
        log::error!("The session change could not be broadcast: {error}");
    }
    tray::sync(app, session);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlay_command_matches_the_contract() {
        let json = serde_json::to_value(OverlayCommand::Clear).unwrap();
        assert_eq!(json, serde_json::json!({"type": "clear"}));
    }
}
