//! The on-demand settings window.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::{
    controller::{self, FocusReturn},
    error::{window_error, IpcResult},
    session::SessionPatch,
};

pub const SETTINGS_LABEL: &str = "settings";
const SETTINGS_URL: &str = "index.html?view=settings";
const SETTINGS_TITLE: &str = "ratelpen Settings";
const SETTINGS_WIDTH: f64 = 560.0;
const SETTINGS_HEIGHT: f64 = 640.0;
const SETTINGS_MIN_WIDTH: f64 = 480.0;
const SETTINGS_MIN_HEIGHT: f64 = 480.0;

/// Turns draw mode off, then shows the settings window in front.
pub async fn open(app: &AppHandle) -> IpcResult<()> {
    controller::update_session_with(app, |_| SessionPatch::active(false), FocusReturn::Keep)
        .await?;
    let window = match app.get_webview_window(SETTINGS_LABEL) {
        Some(window) => window,
        None => create(app)?,
    };
    window
        .unminimize()
        .and_then(|()| window.show())
        .and_then(|()| window.set_focus())
        .map_err(|error| window_error("The settings window could not be shown", error))
}

fn create(app: &AppHandle) -> IpcResult<WebviewWindow> {
    WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App(SETTINGS_URL.into()))
        .title(SETTINGS_TITLE)
        .inner_size(SETTINGS_WIDTH, SETTINGS_HEIGHT)
        .min_inner_size(SETTINGS_MIN_WIDTH, SETTINGS_MIN_HEIGHT)
        .center()
        .visible(false)
        .build()
        .map_err(|error| window_error("The settings window could not be created", error))
}
