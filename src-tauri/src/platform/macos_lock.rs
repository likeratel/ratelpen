//! Keeps the keyboard inside ratelpen while draw mode is on.
//!
//! An event tap at the HID level takes key presses and trackpad gestures
//! before the system sees them, so the app switcher, Mission Control and
//! other apps' shortcuts do not fire. The key presses are handed straight to
//! this process, so typing and ratelpen's own keys keep working.
//!
//! Leaving never depends on the overlay's web view: the tap itself recognises
//! the shortcut that leaves draw mode and Force Quit, and it lets everything
//! through whenever ratelpen is not the active app.
//!
//! macOS only allows such a tap for apps the user has added under
//! Privacy & Security › Accessibility.

use std::{
    ffi::c_void,
    ptr,
    sync::{
        atomic::{AtomicBool, AtomicI64, AtomicPtr, AtomicU64, Ordering},
        Arc, Mutex,
    },
};

use objc2::MainThreadMarker;
use objc2_app_kit::NSApplication;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

type CFTypeRef = *const c_void;
type CGEventRef = *mut c_void;

const HID_EVENT_TAP: u32 = 0;
const HEAD_INSERT_EVENT_TAP: u32 = 0;
const TAP_OPTION_DEFAULT: u32 = 0;

const EVENT_KEY_DOWN: u32 = 10;
const EVENT_KEY_UP: u32 = 11;
const EVENT_FLAGS_CHANGED: u32 = 12;
/// Trackpad gestures (rotate, gesture, magnify, swipe, smart magnify),
/// swallowed outright.
const GESTURE_EVENTS: [u32; 5] = [18, 29, 30, 31, 32];
const EVENT_TAP_DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;
const EVENT_TAP_DISABLED_BY_USER_INPUT: u32 = 0xFFFF_FFFF;

const KEYBOARD_EVENT_AUTOREPEAT: u32 = 8;
const KEYBOARD_EVENT_KEYCODE: u32 = 9;
const KEYCODE_ESCAPE: i64 = 53;
const FLAG_SHIFT: u64 = 0x0002_0000;
const FLAG_CONTROL: u64 = 0x0004_0000;
const FLAG_OPTION: u64 = 0x0008_0000;
const FLAG_COMMAND: u64 = 0x0010_0000;
const MODIFIER_FLAGS: u64 = FLAG_SHIFT | FLAG_CONTROL | FLAG_OPTION | FLAG_COMMAND;
const NO_KEY: i64 = -1;

type TapCallback = extern "C" fn(*mut c_void, u32, CGEventRef, *mut c_void) -> CGEventRef;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        events_of_interest: u64,
        callback: TapCallback,
        user_info: *mut c_void,
    ) -> *mut c_void;
    fn CGEventTapEnable(tap: *mut c_void, enable: bool);
    fn CGEventPostToPid(pid: i32, event: CGEventRef);
    fn CGEventGetFlags(event: CGEventRef) -> u64;
    fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    static kCFRunLoopCommonModes: CFTypeRef;
    static kCFBooleanTrue: CFTypeRef;
    static kCFTypeDictionaryKeyCallBacks: c_void;
    static kCFTypeDictionaryValueCallBacks: c_void;
    fn CFMachPortCreateRunLoopSource(
        allocator: CFTypeRef,
        port: *mut c_void,
        order: isize,
    ) -> *mut c_void;
    fn CFMachPortInvalidate(port: *mut c_void);
    fn CFRunLoopGetMain() -> *mut c_void;
    fn CFRunLoopAddSource(run_loop: *mut c_void, source: *mut c_void, mode: CFTypeRef);
    fn CFRunLoopRemoveSource(run_loop: *mut c_void, source: *mut c_void, mode: CFTypeRef);
    fn CFDictionaryCreate(
        allocator: CFTypeRef,
        keys: *const CFTypeRef,
        values: *const CFTypeRef,
        count: isize,
        key_callbacks: *const c_void,
        value_callbacks: *const c_void,
    ) -> CFTypeRef;
    fn CFRelease(object: CFTypeRef);
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    static kAXTrustedCheckOptionPrompt: CFTypeRef;
    fn AXIsProcessTrustedWithOptions(options: CFTypeRef) -> bool;
}

