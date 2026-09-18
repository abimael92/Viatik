"use client";

import { Languages } from "lucide-react";

import { useI18n } from "@/lib/i18n/i18n-provider";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/translations";

export function LanguageSwitcher({ dark = false, showLabel = false }: { dark?: boolean; showLabel?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={`inline-flex items-center gap-2 rounded-md px-2 ${dark ? "text-side-fg" : "text-muted-foreground"}`}>
      <Languages className="size-4 shrink-0" aria-hidden />
      <span className={showLabel ? "text-xs font-semibold" : "sr-only"}>{t("common.language")}</span>
      <select
        aria-label={t("common.language")}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="h-8 w-14 cursor-pointer rounded-md border border-current/20 bg-transparent px-1 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {SUPPORTED_LOCALES.map((option) => (
          <option key={option} value={option} className="bg-background text-foreground">
            {option.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
