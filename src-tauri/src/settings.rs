//! Persisted settings model and validation (`Settings` in `CONTRACT.md`).

use std::str::FromStr;

use serde::{Deserialize, Serialize};
use tauri_plugin_global_shortcut::Shortcut;

use crate::validate::{check_color, check_range};

pub const SETTINGS_VERSION: u32 = 1;
pub const PALETTE_SIZE: usize = 8;
pub const WIDTH_RANGE: std::ops::RangeInclusive<u32> = 1..=40;
pub const FADE_SECONDS_RANGE: std::ops::RangeInclusive<u32> = 1..=60;
pub const SPOTLIGHT_RADIUS_RANGE: std::ops::RangeInclusive<u32> = 20..=300;

const DEFAULT_PALETTE: [&str; PALETTE_SIZE] = [
    "#ff3b30", "#ff9500", "#ffd60a", "#34c759", "#0a84ff", "#bf5af2", "#ffffff", "#1c1c1e",
];
const DEFAULT_COLOR: &str = "#ff3b30";
const DEFAULT_WIDTH: u32 = 4;
const DEFAULT_FADE_SECONDS: u32 = 5;
const DEFAULT_SPOTLIGHT_RADIUS: u32 = 60;
/// Alt+Tab belongs to the window switcher on Windows and most Linux desktops.
#[cfg(target_os = "macos")]
const DEFAULT_TOGGLE_DRAW: &str = "Alt+Tab";
#[cfg(not(target_os = "macos"))]
const DEFAULT_TOGGLE_DRAW: &str = "Alt+Shift+D";
const DEFAULT_CLEAR_ALL: &str = "Alt+Shift+C";
const DEFAULT_TOGGLE_SPOTLIGHT: &str = "Alt+Shift+S";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SpotlightStyle {
    Halo,
    Focus,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Shortcuts {
    pub toggle_draw: String,
    pub clear_all: String,
    pub toggle_spotlight: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub version: u32,
    pub shortcuts: Shortcuts,
    pub palette: Vec<String>,
    pub default_color: String,
    pub default_width: u32,
    pub fade_seconds: u32,
    pub fade_by_default: bool,
    pub spotlight_style: SpotlightStyle,
    pub spotlight_radius: u32,
    pub clear_on_exit: bool,
    pub launch_at_login: bool,
    /// Added after 0.1.0; a settings file without it keeps working.
    #[serde(default = "enabled")]
    pub lock_while_drawing: bool,
}

fn enabled() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            shortcuts: Shortcuts {
                toggle_draw: DEFAULT_TOGGLE_DRAW.into(),
                clear_all: DEFAULT_CLEAR_ALL.into(),
                toggle_spotlight: DEFAULT_TOGGLE_SPOTLIGHT.into(),
            },
            palette: DEFAULT_PALETTE
                .iter()
                .map(|color| (*color).into())
                .collect(),
            default_color: DEFAULT_COLOR.into(),
            default_width: DEFAULT_WIDTH,
            fade_seconds: DEFAULT_FADE_SECONDS,
            fade_by_default: false,
            spotlight_style: SpotlightStyle::Focus,
            spotlight_radius: DEFAULT_SPOTLIGHT_RADIUS,
            clear_on_exit: true,
            launch_at_login: false,
            lock_while_drawing: true,
        }
    }
}

impl Settings {
    /// Validates every field. Out-of-range numbers are rejected, never clamped.
    pub fn validate(&self) -> Result<(), String> {
        if self.version != SETTINGS_VERSION {
            return Err(format!("version must be {SETTINGS_VERSION}."));
        }
        self.shortcuts.validate()?;
        if self.palette.len() != PALETTE_SIZE {
            return Err(format!(
                "palette must contain exactly {PALETTE_SIZE} colours."
            ));
        }
        for color in &self.palette {
            check_color("palette", color)?;
        }
        check_color("defaultColor", &self.default_color)?;
        check_range("defaultWidth", self.default_width, WIDTH_RANGE)?;
        check_range("fadeSeconds", self.fade_seconds, FADE_SECONDS_RANGE)?;
        check_range(
            "spotlightRadius",
            self.spotlight_radius,
            SPOTLIGHT_RADIUS_RANGE,
        )
    }
}

/// The global shortcut actions, in a fixed order.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ShortcutAction {
    ToggleDraw,
    ClearAll,
    ToggleSpotlight,
}

impl Shortcuts {
    /// Non-empty accelerators paired with their action.
    pub fn bindings(&self) -> Vec<(ShortcutAction, &str)> {
        [
            (ShortcutAction::ToggleDraw, self.toggle_draw.as_str()),
            (ShortcutAction::ClearAll, self.clear_all.as_str()),
            (
                ShortcutAction::ToggleSpotlight,
                self.toggle_spotlight.as_str(),
            ),
        ]
        .into_iter()
        .filter(|(_, accelerator)| !accelerator.is_empty())
        .collect()
    }

