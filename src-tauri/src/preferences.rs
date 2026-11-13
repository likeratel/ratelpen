//! Applying a new `Settings` value: shortcuts, launch at login, persistence.
//!
//! Each step can be undone, so a failure at any point leaves the previous
//! settings fully in force.

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;

use crate::{
    controller::SETTINGS_CHANGED,
    error::{IpcError, IpcResult, AUTOSTART_FAILED, INVALID_SETTINGS, SETTINGS_SAVE_FAILED},
    settings::Settings,
    shortcuts,
    state::AppState,
    store,
};

pub async fn save(app: &AppHandle, settings: Settings) -> IpcResult<Settings> {
    settings
        .validate()
        .map_err(|reason| IpcError::new(INVALID_SETTINGS, reason))?;
    let state = app.state::<AppState>();
    let _saving = state.saving.lock().await;
    let previous = state.settings();
    shortcuts::replace(app, &settings.shortcuts)?;
    if let Err(error) = set_launch_at_login(app, settings.launch_at_login) {
        restore_shortcuts(app, &previous);
        return Err(error);
    }
    if let Err(error) = store::save(&state.settings_path, &settings) {
        log::error!("Settings could not be written: {error}");
        if let Err(rollback) = set_launch_at_login(app, previous.launch_at_login) {
            log::error!("Launch at login could not be restored: {rollback}");
        }
        restore_shortcuts(app, &previous);
        return Err(IpcError::new(
            SETTINGS_SAVE_FAILED,
            "Settings could not be saved.",
        ));
    }
    state.set_settings(settings.clone());
    if let Err(error) = app.emit(SETTINGS_CHANGED, &settings) {
        log::error!("The settings change could not be broadcast: {error}");
    }
    Ok(settings)
}

fn restore_shortcuts(app: &AppHandle, previous: &Settings) {
    shortcuts::restore(app, &previous.shortcuts);
}

fn set_launch_at_login(app: &AppHandle, enabled: bool) -> IpcResult<()> {
    let launcher = app.autolaunch();
    let current = launcher.is_enabled().map_err(autostart_error)?;
    if current == enabled {
        return Ok(());
    }
    let changed = if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    };
    changed.map_err(autostart_error)
}

fn autostart_error(error: impl std::fmt::Display) -> IpcError {
    log::error!("Launch at login could not be changed: {error}");
    IpcError::new(AUTOSTART_FAILED, "Launch at login could not be changed.")
}
