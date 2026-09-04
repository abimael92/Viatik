import type { DailyForecast, WeatherWarning, WeatherWarningType } from "@/features/weather/domain/weather-types";

export interface WarningThresholds {
  extremeHeat: number; // °C, max temperature
  freezing: number; // °C, min temperature
  heavyRain: number; // mm per day
  highWind: number; // km/h
}

export const DEFAULT_THRESHOLDS: WarningThresholds = {
  extremeHeat: 35,
  freezing: 0,
  heavyRain: 20,
  highWind: 50,
};

export function weatherCodeSummary(code: number): { label: string; icon: "sun" | "cloud" | "rain" | "snow" | "wind" | "storm" | "fog" } {
  if (code <= 1) return { label: "Clear", icon: "sun" };
  if (code <= 3) return { label: "Partly cloudy", icon: "cloud" };
  if (code === 45 || code === 48) return { label: "Fog", icon: "fog" };
  if (code <= 55 || code === 56 || code === 57) return { label: "Drizzle", icon: "rain" };
  if (code <= 67) return { label: "Rain", icon: "rain" };
  if (code <= 77) return { label: "Snow", icon: "snow" };
  if (code <= 82) return { label: "Showers", icon: "rain" };
  if (code <= 86) return { label: "Snow showers", icon: "snow" };
  if (code <= 99) return { label: "Thunderstorm", icon: "storm" };
  return { label: "Unknown", icon: "cloud" };
}

export function deriveWeatherWarnings(
  forecast: DailyForecast,
  thresholds: WarningThresholds = DEFAULT_THRESHOLDS
): WeatherWarning[] {
  const warnings: WeatherWarning[] = [];
  for (let index = 0; index < forecast.dates.length; index++) {
    const dayDate = forecast.dates[index];
    const maxTemp = forecast.temperature2mMax[index];
    const minTemp = forecast.temperature2mMin[index];
    const precipitation = forecast.precipitationSum[index];
    const wind = forecast.windSpeed10mMax[index];

    if (Number.isFinite(maxTemp) && maxTemp > thresholds.extremeHeat) {
      warnings.push(buildWarning("extremeHeat", dayDate, maxTemp, "°C"));
    }
    if (Number.isFinite(minTemp) && minTemp < thresholds.freezing) {
      warnings.push(buildWarning("freezing", dayDate, minTemp, "°C"));
    }
    if (Number.isFinite(precipitation) && precipitation > thresholds.heavyRain) {
      warnings.push(buildWarning("heavyRain", dayDate, precipitation, "mm"));
    }
    if (Number.isFinite(wind) && wind > thresholds.highWind) {
      warnings.push(buildWarning("highWind", dayDate, wind, "km/h"));
    }
  }
  return warnings;
}

function buildWarning(
  type: WeatherWarningType,
  dayDate: string,
  value: number,
  unit: string
): WeatherWarning {
  switch (type) {
    case "extremeHeat":
      return {
        type,
        severity: "high",
        dayDate,
        title: "Extreme heat",
        message: `High of ${Math.round(value)}${unit} expected. Stay hydrated and limit strenuous outdoor activity.`,
      };
    case "freezing":
      return {
        type,
        severity: "medium",
        dayDate,
        title: "Freezing temperatures",
        message: `Low of ${Math.round(value)}${unit} expected. Pack warm layers and watch for icy conditions.`,
      };
    case "heavyRain":
      return {
        type,
        severity: value > 40 ? "high" : "medium",
        dayDate,
        title: "Heavy rain",
        message: `Up to ${Math.round(value)}${unit} of rain expected. Plan covered or indoor activities.`,
      };
    case "highWind":
      return {
        type,
        severity: value > 80 ? "high" : "medium",
        dayDate,
        title: "High wind",
        message: `Gusts up to ${Math.round(value)}${unit} expected. Secure loose items and check transport schedules.`,
      };
  }
}
