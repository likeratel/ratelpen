//! Commands invoked by the web UI (see `CONTRACT.md`).
//!
//! Arguments that need validation arrive as raw JSON so a malformed value is
//! rejected with an `IpcError` rather than a bare deserialization string.
//! All commands are async: they run off the main thread, which window
//! creation and the main-thread waits in `controller` require.

use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, Window};

use crate::{
    capture::{self, CaptureResult, Destination},
    controller,
    error::{IpcError, IpcResult, INVALID_ARGUMENT, INVALID_SESSION, INVALID_SETTINGS},
    platform, preferences,
    session::{Session, SessionPatch},
    settings::{Settings, ShortcutAction},
    settings_window,
    shortcuts::ShortcutRegistry,
    state::AppState,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    settings: Settings,
    session: Session,
    platform: &'static str,
    unavailable_shortcuts: Vec<ShortcutAction>,
}

fn parse<T: DeserializeOwned>(value: Value, code: &'static str, what: &str) -> IpcResult<T> {
    serde_json::from_value(value).map_err(|error| IpcError::new(code, format!("{what}: {error}")))
}

#[tauri::command]
pub async fn get_bootstrap(app: AppHandle) -> IpcResult<Bootstrap> {
    let state = app.state::<AppState>();
    Ok(Bootstrap {
        settings: state.settings(),
        session: state.session(),
        platform: platform::name(),
        unavailable_shortcuts: app.state::<ShortcutRegistry>().unavailable(),
    })
}

#[tauri::command]
pub async fn update_session(app: AppHandle, patch: Value) -> IpcResult<Session> {
    let patch: SessionPatch = parse(patch, INVALID_SESSION, "Invalid session change")?;
    controller::update_session(&app, patch).await
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: Value) -> IpcResult<Settings> {
    let settings: Settings = parse(settings, INVALID_SETTINGS, "Invalid settings")?;
    preferences::save(&app, settings).await
}

#[tauri::command]
pub async fn report_content(app: AppHandle, window: Window, has_content: bool) -> IpcResult<()> {
    controller::report_content(&app, window.label(), has_content).await
}

#[tauri::command]
pub async fn capture_screen(
    app: AppHandle,
    window: Window,
    destination: Value,
) -> IpcResult<CaptureResult> {
    let destination: Destination = parse(destination, INVALID_ARGUMENT, "Invalid destination")?;
    capture::capture(&app, window.label(), destination).await
}

#[tauri::command]
pub async fn open_settings(app: AppHandle) -> IpcResult<()> {
    settings_window::open(&app).await
}

#[tauri::command]
pub async fn quit_app(app: AppHandle) -> IpcResult<()> {
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn malformed_arguments_become_ipc_errors() {
        let error = parse::<SessionPatch>(
            serde_json::json!({"tool": "brush"}),
            INVALID_SESSION,
            "Invalid session change",
        )
        .unwrap_err();
        assert_eq!(error.code, INVALID_SESSION);
        assert!(error.message.starts_with("Invalid session change"));
    }
}