/// The installed tap and its run loop source; both null when there is none.
/// Only the main thread installs or removes them.
static TAP: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());
static SOURCE: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());
/// Draw mode wants the keyboard held.
static WANT_LOCK: AtomicBool = AtomicBool::new(false);
/// The shortcut that leaves draw mode, as a key code and modifier flags.
static EXIT_KEYCODE: AtomicI64 = AtomicI64::new(NO_KEY);
static EXIT_FLAGS: AtomicU64 = AtomicU64::new(0);
/// The key that asked to leave and is still held down. Until it is released
/// its repeats are swallowed, so they cannot switch draw mode back on.
static DRAIN_KEYCODE: AtomicI64 = AtomicI64::new(NO_KEY);
static ON_EXIT: Mutex<Option<Arc<dyn Fn() + Send + Sync>>> = Mutex::new(None);

/// A shortcut as the tap sees it.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct KeyChord {
    pub keycode: i64,
    pub flags: u64,
}

impl KeyChord {
    /// `None` for keys this table does not know; the overlay then handles
    /// the shortcut, as it does for the other global shortcuts.
    pub fn from_shortcut(shortcut: &Shortcut) -> Option<Self> {
        let mods = shortcut.mods;
        let flag = |modifier: Modifiers, flag: u64| if mods.contains(modifier) { flag } else { 0 };
        let flags = flag(Modifiers::SHIFT, FLAG_SHIFT)
            | flag(Modifiers::CONTROL, FLAG_CONTROL)
            | flag(Modifiers::ALT, FLAG_OPTION)
            | flag(Modifiers::SUPER, FLAG_COMMAND);
        keycode_for(shortcut.key).map(|keycode| Self { keycode, flags })
    }
}

/// macOS virtual key codes (ANSI layout positions).
fn keycode_for(code: Code) -> Option<i64> {
    const TABLE: &[(Code, i64)] = &[
        (Code::KeyA, 0),
        (Code::KeyS, 1),
        (Code::KeyD, 2),
        (Code::KeyF, 3),
        (Code::KeyH, 4),
        (Code::KeyG, 5),
        (Code::KeyZ, 6),
        (Code::KeyX, 7),
        (Code::KeyC, 8),
        (Code::KeyV, 9),
        (Code::KeyB, 11),
        (Code::KeyQ, 12),
        (Code::KeyW, 13),
        (Code::KeyE, 14),
        (Code::KeyR, 15),
        (Code::KeyY, 16),
        (Code::KeyT, 17),
        (Code::Digit1, 18),
        (Code::Digit2, 19),
        (Code::Digit3, 20),
        (Code::Digit4, 21),
        (Code::Digit6, 22),
        (Code::Digit5, 23),
        (Code::Equal, 24),
        (Code::Digit9, 25),
        (Code::Digit7, 26),
        (Code::Minus, 27),
        (Code::Digit8, 28),
        (Code::Digit0, 29),
        (Code::BracketRight, 30),
        (Code::KeyO, 31),
        (Code::KeyU, 32),
        (Code::BracketLeft, 33),
        (Code::KeyI, 34),
        (Code::KeyP, 35),
        (Code::Enter, 36),
        (Code::KeyL, 37),
        (Code::KeyJ, 38),
        (Code::Quote, 39),
        (Code::KeyK, 40),
        (Code::Semicolon, 41),
        (Code::Backslash, 42),
        (Code::Comma, 43),
        (Code::Slash, 44),
        (Code::KeyN, 45),
        (Code::KeyM, 46),
        (Code::Period, 47),
        (Code::Tab, 48),
        (Code::Space, 49),
        (Code::Backquote, 50),
        (Code::Backspace, 51),
        (Code::Escape, 53),
        (Code::F5, 96),
        (Code::F6, 97),
        (Code::F7, 98),
        (Code::F3, 99),
        (Code::F8, 100),
        (Code::F9, 101),
        (Code::F11, 103),
        (Code::F10, 109),
        (Code::F12, 111),
        (Code::F4, 118),
        (Code::F2, 120),
        (Code::F1, 122),
        (Code::ArrowLeft, 123),
        (Code::ArrowRight, 124),
        (Code::ArrowDown, 125),
        (Code::ArrowUp, 126),
    ];
    TABLE
        .iter()
        .find(|(known, _)| *known == code)
        .map(|(_, keycode)| *keycode)
}

fn is_key(event_type: u32) -> bool {
    event_type == EVENT_KEY_DOWN || event_type == EVENT_KEY_UP
}

/// Force Quit (Cmd+Option+Esc) is never held back.
fn is_force_quit(event_type: u32, keycode: i64, flags: u64) -> bool {
    let chord = FLAG_COMMAND | FLAG_OPTION;
    is_key(event_type) && keycode == KEYCODE_ESCAPE && flags & chord == chord
}

