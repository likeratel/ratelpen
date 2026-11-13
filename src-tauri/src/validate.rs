//! Small validation helpers shared by settings and session checks.

use std::ops::RangeInclusive;

const HEX_COLOR_DIGITS: usize = 6;

/// Accepts exactly `#rrggbb` (either letter case), like `^#[0-9a-fA-F]{6}$`.
pub fn is_hex_color(value: &str) -> bool {
    match value.strip_prefix('#') {
        Some(digits) => {
            digits.len() == HEX_COLOR_DIGITS && digits.bytes().all(|byte| byte.is_ascii_hexdigit())
        }
        None => false,
    }
}

/// Returns an error naming `field` when `value` is outside `range`.
pub fn check_range(field: &str, value: u32, range: RangeInclusive<u32>) -> Result<(), String> {
    if range.contains(&value) {
        Ok(())
    } else {
        Err(format!(
            "{field} must be between {} and {}.",
            range.start(),
            range.end()
        ))
    }
}

pub fn check_color(field: &str, value: &str) -> Result<(), String> {
    if is_hex_color(value) {
        Ok(())
    } else {
        Err(format!("{field} must be a colour like #ff3b30."))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_six_digit_hex_colours() {
        for valid in ["#ff3b30", "#FFFFFF", "#000000", "#0a84Ff"] {
            assert!(is_hex_color(valid), "{valid}");
        }
        for invalid in [
            "",
            "#",
            "ff3b30",
            "#fff",
            "#ff3b3",
            "#ff3b300",
            "#gg0000",
            " #ff3b30",
            "#ff3b30 ",
            "red",
            "#ff3b3０",
        ] {
            assert!(!is_hex_color(invalid), "{invalid}");
        }
    }

    #[test]
    fn range_check_is_inclusive_and_rejects_outside() {
        assert!(check_range("width", 1, 1..=40).is_ok());
        assert!(check_range("width", 40, 1..=40).is_ok());
        assert!(check_range("width", 0, 1..=40).is_err());
        assert!(check_range("width", 41, 1..=40).is_err());
    }
}
