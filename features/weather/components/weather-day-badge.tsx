"use client";

import { Cloud, CloudFog, CloudLightning, CloudRain, Loader2, Snowflake, Sun, Wind } from "lucide-react";

import type { DailyForecast, WeatherWarning } from "@/features/weather/domain/weather-types";
import { WEATHER_CONDITION_KEYS, WEATHER_WARNING_MESSAGE_KEYS, WEATHER_WARNING_TITLE_KEYS } from "@/features/weather/lib/weather-copy";
import { getDayWeather, weatherIconName } from "@/features/weather/lib/weather-helpers";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

function WeatherIcon({ icon, className }: { icon: ReturnType<typeof weatherIconName>; className?: string }) {
  switch (icon) {
    case "sun":
      return <Sun className={className} />;
    case "cloud-rain":
      return <CloudRain className={className} />;
    case "snowflake":
      return <Snowflake className={className} />;
    case "wind":
      return <Wind className={className} />;
    case "cloud-lightning":
      return <CloudLightning className={className} />;
    case "cloud-fog":
      return <CloudFog className={className} />;
    default:
      return <Cloud className={className} />;
  }
}

export function WeatherDayBadge({
  dayDate,
  forecast,
  warnings,
  loading,
}: {
  dayDate: string;
  forecast?: DailyForecast;
  warnings?: WeatherWarning[];
  loading?: boolean;
}) {
  const { t } = useI18n();
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-label={t("copy.loadingWeatherShort")}>
        <Loader2 className="size-3 animate-spin" />
      </span>
    );
  }

  const day = getDayWeather(forecast, warnings ?? [], dayDate);
  if (!day) return null;

  const hasWarning = day.warnings.length > 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        hasWarning
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-border bg-muted text-foreground"
      )}
      aria-label={weatherLabel(day, t)}
      title={day.warnings
        .map((w) => t(WEATHER_WARNING_MESSAGE_KEYS[w.type], { value: w.value ?? 0, unit: w.unit ?? "" }))
        .join(" ")}
    >
      <WeatherIcon icon={weatherIconName(day.summary.icon)} className="size-3" />
      {day.maxTemp !== null ? `${Math.round(day.maxTemp)}°` : "–"}
      {hasWarning && <span className="sr-only">{day.warnings.map((w) => t(WEATHER_WARNING_TITLE_KEYS[w.type])).join(", ")}</span>}
    </span>
  );
}

function weatherLabel(
  day: NonNullable<ReturnType<typeof getDayWeather>>,
  t: ReturnType<typeof useI18n>["t"]
): string {
  const parts = [t(WEATHER_CONDITION_KEYS[day.summary.condition])];
  if (day.maxTemp !== null) parts.push(t("copy.weatherAriaHigh", { value: `${Math.round(day.maxTemp)}°C` }));
  if (day.minTemp !== null) parts.push(t("copy.weatherAriaLow", { value: `${Math.round(day.minTemp)}°C` }));
  if (day.warnings.length) {
    parts.push(t("copy.weatherAriaWarning", { list: day.warnings.map((w) => t(WEATHER_WARNING_TITLE_KEYS[w.type])).join(", ") }));
  }
  return parts.join(", ");
}