fn events_of_interest() -> u64 {
    [EVENT_KEY_DOWN, EVENT_KEY_UP, EVENT_FLAGS_CHANGED]
        .iter()
        .chain(GESTURE_EVENTS.iter())
        .fold(0, |mask, event_type| mask | (1u64 << event_type))
}

/// What to do with one event.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Verdict {
    /// Let the system have it.
    Pass,
    /// Let the system have it and leave draw mode (Force Quit).
    PassAndExit,
    /// Drop it.
    Swallow,
    /// Drop it and leave draw mode.
    SwallowAndExit,
    /// Drop it; the key that asked to leave has now been released.
    SwallowAndEndDrain,
    /// Give it to ratelpen only.
    Forward,
}

/// Everything the decision depends on, so it can be tested without a tap.
#[derive(Clone, Copy, Debug)]
struct Situation {
    event_type: u32,
    keycode: i64,
    flags: u64,
    autorepeat: bool,
    want_lock: bool,
    app_active: bool,
    exit: Option<KeyChord>,
    drain_keycode: i64,
}

fn decide(s: Situation) -> Verdict {
    if s.drain_keycode != NO_KEY && is_key(s.event_type) {
        if s.keycode == s.drain_keycode {
            return if s.event_type == EVENT_KEY_UP {
                Verdict::SwallowAndEndDrain
            } else {
                Verdict::Swallow
            };
        }
        // Another key was pressed, so the first one is no longer repeating.
        if s.event_type == EVENT_KEY_DOWN && !s.autorepeat {
            return decide(Situation {
                drain_keycode: NO_KEY,
                ..s
            });
        }
    }
    // Not locked, or another app came to the front: stay out of the way.
    if !s.want_lock || !s.app_active {
        return Verdict::Pass;
    }
    if GESTURE_EVENTS.contains(&s.event_type) {
        return Verdict::Swallow;
    }
    if is_force_quit(s.event_type, s.keycode, s.flags) {
        return Verdict::PassAndExit;
    }
    let is_exit = s.exit.is_some_and(|chord| {
        s.event_type == EVENT_KEY_DOWN
            && s.keycode == chord.keycode
            && s.flags & MODIFIER_FLAGS == chord.flags
    });
    match (is_exit, s.autorepeat) {
        (true, false) => Verdict::SwallowAndExit,
        (true, true) => Verdict::Swallow,
        (false, _) => Verdict::Forward,
    }
}

fn exit_chord() -> Option<KeyChord> {
    let keycode = EXIT_KEYCODE.load(Ordering::SeqCst);
    (keycode != NO_KEY).then(|| KeyChord {
        keycode,
        flags: EXIT_FLAGS.load(Ordering::SeqCst),
    })
}

/// The tap runs on the main thread, where AppKit can be asked.
fn app_is_active() -> bool {
    MainThreadMarker::new().is_none_or(|main| NSApplication::sharedApplication(main).isActive())
}

fn request_exit() {
    let handler = ON_EXIT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    if let Some(handler) = handler {
        handler();
    }
}

extern "C" fn on_event(
    _proxy: *mut c_void,
    event_type: u32,
    event: CGEventRef,
    _user_info: *mut c_void,
) -> CGEventRef {
    let tap = TAP.load(Ordering::SeqCst);
    if event_type == EVENT_TAP_DISABLED_BY_TIMEOUT || event_type == EVENT_TAP_DISABLED_BY_USER_INPUT
    {
        if !tap.is_null() && WANT_LOCK.load(Ordering::SeqCst) {
            // SAFETY: `tap` is the live tap this callback belongs to.
            unsafe { CGEventTapEnable(tap, true) };
        }
        return event;
    }
    // SAFETY: `event` is a valid event for the duration of this callback.
    let (keycode, flags, autorepeat) = unsafe {
        (
            CGEventGetIntegerValueField(event, KEYBOARD_EVENT_KEYCODE),
            CGEventGetFlags(event),
            CGEventGetIntegerValueField(event, KEYBOARD_EVENT_AUTOREPEAT) != 0,
        )
    };
    let want_lock = WANT_LOCK.load(Ordering::SeqCst);
    let verdict = decide(Situation {
        event_type,
        keycode,
        flags,
        autorepeat,
        want_lock,
        app_active: app_is_active(),
        exit: exit_chord(),
        drain_keycode: DRAIN_KEYCODE.load(Ordering::SeqCst),
    });
    match verdict {
        Verdict::Pass => event,
        Verdict::PassAndExit => {
            request_exit();
            event
        }
        Verdict::Swallow => ptr::null_mut(),
        Verdict::SwallowAndExit => {
            DRAIN_KEYCODE.store(keycode, Ordering::SeqCst);
            request_exit();
            ptr::null_mut()
        }
        Verdict::SwallowAndEndDrain => {
            DRAIN_KEYCODE.store(NO_KEY, Ordering::SeqCst);
            if !want_lock && !tap.is_null() {
                // SAFETY: `tap` is live; it is released by the next `remove`.
                unsafe { CGEventTapEnable(tap, false) };
            }
            ptr::null_mut()
        }
        Verdict::Forward => {
            if let Ok(pid) = i32::try_from(std::process::id()) {
                // SAFETY: posting copies the event; it goes to this process
                // only and does not pass through the tap again.
                unsafe { CGEventPostToPid(pid, event) };
            }
            ptr::null_mut()
        }
    }
}

