//! One transparent overlay window per monitor.

use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalSize,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use crate::{
    error::{window_error, IpcResult},
    geometry::{DesktopSpace, MonitorFrame},
    platform,
    state::{AppState, OverlayLayout},
};

pub const OVERLAY_PREFIX: &str = "overlay-";
const OVERLAY_URL: &str = "index.html?view=overlay";
const OVERLAY_TITLE: &str = "ratelpen overlay";
const DEFAULT_SCALE: f64 = 1.0;

pub fn overlay_label(index: usize) -> String {
    format!("{OVERLAY_PREFIX}{index}")
}

pub fn is_overlay(label: &str) -> bool {
    label
        .strip_prefix(OVERLAY_PREFIX)
        .is_some_and(|index| !index.is_empty() && index.bytes().all(|byte| byte.is_ascii_digit()))
}

/// Overlays are hidden only when nothing needs them on screen.
pub fn should_hide(active: bool, spotlight: bool, has_content: bool) -> bool {
    !active && !spotlight && !has_content
}

pub fn overlay_windows(app: &AppHandle) -> Vec<WebviewWindow> {
    let mut windows: Vec<(String, WebviewWindow)> = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| is_overlay(label))
        .collect();
    windows.sort_by(|(left, _), (right, _)| left.cmp(right));
    windows.into_iter().map(|(_, window)| window).collect()
}

fn frame_of(monitor: &Monitor) -> MonitorFrame {
    let position = monitor.position();
    let size = monitor.size();
    MonitorFrame {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        scale: monitor.scale_factor(),
    }
}

fn current_layout(app: &AppHandle) -> IpcResult<OverlayLayout> {
    let monitors = app
        .available_monitors()
        .map_err(|error| window_error("The displays could not be listed", error))?;
    if monitors.is_empty() {
        return Err(window_error(
            "No display is available",
            "empty monitor list",
        ));
    }
    let primary_scale = match app.primary_monitor() {
        Ok(Some(monitor)) => monitor.scale_factor(),
        Ok(None) => DEFAULT_SCALE,
        Err(error) => {
            log::warn!("The primary display could not be read: {error}");
            DEFAULT_SCALE
        }
    };
    let overlays = monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| (overlay_label(index), frame_of(monitor)))
        .collect();
    Ok(OverlayLayout {
        overlays,
        primary_scale,
    })
}

/// Creates, moves or removes overlays so there is exactly one per monitor.
/// Existing overlays keep their drawing unless their monitor went away.
pub fn ensure_overlays(app: &AppHandle) -> IpcResult<OverlayLayout> {
    let state = app.state::<AppState>();
    let previous = state.layout();
    let layout = current_layout(app)?;
    for (label, frame) in &layout.overlays {
        let unchanged = previous
            .overlays
            .iter()
            .any(|(old_label, old_frame)| old_label == label && old_frame == frame);
        match app.get_webview_window(label) {
            Some(window) if unchanged => drop(window),
            Some(window) => place(&window, frame)?,
            None => create(app, label, frame)?,
        }
    }
    for window in overlay_windows(app) {
        let needed = layout
            .overlays
            .iter()
            .any(|(label, _)| label == window.label());
        if !needed {
            state.set_content(window.label(), false);
            if let Err(error) = window.destroy() {
                log::error!("An overlay for a removed display could not be closed: {error}");
            }
        }
    }
    state.set_layout(layout.clone());
    Ok(layout)
}

fn create(app: &AppHandle, label: &str, frame: &MonitorFrame) -> IpcResult<()> {
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App(OVERLAY_URL.into()))
        .title(OVERLAY_TITLE)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .visible(false)
        .focused(false)
        .accept_first_mouse(true)
        .build()
        .map_err(|error| window_error("An overlay window could not be created", error))?;
    place(&window, frame)?;
    window
        .set_ignore_cursor_events(true)
        .map_err(|error| window_error("The overlay could not be made click-through", error))?;
    platform::configure_overlay(&window);
    Ok(())
}

