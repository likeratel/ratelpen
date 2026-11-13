use serde::Serialize;

/// Rejected value of every command, as described in `CONTRACT.md`.
///
/// `message` is shown to the user, so it never carries paths, OS error text or
/// other internal detail. Internal detail goes to the log at the failure site.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct IpcError {
    pub code: &'static str,
    pub message: String,
}

pub const INVALID_SESSION: &str = "invalid_session";
pub const INVALID_SETTINGS: &str = "invalid_settings";
pub const INVALID_ARGUMENT: &str = "invalid_argument";
pub const SHORTCUT_UNAVAILABLE: &str = "shortcut_unavailable";
pub const SETTINGS_SAVE_FAILED: &str = "settings_save_failed";
pub const AUTOSTART_FAILED: &str = "autostart_failed";
pub const CAPTURE_PERMISSION: &str = "capture_permission";
pub const CAPTURE_FAILED: &str = "capture_failed";
pub const WINDOW_FAILED: &str = "window_failed";

impl IpcError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn window(message: impl Into<String>) -> Self {
        Self::new(WINDOW_FAILED, message)
    }
}

impl std::fmt::Display for IpcError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for IpcError {}

pub type IpcResult<T> = Result<T, IpcError>;

/// Logs `detail` and returns a window error with a user-safe message.
pub fn window_error(context: &str, detail: impl std::fmt::Display) -> IpcError {
    log::error!("{context}: {detail}");
    IpcError::window(format!("{context}."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_and_message() {
        let error = IpcError::new(CAPTURE_FAILED, "The screen could not be captured.");
        let json = serde_json::to_value(&error).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "code": "capture_failed",
                "message": "The screen could not be captured."
            })
        );
    }
}
