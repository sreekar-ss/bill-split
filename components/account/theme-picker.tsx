"use client";

import { useSyncExternalStore } from "react";
import { Segmented } from "@/components/ui/segmented";

type Theme = "system" | "light" | "dark";

// Same key and attribute as the pre-paint script in app/layout.tsx.
const STORAGE_KEY = "bs-theme";
const CHANGE_EVENT = "bs-theme-change";

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked (private mode): the choice still applies to this page view.
  }
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  // Another tab changed it: follow along on this page too.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== STORAGE_KEY) return;
    const theme = readTheme();
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
  return (
    <div className="space-y-1.5">
      <Segmented<Theme>
        label="Theme"
        value={theme}
        onValueChange={applyTheme}
        className="max-w-[360px] [&>button]:h-11"
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
      <p className="text-meta text-ink-muted">System follows your device&apos;s setting. Your choice is saved on this device.</p>
    </div>
  );
}
