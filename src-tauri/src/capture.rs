//! Screenshot of the calling overlay's monitor, annotations included.

use std::{
    fs::{self, File, OpenOptions},
    io::{BufWriter, ErrorKind, Write},
    path::{Path, PathBuf},
};

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use tauri::{image::Image, AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use xcap::image::{ImageFormat, RgbaImage};

use crate::{
    error::{IpcError, IpcResult, CAPTURE_FAILED, CAPTURE_PERMISSION},
    geometry::{DesktopSpace, MonitorFrame},
    overlay, platform,
    state::AppState,
};

const CAPTURE_FOLDER: &str = "ratelpen";
const FILE_PREFIX: &str = "ratelpen-";
const FILE_EXTENSION: &str = "png";
const TIMESTAMP_FORMAT: &str = "%Y%m%d-%H%M%S";
/// Same-second captures get `-2`, `-3`, … up to this many attempts.
const MAX_NAME_ATTEMPTS: u32 = 100;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Destination {
    File,
    Clipboard,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct CaptureResult {
    pub path: Option<String>,
}

fn failed() -> IpcError {
    IpcError::new(CAPTURE_FAILED, "The screen could not be captured.")
}

pub async fn capture(
    app: &AppHandle,
    label: &str,
    destination: Destination,
) -> IpcResult<CaptureResult> {
    if !overlay::is_overlay(label) {
        return Err(IpcError::new(
            CAPTURE_FAILED,
            "Capture can only be started from an overlay.",
        ));
    }
    let state = app.state::<AppState>();
    // One capture at a time, so a misbehaving page cannot flood the disk.
    let _capturing = state
        .capturing
        .try_lock()
        .map_err(|_| IpcError::new(CAPTURE_FAILED, "A capture is already in progress."))?;
    let layout = state.layout();
    let frame = layout
        .overlays
        .iter()
        .find(|(overlay_label, _)| overlay_label == label)
        .map(|(_, frame)| *frame)
        .ok_or_else(|| {
            log::error!("No display is recorded for {label}.");
            failed()
        })?;
    if !platform::ensure_screen_capture_permission() {
        return Err(IpcError::new(
            CAPTURE_PERMISSION,
            "Allow screen recording for ratelpen in System Settings, then try again.",
        ));
    }
    let worker_app = app.clone();
    let primary_scale = layout.primary_scale;
    tauri::async_runtime::spawn_blocking(move || {
        let image = grab(&frame, primary_scale)?;
        deliver(&worker_app, image, destination)
    })
    .await
    .map_err(|error| {
        log::error!("The capture task stopped unexpectedly: {error}");
        failed()
    })?
}

fn grab(frame: &MonitorFrame, primary_scale: f64) -> IpcResult<RgbaImage> {
    // xcap looks monitors up in the desktop's own units (points on macOS).
    let (x, y) = DesktopSpace::current(primary_scale).rect(frame).center();
    let monitor =
        xcap::Monitor::from_point(x.round() as i32, y.round() as i32).map_err(|error| {
            log::error!("The display to capture could not be found: {error}");
            failed()
        })?;
    monitor.capture_image().map_err(|error| {
        log::error!("The display could not be captured: {error}");
        failed()
    })
}

fn deliver(
    app: &AppHandle,
    image: RgbaImage,
    destination: Destination,
) -> IpcResult<CaptureResult> {
    match destination {
        Destination::File => {
            let pictures = app.path().picture_dir().map_err(|error| {
                log::error!("The Pictures folder is unavailable: {error}");
                failed()
            })?;
            let path = save_png(&pictures.join(CAPTURE_FOLDER), &image)?;
            Ok(CaptureResult {
                path: Some(path.to_string_lossy().into_owned()),
            })
        }
        Destination::Clipboard => {
            let (width, height) = image.dimensions();
            let picture = Image::new_owned(image.into_raw(), width, height);
            app.clipboard().write_image(&picture).map_err(|error| {
                log::error!("The capture could not be copied: {error}");
                failed()
            })?;
            Ok(CaptureResult { path: None })
        }
    }
}

/// `ratelpen-YYYYMMDD-HHMMSS.png`, or `…-N.png` for the Nth same-second capture.
pub fn capture_file_name(time: &NaiveDateTime, attempt: u32) -> String {
    let stamp = time.format(TIMESTAMP_FORMAT);
    if attempt <= 1 {
        format!("{FILE_PREFIX}{stamp}.{FILE_EXTENSION}")
    } else {
        format!("{FILE_PREFIX}{stamp}-{attempt}.{FILE_EXTENSION}")
    }
}

/// Creates a new file (never overwriting) and writes the PNG into it.
fn save_png(directory: &Path, image: &RgbaImage) -> IpcResult<PathBuf> {
    fs::create_dir_all(directory).map_err(|error| {
        log::error!("The capture folder could not be created: {error}");
        failed()
    })?;
    let (path, file) = create_unique(directory, &chrono::Local::now().naive_local())?;
    let mut writer = BufWriter::new(file);
    let written = image
        .write_to(&mut writer, ImageFormat::Png)
        .map_err(|error| error.to_string())
        .and_then(|()| writer.flush().map_err(|error| error.to_string()));
    if let Err(error) = written {
        log::error!("The capture could not be written: {error}");
        if let Err(cleanup) = fs::remove_file(&path) {
            log::warn!("The partial capture file could not be removed: {cleanup}");
        }
        return Err(failed());
    }
    Ok(path)
}

fn create_unique(directory: &Path, time: &NaiveDateTime) -> IpcResult<(PathBuf, File)> {
    for attempt in 1..=MAX_NAME_ATTEMPTS {
        let path = directory.join(capture_file_name(time, attempt));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => {
                log::error!("The capture file could not be created: {error}");
                return Err(failed());
            }
        }
    }
    log::error!("Too many captures in the same second.");
    Err(failed())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn time() -> NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(2026, 3, 7)
            .unwrap()
            .and_hms_opt(9, 5, 2)
            .unwrap()
    }

    #[test]
    fn file_names_follow_the_contract() {
        assert_eq!(
            capture_file_name(&time(), 1),
            "ratelpen-20260307-090502.png"
        );
        assert_eq!(
            capture_file_name(&time(), 3),
            "ratelpen-20260307-090502-3.png"
        );
    }

    #[test]
    fn same_second_captures_never_overwrite() {
        let directory = tempfile::tempdir().unwrap();
        let (first, _) = create_unique(directory.path(), &time()).unwrap();
        let (second, _) = create_unique(directory.path(), &time()).unwrap();
        assert_ne!(first, second);
        assert!(second.ends_with("ratelpen-20260307-090502-2.png"));
    }

    #[test]
    fn saves_a_png() {
        let directory = tempfile::tempdir().unwrap();
        let image = RgbaImage::from_pixel(2, 2, xcap::image::Rgba([255, 0, 0, 255]));
        let path = save_png(&directory.path().join("ratelpen"), &image).unwrap();
        let bytes = fs::read(path).unwrap();
        assert_eq!(&bytes[1..4], b"PNG");
    }

    #[test]
    fn destination_parses_lowercase_only() {
        assert_eq!(
            serde_json::from_str::<Destination>("\"clipboard\"").unwrap(),
            Destination::Clipboard
        );
        assert!(serde_json::from_str::<Destination>("\"File\"").is_err());
    }
}
