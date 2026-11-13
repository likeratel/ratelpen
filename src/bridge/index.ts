import type { Bridge } from "./bridge";
import { createFakeBridge, type FakeBridgeControls } from "./fakeBridge";
import { createTauriBridge } from "./tauriBridge";
import type { Platform } from "./types";

declare global {
  interface Window {
    /** Present only outside Tauri, so tests and previews can drive the fake core. */
    __ratelpenFake?: FakeBridgeControls;
  }
}

function guessPlatform(): Platform {
  const agent = navigator.userAgent;
  if (/Mac/i.test(agent)) return "macos";
  if (/Win/i.test(agent)) return "windows";
  return "linux";
}

function selectBridge(): Bridge {
  if ("__TAURI_INTERNALS__" in window) return createTauriBridge();
  const fake = createFakeBridge(guessPlatform());
  window.__ratelpenFake = fake.controls;
  return fake;
}

export const bridge: Bridge = selectBridge();

export * from "./bridge";
export * from "./types";
