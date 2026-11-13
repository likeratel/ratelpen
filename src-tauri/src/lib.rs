mod capture;
mod commands;
mod controller;
mod cursor;
mod error;
mod geometry;
mod overlay;
mod platform;
mod preferences;
mod session;
mod settings;
mod settings_window;
mod shortcuts;
mod state;
mod store;
mod tray;
mod validate;

use tauri::{App, AppHandle, Manager, RunEvent, WindowEvent};

use crate::{
    cursor::CursorTracker, settings::Settings, shortcuts::ShortcutRegistry, state::AppState,
    store::LoadOutcome,
};

const AUTOSTART_ARGUMENT: &str = "--autostart";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        // Must be first so a second launch exits before other plugins start.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            on_second_instance(app)
        }))
        .plugin(log_plugin())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .arg(AUTOSTART_ARGUMENT)
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(shortcuts::plugin())
        .setup(|app| {
            setup(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                if overlay::is_overlay(window.label()) {
                    window
                        .app_handle()
                        .state::<AppState>()
                        .set_content(window.label(), false);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_bootstrap,
            commands::update_session,
            commands::save_settings,
            commands::report_content,
            commands::capture_screen,
            commands::open_settings,
            commands::quit_app,
        ])
        .build(tauri::generate_context!());
    match result {
        Ok(app) => app.run(keep_running_without_windows),
        Err(error) => {
            eprintln!("ratelpen could not start: {error}");
            std::process::exit(1);
        }
    }
}

/// Closing the last window (for example Settings before any overlay exists)
/// must not quit a tray app. An explicit quit carries an exit code and passes.
fn keep_running_without_windows(_app: &AppHandle, event: RunEvent) {
    if let RunEvent::ExitRequested {
        code: None, api, ..
    } = event
    {
        api.prevent_exit();
    }
}

fn log_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_log::Builder::new()
        .level(log::LevelFilter::Info)
        .targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
        ])
        .build()
}

fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    let settings_path = store::settings_path(&app.path().app_config_dir()?);
    let settings = load_settings(&settings_path);
    let shortcuts = settings.shortcuts.clone();
    app.manage(AppState::new(settings_path, settings));
    app.manage(ShortcutRegistry::default());
    app.manage(CursorTracker::default());
    tray::build(app)?;
    if !shortcuts::register_at_launch(app.handle(), &shortcuts) {
        // A shortcut that is taken is shown in Settings, not only logged.
        on_second_instance(app.handle());
    }
    Ok(())
}

fn load_settings(path: &std::path::Path) -> Settings {
    let (settings, outcome) = store::load(path);
    match outcome {
        LoadOutcome::Loaded => log::info!("Settings loaded."),
        LoadOutcome::Missing => log::info!("No settings file yet; using defaults."),
        LoadOutcome::Unreadable(reason) => {
            log::error!("Settings could not be read, using defaults: {reason}")
        }
        LoadOutcome::Corrupt(reason) => {
            log::error!("Settings file is damaged, using defaults: {reason}")
        }
        LoadOutcome::Invalid(reason) => {
            log::error!("Settings are out of range, using defaults: {reason}")
        }
    }
    settings
}

/// A second launch (or a shortcut problem at launch) opens the settings window.
fn on_second_instance(app: &AppHandle) {
    let app = app.clone();
    controller::dispatch("Opening settings for a second launch", async move {
        settings_window::open(&app).await
    });
}
