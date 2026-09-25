import { CalendarClock, CloudSun, ListChecks } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/i18n-provider";

type Severity = "low" | "medium" | "high";

type HealthPillProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "good" | "warn" | "bad" | "neutral";
  detail: string;
};

const toneStyles: Record<HealthPillProps["tone"], { dot: string; text: string }> = {
  good: { dot: "bg-success", text: "text-success" },
  warn: { dot: "bg-accent", text: "text-accent-foreground" },
  bad: { dot: "bg-destructive", text: "text-destructive" },
  neutral: { dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

function HealthPill({ icon: Icon, label, tone, detail }: HealthPillProps) {
  const style = toneStyles[tone];
  return (
    <div className="flex items-center gap-2.5 rounded-full border border-border/60 bg-card px-3 py-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_1px_2px_rgba(15,23,42,0.04)]">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
      <span className="text-xs font-semibold tabular-nums">{detail}</span>
    </div>
  );
}

/**
 * Ambient trip-health summary synthesizing itinerary coverage, travel dates,
 * and weather advisories into tabular-numeric status pills.
 */
export function TripHealthBar({
  startDate,
  endDate,
  activityCount,
  weatherWarnings,
}: {
  startDate?: string | null;
  endDate?: string | null;
  activityCount: number;
  weatherWarnings?: Array<{ severity: Severity }>;
}) {
  const { t } = useI18n();

  const datesSet = Boolean(startDate && endDate);
  const maxSeverity = (weatherWarnings ?? []).reduce<Severity>(
    (worst, w) => (w.severity === "high" || (w.severity === "medium" && worst !== "high") ? w.severity : worst),
    "low"
  );

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t("copy.tripHealthSummary")}>
      <HealthPill
        icon={CalendarClock}
        label="Dates"
        tone={datesSet ? "good" : "warn"}
        detail={datesSet ? "Set" : "Missing"}
      />
      <HealthPill
        icon={ListChecks}
        label="Itinerary"
        tone={activityCount > 0 ? "good" : "neutral"}
        detail={activityCount === 1 ? "1 activity" : `${activityCount} activities`}
      />
      <HealthPill
        icon={CloudSun}
        label="Weather"
        tone={maxSeverity === "high" ? "bad" : maxSeverity === "medium" ? "warn" : "good"}
        detail={weatherWarnings?.length ? `${weatherWarnings.length} advisory${weatherWarnings.length === 1 ? "" : "s"}` : "Clear"}
      />
    </div>
  );
}
