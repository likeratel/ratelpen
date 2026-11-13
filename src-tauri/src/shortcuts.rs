//! Global shortcuts for draw mode, clearing and the spotlight.

use std::sync::{Mutex, MutexGuard};

use tauri::{plugin::TauriPlugin, AppHandle, Manager, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

use crate::{
    controller,
    error::{IpcError, IpcResult, INVALID_SETTINGS, SHORTCUT_UNAVAILABLE},
    settings::{ShortcutAction, Shortcuts},
};

type Bindings = Vec<(ShortcutAction, Shortcut)>;

/// The shortcuts this app currently holds, and the action of each.
#[derive(Default)]
pub struct ShortcutRegistry {
    held: Mutex<Held>,
}

impl ShortcutRegistry {
    fn lock(&self) -> MutexGuard<'_, Held> {
        self.held
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn held(&self) -> Held {
        self.lock().clone()
    }

    fn set_held(&self, held: Held) {
        *self.lock() = held;
    }

    fn action_for(&self, shortcut: &Shortcut) -> Option<ShortcutAction> {
        self.lock()
            .registered
            .iter()
            .find(|(_, bound)| bound.id() == shortcut.id())
            .map(|(action, _)| *action)
    }

    /// Actions whose stored shortcut is not registered.
    pub fn unavailable(&self) -> Vec<ShortcutAction> {
        let held = self.lock();
        unavailable_actions(&held.wanted, &held.registered)
    }
}

pub fn plugin() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(handle_shortcut)
        .build()
}

fn handle_shortcut(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }
    let Some(action) = app.state::<ShortcutRegistry>().action_for(shortcut) else {
        return;
    };
    let app = app.clone();
    match action {
        ShortcutAction::ToggleDraw => {
            controller::dispatch("Toggling draw mode", controller::toggle_draw(app))
        }
        ShortcutAction::ClearAll => {
            controller::dispatch("Clearing all overlays", controller::clear_all(app))
        }
        ShortcutAction::ToggleSpotlight => {
            controller::dispatch("Toggling the spotlight", controller::toggle_spotlight(app))
        }
    }
}

fn unavailable_actions(wanted: &Bindings, registered: &Bindings) -> Vec<ShortcutAction> {
    without(wanted, registered)
        .into_iter()
        .map(|(action, _)| action)
        .collect()
}

/// The bindings of `all` that are not in `excluded`.
fn without(all: &Bindings, excluded: &Bindings) -> Bindings {
    all.iter()
        .filter(|binding| !excluded.contains(binding))
        .copied()
        .collect()
}

/// The system side of registration, replaceable in tests.
trait Registrar {
    fn register(&self, shortcut: Shortcut) -> Result<(), String>;
    fn unregister(&self, shortcut: Shortcut) -> Result<(), String>;
}

impl Registrar for AppHandle {
    fn register(&self, shortcut: Shortcut) -> Result<(), String> {
        self.global_shortcut()
            .register(shortcut)
            .map_err(|error| error.to_string())
    }

    fn unregister(&self, shortcut: Shortcut) -> Result<(), String> {
        self.global_shortcut()
            .unregister(shortcut)
            .map_err(|error| error.to_string())
    }
}

/// What the settings ask for and what the system actually holds. They differ
/// only while another app owns one of the shortcuts.
#[derive(Clone, Debug, Default, PartialEq)]
struct Held {
    wanted: Bindings,
    registered: Bindings,
}

/// Registers each binding on its own and returns those that succeeded.
fn register_each(system: &impl Registrar, bindings: &Bindings) -> Bindings {
    bindings
        .iter()
        .filter(|(action, shortcut)| match system.register(*shortcut) {
            Ok(()) => true,
            Err(error) => {
                log::warn!("The {action:?} shortcut could not be registered: {error}");
                false
            }
        })
        .copied()
        .collect()
}

/// Registers `bindings` in order; on failure unregisters those it added.
fn register_all(system: &impl Registrar, bindings: &Bindings) -> Result<(), ShortcutAction> {
    for (index, (action, shortcut)) in bindings.iter().enumerate() {
        if let Err(error) = system.register(*shortcut) {
            log::warn!("The {action:?} shortcut could not be registered: {error}");
            unregister_each(system, &bindings[..index]);
            return Err(*action);
        }
    }
    Ok(())
}

fn unregister_each(system: &impl Registrar, bindings: &[(ShortcutAction, Shortcut)]) {
    for (action, shortcut) in bindings {
        if let Err(error) = system.unregister(*shortcut) {
            log::warn!("The {action:?} shortcut could not be unregistered: {error}");
        }
    }
}

/// Best effort: ends up wanting `target` and holding as much of it as the
/// system allows. Used at launch and to undo a save that failed later on.
fn adopt(system: &impl Registrar, held: &Held, target: Bindings) -> Held {
    unregister_each(system, &without(&held.registered, &target));
    let kept = without(&target, &without(&target, &held.registered));
    let added = register_each(system, &without(&target, &held.registered));
    let registered = without(&target, &without(&target, &[kept, added].concat()));
    Held {
        wanted: target,
        registered,
    }
}

