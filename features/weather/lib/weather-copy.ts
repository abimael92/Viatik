import type { WeatherWarningType } from "@/features/weather/domain/weather-types";
import type { TranslationKey } from "@/lib/i18n/translations";

export type WeatherConditionKey =
  | "clear"
  | "partlyCloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "showers"
  | "snowShowers"
  | "thunderstorm"
  | "unknown";

export const WEATHER_CONDITION_KEYS: Record<WeatherConditionKey, TranslationKey> = {
  clear: "copy.weatherClear",
  partlyCloudy: "copy.weatherPartlyCloudy",
  fog: "copy.weatherFog",
  drizzle: "copy.weatherDrizzle",
  rain: "copy.weatherRain",
  snow: "copy.weatherSnow",
  showers: "copy.weatherShowers",
  snowShowers: "copy.weatherSnowShowers",
  thunderstorm: "copy.weatherThunderstorm",
  unknown: "copy.weatherUnknown",
};

export const WEATHER_WARNING_TITLE_KEYS: Record<WeatherWarningType, TranslationKey> = {
  extremeHeat: "copy.warningExtremeHeat",
  freezing: "copy.warningFreezing",
  heavyRain: "copy.warningHeavyRain",
  highWind: "copy.warningHighWind",
};

export const WEATHER_WARNING_MESSAGE_KEYS: Record<WeatherWarningType, TranslationKey> = {
  extremeHeat: "copy.warningExtremeHeatMessage",
  freezing: "copy.warningFreezingMessage",
  heavyRain: "copy.warningHeavyRainMessage",
  highWind: "copy.warningHighWindMessage",
};