/// Whether macOS lets this app watch the keyboard. With `prompt`, macOS shows
/// its own dialog that leads to the Accessibility settings.
pub fn is_trusted(prompt: bool) -> bool {
    // SAFETY: the dictionary holds two static CF objects and is released
    // after the call; a null dictionary is a plain query.
    unsafe {
        if !prompt {
            return AXIsProcessTrustedWithOptions(ptr::null());
        }
        let keys = [kAXTrustedCheckOptionPrompt];
        let values = [kCFBooleanTrue];
        let options = CFDictionaryCreate(
            ptr::null(),
            keys.as_ptr(),
            values.as_ptr(),
            1,
            ptr::addr_of!(kCFTypeDictionaryKeyCallBacks),
            ptr::addr_of!(kCFTypeDictionaryValueCallBacks),
        );
        let trusted = AXIsProcessTrustedWithOptions(options);
        if !options.is_null() {
            CFRelease(options);
        }
        trusted
    }
}

/// Starts holding the keyboard. Returns false when macOS refused the tap.
/// Must run on the main thread.
pub fn install(exit: Option<KeyChord>, on_exit: Arc<dyn Fn() + Send + Sync>) -> bool {
    EXIT_KEYCODE.store(exit.map_or(NO_KEY, |chord| chord.keycode), Ordering::SeqCst);
    EXIT_FLAGS.store(exit.map_or(0, |chord| chord.flags), Ordering::SeqCst);
    *ON_EXIT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(on_exit);
    let existing = TAP.load(Ordering::SeqCst);
    if !existing.is_null() {
        WANT_LOCK.store(true, Ordering::SeqCst);
        // SAFETY: `existing` is the live tap; it may have been left disabled.
        unsafe { CGEventTapEnable(existing, true) };
        return true;
    }
    // SAFETY: the callback is a plain function with no captured state; the
    // tap and source are kept until `remove` releases them.
    unsafe {
        let tap = CGEventTapCreate(
            HID_EVENT_TAP,
            HEAD_INSERT_EVENT_TAP,
            TAP_OPTION_DEFAULT,
            events_of_interest(),
            on_event,
            ptr::null_mut(),
        );
        if tap.is_null() {
            return false;
        }
        let source = CFMachPortCreateRunLoopSource(ptr::null(), tap, 0);
        if source.is_null() {
            CFMachPortInvalidate(tap);
            CFRelease(tap);
            return false;
        }
        CFRunLoopAddSource(CFRunLoopGetMain(), source, kCFRunLoopCommonModes);
        TAP.store(tap, Ordering::SeqCst);
        SOURCE.store(source, Ordering::SeqCst);
        WANT_LOCK.store(true, Ordering::SeqCst);
        CGEventTapEnable(tap, true);
    }
    true
}

