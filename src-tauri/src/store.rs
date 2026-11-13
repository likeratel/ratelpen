//! Loads and atomically saves `settings.json` in the app config directory.

use std::{
    fs,
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
};

use crate::settings::Settings;

pub const SETTINGS_FILE: &str = "settings.json";
/// Settings are a few hundred bytes; anything far larger is not ours.
const MAX_SETTINGS_BYTES: u64 = 64 * 1024;

/// Why stored settings were replaced by defaults.
#[derive(Debug, PartialEq, Eq)]
pub enum LoadOutcome {
    Loaded,
    Missing,
    Unreadable(String),
    Corrupt(String),
    Invalid(String),
}

pub fn settings_path(config_dir: &Path) -> PathBuf {
    config_dir.join(SETTINGS_FILE)
}

/// Reads settings, falling back to defaults when the file is missing,
/// unreadable, malformed or out of range. The outcome says which.
pub fn load(path: &Path) -> (Settings, LoadOutcome) {
    match fs::metadata(path) {
        Ok(metadata) if !metadata.is_file() || metadata.len() > MAX_SETTINGS_BYTES => {
            return (
                Settings::default(),
                LoadOutcome::Unreadable("not a regular file of a sensible size".into()),
            )
        }
        // A missing or unreadable file is reported by the read below.
        Ok(_) | Err(_) => {}
    }
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return (Settings::default(), LoadOutcome::Missing)
        }
        Err(error) => {
            return (
                Settings::default(),
                LoadOutcome::Unreadable(error.to_string()),
            )
        }
    };
    parse(&text)
}

fn parse(text: &str) -> (Settings, LoadOutcome) {
    let settings = match serde_json::from_str::<Settings>(text) {
        Ok(settings) => settings,
        Err(error) => return (Settings::default(), LoadOutcome::Corrupt(error.to_string())),
    };
    match settings.validate() {
        Ok(()) => (settings, LoadOutcome::Loaded),
        Err(reason) => (Settings::default(), LoadOutcome::Invalid(reason)),
    }
}

/// Writes to a temporary file in the same directory, syncs it, then renames it
/// over `path`, so a crash never leaves a half-written settings file.
pub fn save(path: &Path, settings: &Settings) -> std::io::Result<()> {
    let directory = path
        .parent()
        .ok_or_else(|| std::io::Error::new(ErrorKind::InvalidInput, "no parent directory"))?;
    fs::create_dir_all(directory)?;
    let text = serde_json::to_string_pretty(settings).map_err(std::io::Error::other)?;
    let mut temporary = tempfile::Builder::new()
        .prefix(".settings-")
        .suffix(".tmp")
        .tempfile_in(directory)?;
    temporary.write_all(text.as_bytes())?;
    temporary.write_all(b"\n")?;
    temporary.as_file().sync_all()?;
    temporary.persist(path).map_err(|error| error.error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_yields_defaults() {
        let directory = tempfile::tempdir().unwrap();
        let (settings, outcome) = load(&settings_path(directory.path()));
        assert_eq!(settings, Settings::default());
        assert_eq!(outcome, LoadOutcome::Missing);
    }

    #[test]
    fn save_then_load_round_trips_and_leaves_no_temp_files() {
        let directory = tempfile::tempdir().unwrap();
        let path = settings_path(&directory.path().join("nested"));
        let settings = Settings {
            fade_seconds: 12,
            clear_on_exit: true,
            ..Settings::default()
        };
        save(&path, &settings).unwrap();
        save(&path, &settings).unwrap();
        let (loaded, outcome) = load(&path);
        assert_eq!(outcome, LoadOutcome::Loaded);
        assert_eq!(loaded, settings);
        let entries = fs::read_dir(path.parent().unwrap()).unwrap().count();
        assert_eq!(entries, 1);
    }

    #[test]
    fn corrupt_file_yields_defaults() {
        let (settings, outcome) = parse("{ not json");
        assert_eq!(settings, Settings::default());
        assert!(matches!(outcome, LoadOutcome::Corrupt(_)));
    }

    #[test]
    fn out_of_range_file_yields_defaults() {
        let mut json = serde_json::to_value(Settings::default()).unwrap();
        json["defaultWidth"] = serde_json::json!(99);
        let (settings, outcome) = parse(&json.to_string());
        assert_eq!(settings, Settings::default());
        assert!(matches!(outcome, LoadOutcome::Invalid(_)));
    }
}
