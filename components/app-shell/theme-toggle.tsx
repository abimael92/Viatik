"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "viatik-theme";

function getInitialDark(): boolean {
  if (typeof document === "undefined") return false;
  // The <head> init script already set data-theme from localStorage before
  // hydration, so reading the attribute reflects the saved choice (or null
  // for the OS preference, which the CSS resolves).
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** Sun/Moon theme switch. Persists the choice and toggles <html data-theme>. */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const [dark, setDark] = useState(getInitialDark);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    try {
      localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
    } catch {
      // Storage may be unavailable; the in-page theme still applies.
    }
  }, [dark]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      suppressHydrationWarning
      className={cn("text-side-muted hover:bg-side-hover hover:text-side-fg", className)}
      aria-label={t("common.toggleTheme")}
      title={t("common.toggleTheme")}
      onClick={() => setDark((value) => !value)}
    >
      {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </Button>
  );
}
