//! Shared, non-persisted drawing session (`Session` in `CONTRACT.md`).

use serde::{Deserialize, Serialize};

use crate::{
    settings::{Settings, WIDTH_RANGE},
    validate::{check_color, check_range},
};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Tool {
    Pen,
    Highlighter,
    Line,
    Arrow,
    Rect,
    Ellipse,
    Text,
    Eraser,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Board {
    None,
    White,
    Black,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub active: bool,
    pub tool: Tool,
    pub color: String,
    pub width: u32,
    pub fade_enabled: bool,
    pub spotlight: bool,
    pub board: Board,
}

/// `Partial<Session>`: absent fields keep their current value.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionPatch {
    pub active: Option<bool>,
    pub tool: Option<Tool>,
    pub color: Option<String>,
    pub width: Option<u32>,
    pub fade_enabled: Option<bool>,
    pub spotlight: Option<bool>,
    pub board: Option<Board>,
}

impl Session {
    pub fn from_settings(settings: &Settings) -> Self {
        Self {
            active: false,
            tool: Tool::Pen,
            color: settings.default_color.clone(),
            width: settings.default_width,
            fade_enabled: settings.fade_by_default,
            spotlight: false,
            board: Board::None,
        }
    }

    /// Returns a new session with `patch` applied, or the reason it is invalid.
    /// `board` is forced to `none` whenever draw mode ends up off.
    pub fn apply(&self, patch: &SessionPatch) -> Result<Self, String> {
        patch.validate()?;
        let active = patch.active.unwrap_or(self.active);
        let board = if active {
            patch.board.unwrap_or(self.board)
        } else {
            Board::None
        };
        Ok(Self {
            active,
            tool: patch.tool.unwrap_or(self.tool),
            color: patch.color.clone().unwrap_or_else(|| self.color.clone()),
            width: patch.width.unwrap_or(self.width),
            fade_enabled: patch.fade_enabled.unwrap_or(self.fade_enabled),
            spotlight: patch.spotlight.unwrap_or(self.spotlight),
            board,
        })
    }
}

impl SessionPatch {
    pub fn active(active: bool) -> Self {
        Self {
            active: Some(active),
            ..Self::default()
        }
    }

    pub fn spotlight(spotlight: bool) -> Self {
        Self {
            spotlight: Some(spotlight),
            ..Self::default()
        }
    }

    fn validate(&self) -> Result<(), String> {
        if let Some(color) = &self.color {
            check_color("color", color)?;
        }
        if let Some(width) = self.width {
            check_range("width", width, WIDTH_RANGE)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session() -> Session {
        Session::from_settings(&Settings::default())
    }

    fn patch(json: serde_json::Value) -> Result<SessionPatch, serde_json::Error> {
        serde_json::from_value(json)
    }

    #[test]
    fn starts_from_settings_defaults() {
        let settings = Settings {
            default_color: "#0a84ff".into(),
            default_width: 9,
            fade_by_default: true,
            ..Settings::default()
        };
        let session = Session::from_settings(&settings);
        assert!(!session.active);
        assert_eq!(session.color, "#0a84ff");
        assert_eq!(session.width, 9);
        assert!(session.fade_enabled);
        assert_eq!(session.board, Board::None);
    }

    #[test]
    fn applies_only_present_fields() {
        let next = session()
            .apply(&patch(serde_json::json!({"tool": "arrow", "width": 12})).unwrap())
            .unwrap();
        assert_eq!(next.tool, Tool::Arrow);
        assert_eq!(next.width, 12);
        assert_eq!(next.color, session().color);
    }

    #[test]
    fn rejects_invalid_values() {
        for json in [
            serde_json::json!({"width": 0}),
            serde_json::json!({"width": 41}),
            serde_json::json!({"color": "red"}),
        ] {
            assert!(session().apply(&patch(json).unwrap()).is_err());
        }
        for json in [
            serde_json::json!({"tool": "brush"}),
            serde_json::json!({"board": "grey"}),
            serde_json::json!({"width": 2.5}),
            serde_json::json!({"unknown": true}),
        ] {
            assert!(patch(json).is_err());
        }
    }

    #[test]
    fn board_is_none_whenever_inactive() {
        let inactive = session()
            .apply(&patch(serde_json::json!({"board": "white"})).unwrap())
            .unwrap();
        assert_eq!(inactive.board, Board::None);
        let active = session()
            .apply(&patch(serde_json::json!({"active": true, "board": "black"})).unwrap())
            .unwrap();
        assert_eq!(active.board, Board::Black);
        let off = active.apply(&SessionPatch::active(false)).unwrap();
        assert_eq!(off.board, Board::None);
    }

    #[test]
    fn serializes_camel_case() {
        let json = serde_json::to_value(session()).unwrap();
        assert_eq!(json["fadeEnabled"], false);
        assert_eq!(json["board"], "none");
        assert_eq!(json["tool"], "pen");
    }
}
