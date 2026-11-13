import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { locale } from "./i18n";
import { OverlayApp } from "./overlay/OverlayApp";
import { SettingsApp } from "./settings/SettingsApp";
import "./styles/base.css";
import "./styles/overlay.css";
import "./styles/settings.css";

export type View = "overlay" | "settings";

export function viewFromSearch(search: string): View {
  return new URLSearchParams(search).get("view") === "settings"
    ? "settings"
    : "overlay";
}

const view = viewFromSearch(window.location.search);
document.documentElement.lang = locale;
document.documentElement.dataset.view = view;

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

const app: ReactNode = view === "settings" ? <SettingsApp /> : <OverlayApp />;
createRoot(root).render(<StrictMode>{app}</StrictMode>);
