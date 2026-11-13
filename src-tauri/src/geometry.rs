//! Monitor geometry and cursor coordinate conversion (pure, platform-neutral).
//!
//! The windowing layer reports monitor origins and the global cursor in
//! physical pixels, but what "physical" means differs by platform:
//! - macOS: the desktop is laid out in points. A monitor origin is its point
//!   origin times that monitor's scale; the cursor is its point position times
//!   the primary monitor's scale.
//! - Windows (per-monitor DPI aware): the desktop is laid out in physical
//!   pixels directly.

use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MonitorFrame {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
}

/// The global coordinate space the desktop is laid out in.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum DesktopSpace {
    /// Points; the cursor is reported scaled by the primary monitor's factor.
    Points { primary_scale: f64 },
    /// Physical pixels.
    Pixels,
}

/// A monitor rectangle in desktop units, plus how many desktop units make one
/// CSS pixel inside that monitor's overlay.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DesktopRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub units_per_css: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct CursorPoint {
    pub x: f64,
    pub y: f64,
}

impl DesktopSpace {
    pub fn current(primary_scale: f64) -> Self {
        if cfg!(target_os = "macos") {
            Self::Points {
                primary_scale: sanitize_scale(primary_scale),
            }
        } else {
            Self::Pixels
        }
    }

    pub fn rect(self, frame: &MonitorFrame) -> DesktopRect {
        let scale = sanitize_scale(frame.scale);
        match self {
            Self::Points { .. } => DesktopRect {
                x: f64::from(frame.x) / scale,
                y: f64::from(frame.y) / scale,
                width: f64::from(frame.width) / scale,
                height: f64::from(frame.height) / scale,
                units_per_css: 1.0,
            },
            Self::Pixels => DesktopRect {
                x: f64::from(frame.x),
                y: f64::from(frame.y),
                width: f64::from(frame.width),
                height: f64::from(frame.height),
                units_per_css: scale,
            },
        }
    }

    pub fn cursor(self, physical_x: f64, physical_y: f64) -> (f64, f64) {
        match self {
            Self::Points { primary_scale } => {
                (physical_x / primary_scale, physical_y / primary_scale)
            }
            Self::Pixels => (physical_x, physical_y),
        }
    }
}

impl DesktopRect {
    /// The point in this monitor's CSS pixels, or `None` when outside it.
    pub fn local(&self, cursor: (f64, f64)) -> Option<CursorPoint> {
        let (x, y) = cursor;
        let inside =
            x >= self.x && y >= self.y && x < self.x + self.width && y < self.y + self.height;
        inside.then(|| CursorPoint {
            x: (x - self.x) / self.units_per_css,
            y: (y - self.y) / self.units_per_css,
        })
    }

    pub fn center(&self) -> (f64, f64) {
        (self.x + self.width / 2.0, self.y + self.height / 2.0)
    }
}

fn sanitize_scale(scale: f64) -> f64 {
    if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RETINA: MonitorFrame = MonitorFrame {
        x: 0,
        y: 0,
        width: 3024,
        height: 1964,
        scale: 2.0,
    };
    // A 1x external display to the right of the 1512pt-wide Retina display.
    const EXTERNAL_POINTS: MonitorFrame = MonitorFrame {
        x: 1512,
        y: 0,
        width: 1920,
        height: 1080,
        scale: 1.0,
    };

    #[test]
    fn points_space_maps_cursor_into_the_right_monitor() {
        let space = DesktopSpace::Points { primary_scale: 2.0 };
        let cursor = space.cursor(2000.0, 600.0); // (1000pt, 300pt)
        let retina = space.rect(&RETINA);
        let external = space.rect(&EXTERNAL_POINTS);
        assert_eq!(
            retina.local(cursor),
            Some(CursorPoint {
                x: 1000.0,
                y: 300.0
            })
        );
        assert_eq!(external.local(cursor), None);
        let on_external = space.cursor(2.0 * 1600.0, 2.0 * 50.0);
        assert_eq!(
            external.local(on_external),
            Some(CursorPoint { x: 88.0, y: 50.0 })
        );
        assert_eq!(retina.local(on_external), None);
    }

    #[test]
    fn pixel_space_divides_by_the_monitor_scale() {
        let space = DesktopSpace::Pixels;
        let monitor = MonitorFrame {
            x: -2560,
            y: 0,
            width: 2560,
            height: 1440,
            scale: 1.25,
        };
        let rect = space.rect(&monitor);
        let cursor = space.cursor(-1310.0, 500.0);
        assert_eq!(
            rect.local(cursor),
            Some(CursorPoint {
                x: 1000.0,
                y: 400.0
            })
        );
        assert_eq!(rect.local(space.cursor(0.0, 10.0)), None);
    }

    #[test]
    fn right_and_bottom_edges_are_exclusive() {
        let rect = DesktopSpace::Pixels.rect(&EXTERNAL_POINTS);
        assert!(rect.local((1512.0, 0.0)).is_some());
        assert!(rect.local((1512.0 + 1920.0, 10.0)).is_none());
        assert!(rect.local((1600.0, 1080.0)).is_none());
    }

    #[test]
    fn invalid_scale_falls_back_to_one() {
        let frame = MonitorFrame {
            scale: 0.0,
            ..EXTERNAL_POINTS
        };
        let rect = DesktopSpace::Pixels.rect(&frame);
        assert_eq!(rect.units_per_css, 1.0);
        assert_eq!(rect.center(), (1512.0 + 960.0, 540.0));
    }
}