/// Gives the keyboard back. Must run on the main thread.
///
/// While the key that asked to leave is still held, the tap stays for a
/// moment longer and lets everything else through; it switches itself off
/// when that key is released.
pub fn remove() {
    WANT_LOCK.store(false, Ordering::SeqCst);
    if DRAIN_KEYCODE.load(Ordering::SeqCst) != NO_KEY {
        return;
    }
    let tap = TAP.swap(ptr::null_mut(), Ordering::SeqCst);
    let source = SOURCE.swap(ptr::null_mut(), Ordering::SeqCst);
    // SAFETY: both pointers came from `install` and are released exactly once
    // because the swaps above cleared them.
    unsafe {
        if !tap.is_null() {
            CGEventTapEnable(tap, false);
        }
        if !source.is_null() {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), source, kCFRunLoopCommonModes);
            CFRelease(source);
        }
        if !tap.is_null() {
            CFMachPortInvalidate(tap);
            CFRelease(tap);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const OPTION_TAB: KeyChord = KeyChord {
        keycode: 48,
        flags: FLAG_OPTION,
    };

    fn key(event_type: u32, keycode: i64, flags: u64) -> Situation {
        Situation {
            event_type,
            keycode,
            flags,
            autorepeat: false,
            want_lock: true,
            app_active: true,
            exit: Some(OPTION_TAB),
            drain_keycode: NO_KEY,
        }
    }

    #[test]
    fn keys_go_to_ratelpen_only_while_locked() {
        assert_eq!(decide(key(EVENT_KEY_DOWN, 15, 0)), Verdict::Forward);
        // Cmd+Tab never reaches the system.
        assert_eq!(
            decide(key(EVENT_KEY_DOWN, 48, FLAG_COMMAND)),
            Verdict::Forward
        );
        assert_eq!(
            decide(key(EVENT_FLAGS_CHANGED, 55, FLAG_COMMAND)),
            Verdict::Forward
        );
        assert_eq!(decide(key(31, 0, 0)), Verdict::Swallow);
    }

    #[test]
    fn the_exit_shortcut_leaves_without_the_web_view() {
        let press = key(EVENT_KEY_DOWN, 48, FLAG_OPTION);
        assert_eq!(decide(press), Verdict::SwallowAndExit);
        // Extra non-modifier bits (caps lock, fn) do not hide the shortcut.
        let with_noise = key(EVENT_KEY_DOWN, 48, FLAG_OPTION | 0x0080_0100);
        assert_eq!(decide(with_noise), Verdict::SwallowAndExit);
        let repeat = Situation {
            autorepeat: true,
            ..press
        };
        assert_eq!(decide(repeat), Verdict::Swallow);
        assert_eq!(
            decide(key(EVENT_KEY_DOWN, 48, FLAG_OPTION | FLAG_SHIFT)),
            Verdict::Forward
        );
    }

    #[test]
    fn force_quit_passes_and_leaves_draw_mode() {
        let chord = FLAG_COMMAND | FLAG_OPTION;
        assert_eq!(
            decide(key(EVENT_KEY_DOWN, KEYCODE_ESCAPE, chord)),
            Verdict::PassAndExit
        );
        assert_eq!(
            decide(key(EVENT_KEY_DOWN, KEYCODE_ESCAPE, FLAG_COMMAND)),
            Verdict::Forward
        );
    }

    #[test]
    fn stays_out_of_the_way_when_unlocked_or_another_app_is_in_front() {
        let unlocked = Situation {
            want_lock: false,
            ..key(EVENT_KEY_DOWN, 48, FLAG_COMMAND)
        };
        assert_eq!(decide(unlocked), Verdict::Pass);
        let behind = Situation {
            app_active: false,
            ..key(EVENT_KEY_DOWN, 48, FLAG_COMMAND)
        };
        assert_eq!(decide(behind), Verdict::Pass);
    }

    #[test]
    fn a_held_exit_key_cannot_switch_draw_mode_back_on() {
        // Draw mode is already off, but the key is still down and repeating.
        let held = Situation {
            want_lock: false,
            autorepeat: true,
            drain_keycode: 48,
            ..key(EVENT_KEY_DOWN, 48, FLAG_OPTION)
        };
        assert_eq!(decide(held), Verdict::Swallow);
        let released = Situation {
            event_type: EVENT_KEY_UP,
            ..held
        };
        assert_eq!(decide(released), Verdict::SwallowAndEndDrain);
        // Other keys are not held back meanwhile.
        let other = Situation {
            keycode: 15,
            autorepeat: false,
            ..held
        };
        assert_eq!(decide(other), Verdict::Pass);
    }

    #[test]
    fn shortcuts_become_key_chords() {
        let option_tab: Shortcut = "Alt+Tab".parse().expect("valid accelerator");
        assert_eq!(KeyChord::from_shortcut(&option_tab), Some(OPTION_TAB));
        let command: Shortcut = "CmdOrCtrl+Shift+K".parse().expect("valid accelerator");
        assert_eq!(
            KeyChord::from_shortcut(&command),
            Some(KeyChord {
                keycode: 40,
                flags: FLAG_COMMAND | FLAG_SHIFT
            })
        );
    }

    #[test]
    fn watches_keys_and_gestures_only() {
        let mask = events_of_interest();
        for event_type in [10, 11, 12, 18, 29, 30, 31, 32] {
            assert_ne!(mask & (1 << event_type), 0);
        }
        // Mouse buttons, movement, scrolling and media keys are never touched.
        for event_type in [1, 2, 5, 6, 14, 22] {
            assert_eq!(mask & (1 << event_type), 0);
        }
    }
}
