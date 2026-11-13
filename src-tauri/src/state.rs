//! Shared application state.
//!
//! Locking rules:
//! - The `std` mutexes guard plain data and are held only for a copy or an
//!   assignment, never across a window, tray or shortcut call. Main-thread
//!   handlers may take them without risking a deadlock.
//! - `transitions` and `saving` are async mutexes that serialize multi-step
//!   changes (window side effects, shortcut re-registration). They are only
//!   taken from async tasks, never on the main thread, because those steps
//!   wait for the main thread.

use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};

use tauri::async_runtime::Mutex as AsyncMutex;

use crate::{
    geometry::MonitorFrame, platform::PreviousFocus, session::Session, settings::Settings,
};

/// Overlay labels and the monitor each one covers, in monitor order.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct OverlayLayout {
    pub overlays: Vec<(String, MonitorFrame)>,
    pub primary_scale: f64,
}

pub struct AppState {
    pub settings_path: PathBuf,
    settings: Mutex<Settings>,
    session: Mutex<Session>,
    content: Mutex<HashSet<String>>,
    layout: Mutex<OverlayLayout>,
    previous_focus: Mutex<Option<PreviousFocus>>,
    pub transitions: AsyncMutex<()>,
    pub saving: AsyncMutex<()>,
    pub capturing: AsyncMutex<()>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| {
        log::error!("Recovering state after a panic while it was locked.");
        poisoned.into_inner()
    })
}

impl AppState {
    pub fn new(settings_path: PathBuf, settings: Settings) -> Self {
        let session = Session::from_settings(&settings);
        Self {
            settings_path,
            settings: Mutex::new(settings),
            session: Mutex::new(session),
            content: Mutex::new(HashSet::new()),
            layout: Mutex::new(OverlayLayout::default()),
            previous_focus: Mutex::new(None),
            transitions: AsyncMutex::new(()),
            saving: AsyncMutex::new(()),
            capturing: AsyncMutex::new(()),
        }
    }

    pub fn settings(&self) -> Settings {
        lock(&self.settings).clone()
    }

    pub fn set_settings(&self, settings: Settings) {
        *lock(&self.settings) = settings;
    }

    pub fn session(&self) -> Session {
        lock(&self.session).clone()
    }

    pub fn set_session(&self, session: Session) {
        *lock(&self.session) = session;
    }

    /// Records whether `label` has content and returns whether any overlay does.
    pub fn set_content(&self, label: &str, has_content: bool) -> bool {
        let mut content = lock(&self.content);
        if has_content {
            content.insert(label.to_owned());
        } else {
            content.remove(label);
        }
        !content.is_empty()
    }

    pub fn clear_content(&self) {
        lock(&self.content).clear();
    }

    pub fn has_content(&self) -> bool {
        !lock(&self.content).is_empty()
    }

    pub fn layout(&self) -> OverlayLayout {
        lock(&self.layout).clone()
    }

    pub fn set_layout(&self, layout: OverlayLayout) {
        *lock(&self.layout) = layout;
    }

    pub fn remember_focus(&self, focus: Option<PreviousFocus>) {
        *lock(&self.previous_focus) = focus;
    }

    pub fn take_focus(&self) -> Option<PreviousFocus> {
        lock(&self.previous_focus).take()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_is_tracked_per_overlay() {
        let state = AppState::new(PathBuf::from("settings.json"), Settings::default());
        assert!(!state.has_content());
        assert!(state.set_content("overlay-0", true));
        assert!(state.set_content("overlay-1", true));
        assert!(state.set_content("overlay-0", false));
        assert!(!state.set_content("overlay-1", false));
        state.set_content("overlay-1", true);
        state.clear_content();
        assert!(!state.has_content());
    }
}