/// Moves to `next`. Shortcuts that are new or changed are all or nothing:
/// if one cannot be registered, the previous ones are put back and the action
/// that failed is returned. Shortcuts that did not change but failed earlier
/// are only retried, so they never block saving something else.
fn switch_to(
    system: &impl Registrar,
    held: &Held,
    next: Bindings,
) -> Result<Held, (Held, ShortcutAction)> {
    let dropped = without(&held.registered, &next);
    unregister_each(system, &dropped);
    let kept = without(&held.registered, &dropped);
    let pending = without(&next, &kept);
    let changed = without(&pending, &held.wanted);
    let retried = without(&pending, &changed);
    match register_all(system, &changed) {
        Ok(()) => {
            let recovered = register_each(system, &retried);
            let missing = without(&retried, &recovered);
            Ok(Held {
                registered: without(&next, &missing),
                wanted: next,
            })
        }
        Err(action) => {
            let restored = register_each(system, &dropped);
            let recovered = Held {
                wanted: held.wanted.clone(),
                registered: [kept, restored].concat(),
            };
            Err((recovered, action))
        }
    }
}

/// Registers the stored shortcuts at launch. A shortcut that cannot be
/// registered is skipped so the app still starts; returns whether all of
/// them were registered.
pub fn register_at_launch(app: &AppHandle, shortcuts: &Shortcuts) -> bool {
    let parsed = match shortcuts.parsed() {
        Ok(parsed) => parsed,
        Err(reason) => {
            log::error!("Stored shortcuts are invalid: {reason}");
            return false;
        }
    };
    let registry = app.state::<ShortcutRegistry>();
    registry.set_held(adopt(app, &Held::default(), parsed));
    registry.unavailable().is_empty()
}

/// Replaces the registered shortcuts. When a changed shortcut cannot be
/// registered, the previous ones are registered again and the call fails.
pub fn replace(app: &AppHandle, shortcuts: &Shortcuts) -> IpcResult<()> {
    let next = shortcuts
        .parsed()
        .map_err(|reason| IpcError::new(INVALID_SETTINGS, reason))?;
    let registry = app.state::<ShortcutRegistry>();
    match switch_to(app, &registry.held(), next) {
        Ok(held) => {
            registry.set_held(held);
            Ok(())
        }
        Err((held, action)) => {
            registry.set_held(held);
            Err(IpcError::new(
                SHORTCUT_UNAVAILABLE,
                format!(
                    "{} is already in use or not allowed.",
                    accelerator(shortcuts, action)
                ),
            ))
        }
    }
}

/// Goes back to `shortcuts` after a save failed part-way. Never fails: what
/// cannot be registered again is reported as unavailable.
pub fn restore(app: &AppHandle, shortcuts: &Shortcuts) {
    let registry = app.state::<ShortcutRegistry>();
    match shortcuts.parsed() {
        Ok(target) => registry.set_held(adopt(app, &registry.held(), target)),
        Err(reason) => log::error!("The previous shortcuts are invalid: {reason}"),
    }
}

