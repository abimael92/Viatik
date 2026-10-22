"use client";

import { useI18n } from "@/lib/i18n/i18n-provider";

export function GeminiPageHeader() {
  const { t } = useI18n();
  return (
    <header className="space-y-2">
      <p className="text-sm font-semibold text-viatik-blue">{t("copy.geminiPageEyebrow")}</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("copy.geminiPageTitle")}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">{t("copy.geminiPageDescription")}</p>
    </header>
  );
}
