"use client";

import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  ChevronDown,
  ChevronUp,
  Loader2,
  Snowflake,
  Sun,
  Wind,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { weatherCodeSummary } from "@/features/weather/domain/weather-warnings";
import type { DailyForecast, TripWeatherForecast, WeatherWarning } from "@/features/weather/domain/weather-types";
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
  const { t } = useI18n();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [hourlyOpen, setHourlyOpen] = useState(false);
  if (loading) {
    return (
      <div className="flex h-28 w-48 items-center justify-center gap-2 rounded-2xl border bg-card/95 text-sm text-muted-foreground shadow-lg backdrop-blur" aria-live="polite">
        <Loader2 className="size-5 animate-spin" /> {t("common.loadingWeather")}
      </div>
    );
  }

  if (!forecast || dayDates.length === 0) {
    return emptyMessage ? (
      <p className="w-48 rounded-2xl border bg-card/95 p-3 text-sm text-muted-foreground shadow-lg backdrop-blur">{emptyMessage}</p>
    ) : null;
  }

  const today = localDateKey(new Date());
  const dayDate = dayDates.includes(today) ? today : dayDates.find((date) => date >= today) ?? dayDates.at(-1)!;
  const day = getDayWeather(forecast.forecast, warnings ?? [], dayDate);
  const hourlyRows = getHourlyRows(forecast.forecast, dayDate);

  return (
    <>
      <button type="button" onClick={() => setDetailsOpen(true)} className="block rounded-2xl text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]" aria-label={t("common.viewWeatherDetails", { day: formatDay(dayDate) })}>
        <WeatherDayCard dayDate={dayDate} forecast={forecast.forecast} warnings={warnings ?? []} />
      </button>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.weatherFor", { day: formatFullDay(dayDate) })}</DialogTitle>
            <DialogDescription>{t("common.weatherDescription")}</DialogDescription>
          </DialogHeader>
          {day ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-4">
                <WeatherIcon icon={weatherIconName(day.summary.icon)} className="size-12 text-primary" />
                <div><p className="text-xl font-bold">{day.summary.label}</p><p className="text-sm text-muted-foreground">High {day.maxTemp !== null ? `${Math.round(day.maxTemp)}°C` : "—"} · Low {day.minTemp !== null ? `${Math.round(day.minTemp)}°C` : "—"}</p></div>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <WeatherMetric label={t("common.highTemperature")} value={day.maxTemp !== null ? `${Math.round(day.maxTemp)}°C` : "—"} />
                <WeatherMetric label={t("common.lowTemperature")} value={day.minTemp !== null ? `${Math.round(day.minTemp)}°C` : "—"} />
                <WeatherMetric label={t("common.precipitation")} value={`${Math.round(day.precipitation)} mm`} />
                <WeatherMetric label={t("common.maximumWind")} value={`${Math.round(day.windSpeed)} km/h`} />
              </dl>
              {day.warnings.length > 0 && <div className="space-y-2"><p className="text-sm font-semibold">{t("common.weatherWarnings")}</p>{day.warnings.map((warning) => <div key={warning.type} className="rounded-lg border border-warning/50 bg-warning/10 p-3"><p className="text-sm font-semibold">{warning.title}</p><p className="text-xs text-muted-foreground">{warning.message}</p></div>)}</div>}
              {hourlyRows.length > 0 && (
                <div className="border-t pt-3">
                  <Button type="button" variant="ghost" className="w-full justify-between" onClick={() => setHourlyOpen((open) => !open)} aria-expanded={hourlyOpen}>
                    {hourlyOpen ? t("common.hideHourly") : t("common.showHourly")} {hourlyOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </Button>
                  {hourlyOpen && <div className="mt-2 max-h-72 divide-y overflow-y-auto rounded-lg border">{hourlyRows.map((hour) => <HourlyWeatherRow key={hour.time} hour={hour} />)}</div>}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t("common.forecastUpdated", { time: new Date(forecast.fetchedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) })}</p>
            </div>
          ) : <p className="text-sm text-muted-foreground">{t("common.noWeather")}</p>}
        </DialogContent>
      </Dialog>
    </>
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
  const { t } = useI18n();

  const day = getDayWeather(forecast, warnings, dayDate);

  return (
    <div
      className={cn(
        "flex h-32 w-48 flex-col items-start rounded-2xl border bg-card/95 p-3 text-left shadow-lg backdrop-blur",
        day?.warnings.length ? "border-warning/50" : "border-border"
      )}
      aria-label={day ? weatherLabel(day) : `No weather for ${formatDay(dayDate)}`}
    >
      {day ? (
        <>
          <div className="flex w-full items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">{formatDay(dayDate)}</p>
            {day.warnings.length > 0 && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-foreground">{t("copy.warning")}</span>}
          </div>
          <div className="mt-2 flex flex-1 items-center gap-3">
            <WeatherIcon icon={weatherIconName(day.summary.icon)} className="size-9 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold leading-none">
                {day.maxTemp !== null ? `${Math.round(day.maxTemp)}°` : "–"}
                <span className="ml-1 text-sm font-medium text-muted-foreground">/ {day.minTemp !== null ? `${Math.round(day.minTemp)}°` : "–"}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{day.summary.label}</p>
            </div>
          </div>
        </>
      ) : <><Cloud className="size-7 text-muted-foreground" /><p className="mt-2 text-[11px] font-semibold uppercase text-muted-foreground">{formatDay(dayDate)}</p><p className="mt-1 text-sm font-semibold">{t("copy.noWeatherData")}</p></>}
    </div>
  );
}

interface HourlyWeather {
  time: string;
  temperature: number;
  precipitationProbability: number;
  weatherCode: number;
  windSpeed: number;
}

function getHourlyRows(forecast: DailyForecast, dayDate: string): HourlyWeather[] {
  if (!forecast.hourly) return [];
  return forecast.hourly.times.flatMap((time, index) => time.startsWith(dayDate) ? [{
    time,
    temperature: forecast.hourly!.temperature2m[index] ?? NaN,
    precipitationProbability: forecast.hourly!.precipitationProbability[index] ?? 0,
    weatherCode: forecast.hourly!.weatherCode[index] ?? -1,
    windSpeed: forecast.hourly!.windSpeed10m[index] ?? 0,
  }] : []);
}

function HourlyWeatherRow({ hour }: { hour: HourlyWeather }) {
  const summary = weatherCodeSummary(hour.weatherCode);
  return (
    <div className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 px-3 py-2.5 text-sm">
      <span className="font-medium tabular-nums">{new Date(hour.time).toLocaleTimeString([], { hour: "numeric" })}</span>
      <span className="flex min-w-0 items-center gap-2"><WeatherIcon icon={weatherIconName(summary.icon)} className="size-5 shrink-0 text-primary" /><span className="truncate text-muted-foreground">{summary.label}</span></span>
      <span className="text-right"><strong>{Number.isFinite(hour.temperature) ? `${Math.round(hour.temperature)}°` : "—"}</strong><span className="ml-2 text-xs text-blue-600">{Math.round(hour.precipitationProbability)}%</span><span className="ml-2 hidden text-xs text-muted-foreground sm:inline">{Math.round(hour.windSpeed)} km/h</span></span>
    </div>
  );
}

function WeatherMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-card p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>;
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

function formatFullDay(dayDate: string): string {
  return new Date(`${dayDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
