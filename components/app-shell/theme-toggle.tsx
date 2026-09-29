"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "viatik-theme";

function isDarkTheme(): boolean {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function applyTheme(dark: boolean) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  try {
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    // Storage may be unavailable; the in-page theme still applies.
  }
}

/**
 * Sun/Moon theme switch. Both icons are always rendered so the server HTML
 * matches hydration; visibility follows `data-theme` and the OS preference.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("theme-toggle text-side-muted hover:text-side-fg", className)}
      aria-label={t("common.toggleTheme")}
      title={t("common.toggleTheme")}
      onClick={() => applyTheme(!isDarkTheme())}
    >
      <Sun
        className="theme-toggle-sun size-5 fill-amber-400/30 text-amber-400 drop-shadow-[0_0_6px_rgb(251_191_36_/_0.55)]"
        aria-hidden
      />
      <Moon className="theme-toggle-moon size-5 fill-viatik-magenta/15 text-viatik-magenta" aria-hidden />
    </Button>
  );
}