/// macOS lays the desktop out in points, so the frame is given in points of
/// the target monitor; elsewhere physical pixels are exact.
///
/// The size goes first: macOS resizes a window around its bottom-left corner,
/// so sizing after positioning would push the top edge off the monitor.
fn place(window: &WebviewWindow, frame: &MonitorFrame) -> IpcResult<()> {
    let result = if cfg!(target_os = "macos") {
        let rect = DesktopSpace::current(frame.scale).rect(frame);
        window
            .set_size(LogicalSize::new(rect.width, rect.height))
            .and_then(|()| window.set_position(LogicalPosition::new(rect.x, rect.y)))
    } else {
        window
            .set_size(PhysicalSize::new(frame.width, frame.height))
            .and_then(|()| window.set_position(PhysicalPosition::new(frame.x, frame.y)))
    };
    result.map_err(|error| window_error("An overlay could not be placed on its display", error))
}

/// Label of the overlay under the cursor, falling back to the first overlay.
pub fn overlay_under_cursor(app: &AppHandle, layout: &OverlayLayout) -> Option<String> {
    let space = DesktopSpace::current(layout.primary_scale);
    let under_cursor = match app.cursor_position() {
        Ok(position) => {
            let cursor = space.cursor(position.x, position.y);
            layout
                .overlays
                .iter()
                .find(|(_, frame)| space.rect(frame).local(cursor).is_some())
        }
        Err(error) => {
            log::warn!("The cursor position could not be read: {error}");
            None
        }
    };
    under_cursor
        .or_else(|| layout.overlays.first())
        .map(|(label, _)| label.clone())
}

/// Draw mode: every overlay takes input; `focus_label` gets keyboard focus.
pub fn show_interactive(app: &AppHandle, focus_label: Option<&str>) -> IpcResult<()> {
    for window in overlay_windows(app) {
        window
            .set_ignore_cursor_events(false)
            .map_err(|error| window_error("The overlay could not take input", error))?;
        if Some(window.label()) != focus_label {
            platform::show_passive(&window);
        }
    }
    let Some(window) = focus_label.and_then(|label| app.get_webview_window(label)) else {
        return Ok(());
    };
    window
        .show()
        .and_then(|()| window.set_focus())
        .map_err(|error| window_error("The overlay could not be focused", error))
}

/// Passive mode: overlays stay on screen but every click goes through.
pub fn show_passive(app: &AppHandle) -> IpcResult<()> {
    for window in overlay_windows(app) {
        set_click_through(&window)?;
        let visible = window.is_visible().unwrap_or(false);
        if !visible {
            platform::show_passive(&window);
        }
    }
    Ok(())
}

pub fn make_click_through(app: &AppHandle) -> IpcResult<()> {
    overlay_windows(app).iter().try_for_each(set_click_through)
}

fn set_click_through(window: &WebviewWindow) -> IpcResult<()> {
    window
        .set_ignore_cursor_events(true)
        .map_err(|error| window_error("The overlay could not be made click-through", error))
}

pub fn hide_all(app: &AppHandle) -> IpcResult<()> {
    overlay_windows(app).iter().try_for_each(|window| {
        window
            .hide()
            .map_err(|error| window_error("The overlay could not be hidden", error))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_round_trip() {
        assert_eq!(overlay_label(0), "overlay-0");
        assert!(is_overlay("overlay-0"));
        assert!(is_overlay("overlay-12"));
        assert!(!is_overlay("overlay-"));
        assert!(!is_overlay("overlay-x"));
        assert!(!is_overlay("settings"));
    }

    #[test]
    fn hides_only_when_nothing_needs_the_overlay() {
        assert!(should_hide(false, false, false));
        assert!(!should_hide(true, false, false));
        assert!(!should_hide(false, true, false));
        assert!(!should_hide(false, false, true));
    }
}