fn accelerator(shortcuts: &Shortcuts, action: ShortcutAction) -> String {
    let value = match action {
        ShortcutAction::ToggleDraw => &shortcuts.toggle_draw,
        ShortcutAction::ClearAll => &shortcuts.clear_all,
        ShortcutAction::ToggleSpotlight => &shortcuts.toggle_spotlight,
    };
    format!("The shortcut \"{value}\"")
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::*;

    /// A system where some shortcuts are taken by another app.
    #[derive(Default)]
    struct FakeSystem {
        taken: RefCell<Vec<Shortcut>>,
        registered: RefCell<Vec<Shortcut>>,
    }

    impl Registrar for FakeSystem {
        fn register(&self, shortcut: Shortcut) -> Result<(), String> {
            if self.taken.borrow().contains(&shortcut) {
                return Err("taken".into());
            }
            if self.registered.borrow().contains(&shortcut) {
                return Err("already registered".into());
            }
            self.registered.borrow_mut().push(shortcut);
            Ok(())
        }

        fn unregister(&self, shortcut: Shortcut) -> Result<(), String> {
            self.registered
                .borrow_mut()
                .retain(|held| *held != shortcut);
            Ok(())
        }
    }

    fn binding(action: ShortcutAction, accelerator: &str) -> (ShortcutAction, Shortcut) {
        (action, accelerator.parse().expect("valid accelerator"))
    }

    fn draw() -> (ShortcutAction, Shortcut) {
        binding(ShortcutAction::ToggleDraw, "Alt+Shift+D")
    }

    fn clear() -> (ShortcutAction, Shortcut) {
        binding(ShortcutAction::ClearAll, "Alt+Shift+C")
    }

    fn clear_alternative() -> (ShortcutAction, Shortcut) {
        binding(ShortcutAction::ClearAll, "Alt+Shift+X")
    }

    fn system_holds(system: &FakeSystem, bindings: &Bindings) -> bool {
        let mut actual = system.registered.borrow().clone();
        let mut expected: Vec<Shortcut> = bindings.iter().map(|(_, shortcut)| *shortcut).collect();
        actual.sort_by_key(Shortcut::id);
        expected.sort_by_key(Shortcut::id);
        actual == expected
    }

    #[test]
    fn reports_wanted_shortcuts_that_are_not_registered() {
        let wanted = vec![draw(), clear()];
        assert_eq!(
            unavailable_actions(&wanted, &vec![draw()]),
            vec![ShortcutAction::ClearAll]
        );
        assert!(unavailable_actions(&wanted, &wanted).is_empty());
    }

    #[test]
    fn launch_skips_a_taken_shortcut_and_a_later_save_retries_it() {
        let system = FakeSystem::default();
        system.taken.borrow_mut().push(clear().1);
        let wanted = vec![draw(), clear()];
        let held = adopt(&system, &Held::default(), wanted.clone());
        assert_eq!(held.registered, vec![draw()]);

        // Saving the same shortcuts while it is still taken succeeds anyway.
        let held = switch_to(&system, &held, wanted.clone()).expect("unrelated save passes");
        assert_eq!(held.registered, vec![draw()]);

        // Once the other app lets go, saving again picks the shortcut up.
        system.taken.borrow_mut().clear();
        let held = switch_to(&system, &held, wanted.clone()).expect("retry passes");
        assert_eq!(held.registered, wanted);
        assert!(system_holds(&system, &wanted));
    }

    #[test]
    fn a_taken_new_shortcut_is_refused_and_the_old_ones_stay() {
        let system = FakeSystem::default();
        let before = vec![draw(), clear()];
        let held = adopt(&system, &Held::default(), before.clone());
        system.taken.borrow_mut().push(clear_alternative().1);

        let (held, action) = switch_to(&system, &held, vec![draw(), clear_alternative()])
            .expect_err("the taken shortcut is refused");
        assert_eq!(action, ShortcutAction::ClearAll);
        assert_eq!(held.wanted, before);
        assert!(system_holds(&system, &before));
        assert!(unavailable_actions(&held.wanted, &held.registered).is_empty());
    }

    #[test]
    fn undoing_a_save_reports_what_could_not_come_back() {
        let system = FakeSystem::default();
        system.taken.borrow_mut().push(clear().1);
        let stored = vec![draw(), clear()];
        let held = adopt(&system, &Held::default(), stored.clone());
        let held = switch_to(&system, &held, vec![draw(), clear_alternative()])
            .expect("the alternative is free");

        // The save failed later on, so the stored shortcuts are adopted again.
        let held = adopt(&system, &held, stored.clone());
        assert_eq!(held.wanted, stored);
        assert_eq!(held.registered, vec![draw()]);
        assert!(system_holds(&system, &vec![draw()]));
        assert_eq!(
            unavailable_actions(&held.wanted, &held.registered),
            vec![ShortcutAction::ClearAll]
        );
    }

    #[test]
    fn a_shortcut_that_stays_taken_does_not_block_changing_another() {
        let system = FakeSystem::default();
        system.taken.borrow_mut().push(clear().1);
        let held = adopt(&system, &Held::default(), vec![draw(), clear()]);
        let moved = binding(ShortcutAction::ToggleDraw, "Alt+Shift+E");

        let held = switch_to(&system, &held, vec![moved, clear()])
            .expect("only the changed shortcut is strict");
        assert_eq!(held.registered, vec![moved]);
        assert!(system_holds(&system, &vec![moved]));
        assert_eq!(
            unavailable_actions(&held.wanted, &held.registered),
            vec![ShortcutAction::ClearAll]
        );
    }

    #[test]
    fn two_actions_can_swap_their_shortcuts() {
        let system = FakeSystem::default();
        let held = adopt(&system, &Held::default(), vec![draw(), clear()]);
        let swapped = vec![
            (ShortcutAction::ToggleDraw, clear().1),
            (ShortcutAction::ClearAll, draw().1),
        ];

        let held = switch_to(&system, &held, swapped.clone()).expect("the swap is free");
        assert_eq!(held.registered, swapped);
        assert!(system_holds(&system, &swapped));
    }

    #[test]
    fn reports_the_real_state_when_the_old_shortcut_cannot_come_back() {
        let system = FakeSystem::default();
        let held = adopt(&system, &Held::default(), vec![draw(), clear()]);
        // Both the new shortcut and the one being replaced are taken now.
        system.taken.borrow_mut().push(clear_alternative().1);
        system.taken.borrow_mut().push(clear().1);

        let (held, _) = switch_to(&system, &held, vec![draw(), clear_alternative()])
            .expect_err("the new shortcut is taken");
        assert_eq!(held.registered, vec![draw()]);
        assert!(system_holds(&system, &vec![draw()]));
        assert_eq!(
            unavailable_actions(&held.wanted, &held.registered),
            vec![ShortcutAction::ClearAll]
        );
    }
}
