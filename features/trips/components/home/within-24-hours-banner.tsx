"use client";

import { Luggage } from "lucide-react";

import { useI18n } from "@/lib/i18n/i18n-provider";

export function isWithinNext24Hours(startDate: string | null): boolean {
  if (!startDate) return false;
  const delta = Date.parse(`${startDate}T00:00:00`) - Date.now();
  return delta >= 0 && delta < 24 * 60 * 60 * 1000;
}

/** Pre-departure "check in & pack" banner shown during the last 24 hours before a trip. */
export function WithinNext24HoursBanner({ startDate }: { startDate: string | null }) {
  const { t } = useI18n();
  if (!isWithinNext24Hours(startDate)) return null;
  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-primary/30 bg-linear-to-r from-primary via-viatik-magenta to-viatik-red p-6 text-primary-foreground shadow-xl sm:p-8"
      aria-label={t("common.checkInPack")}
    >
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground/75">{t("common.checkInPack")}</p>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{t("common.checkInPackTitle")}</h2>
          <p className="mt-2 max-w-xl text-sm text-primary-foreground/85">{t("common.checkInPackDescription")}</p>
        </div>
        <Luggage className="size-16 shrink-0 opacity-80" aria-hidden />
      </div>
    </section>
  );
}
