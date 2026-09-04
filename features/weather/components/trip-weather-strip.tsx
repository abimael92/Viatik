"use client";

import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Loader2,
  Snowflake,
  Sun,
  Wind,
} from "lucide-react";

import type { DailyForecast, TripWeatherForecast, WeatherWarning } from "@/features/weather/domain/weather-types";
import { getDayWeather, weatherIconName } from "@/features/weather/lib/weather-helpers";
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

export function TripWeatherStrip({
  dayDates,
  forecast,
  warnings,
  loading,
  emptyMessage,
}: {
  dayDates: string[];
  forecast?: TripWeatherForecast;
  warnings?: WeatherWarning[];
  loading?: boolean;
  emptyMessage?: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <Loader2 className="size-4 animate-spin" /> Loading weather…
      </div>
    );
  }

  if (!forecast || dayDates.length === 0) {
    return emptyMessage ? (
      <p className="text-sm text-muted-foreground">{emptyMessage}</p>
    ) : null;
  }

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-2"
      aria-label="Daily weather forecast"
      role="region"
    >
      {dayDates.map((dayDate) => (
        <WeatherDayCard
          key={dayDate}
          dayDate={dayDate}
          forecast={forecast.forecast}
          warnings={warnings ?? []}
        />
      ))}
    </div>
  );
}

function WeatherDayCard({
  dayDate,
  forecast,
  warnings,
}: {
  dayDate: string;
  forecast: DailyForecast;
  warnings: WeatherWarning[];
}) {
  const day = getDayWeather(forecast, warnings, dayDate);

  return (
    <div
      className={cn(
        "flex min-w-28 flex-col items-center gap-1 rounded-xl border bg-card p-3 text-center shadow-sm",
        day?.warnings.length ? "border-warning/50" : "border-border"
      )}
      aria-label={day ? weatherLabel(day) : `No weather for ${formatDay(dayDate)}`}
    >
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {formatDay(dayDate)}
      </p>
      {day ? (
        <>
          <WeatherIcon icon={weatherIconName(day.summary.icon)} className="size-6 text-primary" />
          <p className="text-sm font-semibold">
            {day.maxTemp !== null ? `${Math.round(day.maxTemp)}°` : "–"}
            <span className="mx-1 text-muted-foreground">/</span>
            {day.minTemp !== null ? `${Math.round(day.minTemp)}°` : "–"}
          </p>
          <p className="text-xs text-muted-foreground">{day.summary.label}</p>
          {day.precipitation > 0 && (
            <p className="text-xs text-blue-600">{Math.round(day.precipitation)} mm</p>
          )}
          {day.windSpeed > 0 && (
            <p className="text-xs text-muted-foreground">{Math.round(day.windSpeed)} km/h wind</p>
          )}
          {day.warnings.length > 0 && (
            <div className="mt-1 flex flex-wrap justify-center gap-1">
              {day.warnings.map((warning) => (
                <span
                  key={warning.type}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    warning.severity === "high"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-foreground"
                  )}
                  title={warning.message}
                >
                  {warning.title}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No data</p>
      )}
    </div>
  );
}

function weatherLabel(day: NonNullable<ReturnType<typeof getDayWeather>>): string {
  const parts = [
    `${day.summary.label}`,
    day.maxTemp !== null ? `high ${Math.round(day.maxTemp)}°C` : "",
    day.minTemp !== null ? `low ${Math.round(day.minTemp)}°C` : "",
    day.precipitation > 0 ? `${Math.round(day.precipitation)} mm rain` : "",
    day.warnings.length ? `warning: ${day.warnings.map((w) => w.title).join(", ")}` : "",
  ];
  return parts.filter(Boolean).join(", ");
}

function formatDay(dayDate: string): string {
  return new Date(`${dayDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
