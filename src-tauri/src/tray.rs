//! Menu bar / system tray icon and its menu.

use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    App, AppHandle, Manager, Wry,
};

use crate::{controller, session::Session, settings_window};

pub const TRAY_ID: &str = "ratelpen-tray";
const TOOLTIP: &str = "ratelpen";
const MENU_DRAW: &str = "toggle-draw";
const MENU_CLEAR: &str = "clear-all";
const MENU_SPOTLIGHT: &str = "toggle-spotlight";
const MENU_SETTINGS: &str = "open-settings";
const MENU_QUIT: &str = "quit";

/// Black glyph with alpha, used as a macOS template image so it follows the
/// menu bar appearance. Other platforms use the colour app icon, which stays
/// readable on dark taskbars.
#[cfg(target_os = "macos")]
const MENU_BAR_TEMPLATE_ICON: &[u8] = include_bytes!("../icons/tray@2x.png");

/// Check items whose state mirrors the session.
pub struct TrayItems {
    draw: CheckMenuItem<Wry>,
    spotlight: CheckMenuItem<Wry>,
}

pub fn build(app: &App) -> tauri::Result<()> {
    let draw = CheckMenuItem::with_id(app, MENU_DRAW, "Draw", true, false, None::<&str>)?;
    let spotlight =
        CheckMenuItem::with_id(app, MENU_SPOTLIGHT, "Spotlight", true, false, None::<&str>)?;
    let clear = MenuItem::with_id(app, MENU_CLEAR, "Clear All", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, MENU_SETTINGS, "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "Quit ratelpen", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &draw,
            &clear,
            &spotlight,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(TOOLTIP)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(handle_menu_event);
    if let Some(icon) = tray_icon(app)? {
        tray = tray.icon(icon).icon_as_template(cfg!(target_os = "macos"));
    }
    tray.build(app)?;
    app.manage(TrayItems { draw, spotlight });
    Ok(())
}

fn tray_icon(app: &App) -> tauri::Result<Option<Image<'static>>> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        Image::from_bytes(MENU_BAR_TEMPLATE_ICON).map(Some)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(app
            .default_window_icon()
            .map(|icon| icon.clone().to_owned()))
    }
}

fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    let app = app.clone();
    match event.id().as_ref() {
        MENU_DRAW => controller::dispatch("Toggling draw mode", controller::toggle_draw(app)),
        MENU_CLEAR => controller::dispatch("Clearing all overlays", controller::clear_all(app)),
        MENU_SPOTLIGHT => {
            controller::dispatch("Toggling the spotlight", controller::toggle_spotlight(app))
        }
        MENU_SETTINGS => controller::dispatch("Opening settings", async move {
            settings_window::open(&app).await
        }),
        MENU_QUIT => app.exit(0),
        _ => {}
    }
}

/// Mirrors the session in the check items. A check item toggles itself when
/// clicked, so this also corrects it when the change was rejected.
pub fn sync(app: &AppHandle, session: &Session) {
    let Some(items) = app.try_state::<TrayItems>() else {
        return;
    };
    let results = [
        items.draw.set_checked(session.active),
        items.spotlight.set_checked(session.spotlight),
    ];
    for result in results {
        if let Err(error) = result {
            log::warn!("The tray menu state could not be updated: {error}");
        }
    }
}

/// Re-syncs the check items with the current session.
pub fn resync(app: &AppHandle) {
    let session = app.state::<crate::state::AppState>().session();
    sync(app, &session);
}
