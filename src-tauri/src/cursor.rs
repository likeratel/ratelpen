//! Global cursor polling for the spotlight, active only while it is on.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Emitter, Manager};

use crate::{
    geometry::{CursorPoint, DesktopSpace},
    state::{AppState, OverlayLayout},
};

pub const CURSOR_EVENT: &str = "cursor";
/// About 60 Hz.
const POLL_INTERVAL: Duration = Duration::from_millis(16);
/// Unchanged positions are skipped, but everything is sent again this often so
/// an overlay that started listening late still learns where the cursor is.
const RESEND_INTERVAL: Duration = Duration::from_millis(500);

/// Owns the stop flag of the running poller, if any. Each start creates a new
/// flag, so a poller that is still finishing its last tick can never be
/// revived by a later start.
#[derive(Default)]
pub struct CursorTracker {
    running: Mutex<Option<Arc<AtomicBool>>>,
}

impl CursorTracker {
    /// Starts or stops polling to match `enabled`.
    pub fn set_enabled(&self, app: &AppHandle, enabled: bool) {
        let mut running = self
            .running
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match (enabled, running.as_ref()) {
            (true, None) => *running = start(app.clone()),
            (false, Some(stop)) => {
                stop.store(true, Ordering::SeqCst);
                *running = None;
            }
            _ => {}
        }
    }
}

fn start(app: AppHandle) -> Option<Arc<AtomicBool>> {
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let spawned = thread::Builder::new()
        .name("cursor-poller".into())
        .spawn(move || poll(&app, &thread_stop));
    match spawned {
        Ok(_) => Some(stop),
        Err(error) => {
            log::error!("The spotlight cursor poller could not start: {error}");
            None
        }
    }
}

/// The thread is detached rather than joined: joining from the main thread
/// could deadlock because each cursor read waits for the main thread.
fn poll(app: &AppHandle, stop: &AtomicBool) {
    let mut last_sent: HashMap<String, Option<CursorPoint>> = HashMap::new();
    let mut failing = false;
    let mut last_resend = Instant::now();
    while !stop.load(Ordering::SeqCst) {
        if last_resend.elapsed() >= RESEND_INTERVAL {
            last_sent.clear();
            last_resend = Instant::now();
        }
        match app.cursor_position() {
            Ok(position) => {
                failing = false;
                let layout = app.state::<AppState>().layout();
                let points = cursor_points(&layout, position.x, position.y);
                send_changed(app, &mut last_sent, points, stop);
            }
            // Logged once per failure streak so a 60 Hz loop cannot flood the log.
            Err(error) if !failing => {
                failing = true;
                log::warn!("The cursor position could not be read: {error}");
            }
            Err(_) => {}
        }
        thread::sleep(POLL_INTERVAL);
    }
}

/// The cursor position in each overlay's CSS pixels (`None` off-monitor).
pub fn cursor_points(
    layout: &OverlayLayout,
    physical_x: f64,
    physical_y: f64,
) -> Vec<(String, Option<CursorPoint>)> {
    let space = DesktopSpace::current(layout.primary_scale);
    let cursor = space.cursor(physical_x, physical_y);
    layout
        .overlays
        .iter()
        .map(|(label, frame)| (label.clone(), space.rect(frame).local(cursor)))
        .collect()
}

fn send_changed(
    app: &AppHandle,
    last_sent: &mut HashMap<String, Option<CursorPoint>>,
    points: Vec<(String, Option<CursorPoint>)>,
    stop: &AtomicBool,
) {
    for (label, point) in points {
        if stop.load(Ordering::SeqCst) {
            return;
        }
        if last_sent.get(&label) == Some(&point) {
            continue;
        }
        match app.emit_to(label.as_str(), CURSOR_EVENT, point) {
            Ok(()) => {
                last_sent.insert(label, point);
            }
            Err(error) => log::warn!("The cursor could not be sent to {label}: {error}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::MonitorFrame;

    #[test]
    fn reports_the_cursor_only_on_its_monitor() {
        let layout = OverlayLayout {
            overlays: vec![
                (
                    "overlay-0".into(),
                    MonitorFrame {
                        x: 0,
                        y: 0,
                        width: 1920,
                        height: 1080,
                        scale: 1.0,
                    },
                ),
                (
                    "overlay-1".into(),
                    MonitorFrame {
                        x: 1920,
                        y: 0,
                        width: 1920,
                        height: 1080,
                        scale: 1.0,
                    },
                ),
            ],
            primary_scale: 1.0,
        };
        let points = cursor_points(&layout, 2000.0, 30.0);
        assert_eq!(points[0], ("overlay-0".into(), None));
        assert_eq!(
            points[1],
            ("overlay-1".into(), Some(CursorPoint { x: 80.0, y: 30.0 }))
        );
    }
}
