import type { DailyForecast, WeatherWarning } from "@/features/weather/domain/weather-types";
import { weatherCodeSummary } from "@/features/weather/domain/weather-warnings";

export interface DayWeather {
  dayDate: string;
  maxTemp: number | null;
  minTemp: number | null;
  precipitation: number;
  weatherCode: number;
  windSpeed: number;
  summary: { label: string; icon: ReturnType<typeof weatherCodeSummary>["icon"] };
  warnings: WeatherWarning[];
}

export function getDayWeather(
  forecast: DailyForecast | undefined,
  warnings: WeatherWarning[],
  dayDate: string
): DayWeather | undefined {
  if (!forecast) return undefined;
  const index = forecast.dates.indexOf(dayDate);
  if (index === -1) return undefined;

  const maxTemp = forecast.temperature2mMax[index];
  const minTemp = forecast.temperature2mMin[index];
  return {
    dayDate,
    maxTemp: Number.isFinite(maxTemp) ? maxTemp : null,
    minTemp: Number.isFinite(minTemp) ? minTemp : null,
    precipitation: forecast.precipitationSum[index] ?? 0,
    weatherCode: forecast.weatherCode[index] ?? -1,
    windSpeed: forecast.windSpeed10mMax[index] ?? 0,
    summary: weatherCodeSummary(forecast.weatherCode[index] ?? -1),
    warnings: warnings.filter((warning) => warning.dayDate === dayDate),
  };
}

export function weatherIconName(
  icon: DayWeather["summary"]["icon"]
): "sun" | "cloud" | "cloud-rain" | "snowflake" | "wind" | "cloud-lightning" | "cloud-fog" {
  switch (icon) {
    case "sun":
      return "sun";
    case "cloud":
      return "cloud";
    case "rain":
      return "cloud-rain";
    case "snow":
      return "snowflake";
    case "wind":
      return "wind";
    case "storm":
      return "cloud-lightning";
    case "fog":
      return "cloud-fog";
  }
}