    /// Parses every non-empty accelerator. Two actions may not share a shortcut.
    pub fn parsed(&self) -> Result<Vec<(ShortcutAction, Shortcut)>, String> {
        let mut parsed: Vec<(ShortcutAction, Shortcut)> = Vec::new();
        for (action, accelerator) in self.bindings() {
            let shortcut = Shortcut::from_str(accelerator)
                .map_err(|_| format!("\"{accelerator}\" is not a valid shortcut."))?;
            if parsed
                .iter()
                .any(|(_, existing)| existing.id() == shortcut.id())
            {
                return Err(format!(
                    "\"{accelerator}\" is assigned to more than one action."
                ));
            }
            parsed.push((action, shortcut));
        }
        Ok(parsed)
    }

    fn validate(&self) -> Result<(), String> {
        self.parsed().map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with(update: impl FnOnce(&mut Settings)) -> Settings {
        let mut settings = Settings::default();
        update(&mut settings);
        settings
    }

    #[test]
    fn a_settings_file_from_before_the_lock_option_still_loads() {
        let mut json = serde_json::to_value(Settings::default()).unwrap();
        json.as_object_mut().unwrap().remove("lockWhileDrawing");
        let settings: Settings = serde_json::from_value(json).unwrap();
        assert!(settings.lock_while_drawing);
    }

    #[test]
    fn defaults_match_the_contract_and_are_valid() {
        let settings = Settings::default();
        assert!(settings.validate().is_ok());
        let json = serde_json::to_value(&settings).unwrap();
        assert_eq!(json["shortcuts"]["toggleDraw"], DEFAULT_TOGGLE_DRAW);
        assert_eq!(json["palette"][7], "#1c1c1e");
        assert_eq!(json["spotlightStyle"], "focus");
        assert_eq!(json["fadeSeconds"], 5);
        assert_eq!(json["spotlightRadius"], 60);
        assert_eq!(json["version"], 1);
    }

    #[test]
    fn round_trips_through_camel_case_json() {
        let settings = Settings::default();
        let text = serde_json::to_string(&settings).unwrap();
        assert_eq!(serde_json::from_str::<Settings>(&text).unwrap(), settings);
    }

    #[test]
    fn rejects_out_of_range_numbers_instead_of_clamping() {
        let cases = [
            with(|s| s.default_width = 0),
            with(|s| s.default_width = 41),
            with(|s| s.fade_seconds = 0),
            with(|s| s.fade_seconds = 61),
            with(|s| s.spotlight_radius = 19),
            with(|s| s.spotlight_radius = 301),
            with(|s| s.version = 2),
        ];
        for settings in cases {
            assert!(settings.validate().is_err(), "{settings:?}");
        }
        assert!(with(|s| s.spotlight_radius = 300).validate().is_ok());
        assert!(with(|s| s.fade_seconds = 60).validate().is_ok());
    }

    #[test]
    fn rejects_bad_palette_and_colours() {
        assert!(with(|s| s.palette.truncate(7)).validate().is_err());
        assert!(with(|s| s.palette.push("#000000".into()))
            .validate()
            .is_err());
        assert!(with(|s| s.palette[3] = "green".into()).validate().is_err());
        assert!(with(|s| s.default_color = "#12345".into())
            .validate()
            .is_err());
    }

    #[test]
    fn empty_shortcuts_are_allowed_and_skipped() {
        let settings = with(|s| {
            s.shortcuts.clear_all = String::new();
            s.shortcuts.toggle_spotlight = String::new();
        });
        assert!(settings.validate().is_ok());
        let bindings = settings.shortcuts.parsed().unwrap();
        assert_eq!(bindings.len(), 1);
        assert_eq!(bindings[0].0, ShortcutAction::ToggleDraw);
    }

    #[test]
    fn rejects_invalid_and_duplicate_shortcuts() {
        assert!(with(|s| s.shortcuts.toggle_draw = "Alt+Nope".into())
            .validate()
            .is_err());
        assert!(with(|s| {
            s.shortcuts.toggle_draw = "Alt+Shift+D".into();
            s.shortcuts.clear_all = "Shift+Alt+D".into();
        })
        .validate()
        .is_err());
    }

    #[test]
    fn rejects_unknown_or_missing_fields() {
        let mut json = serde_json::to_value(Settings::default()).unwrap();
        json["extra"] = serde_json::json!(true);
        assert!(serde_json::from_value::<Settings>(json).is_err());
        let mut json = serde_json::to_value(Settings::default()).unwrap();
        json.as_object_mut().unwrap().remove("palette");
        assert!(serde_json::from_value::<Settings>(json).is_err());
    }
}
