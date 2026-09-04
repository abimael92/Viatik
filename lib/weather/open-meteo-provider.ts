import type { DailyForecast, WeatherProvider } from "@/features/weather/domain/weather-types";

export class WeatherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherError";
  }
}

/**
 * Open-Meteo API client. No API key is required.
 *
 * https://open-meteo.com/en/docs
 */
export class OpenMeteoProvider implements WeatherProvider {
  private baseUrl = "https://api.open-meteo.com/v1/forecast";

  async fetchForecast({
    latitude,
    longitude,
    startDate,
    endDate,
    timeZone,
  }: {
    latitude: number;
    longitude: number;
    startDate: string;
    endDate: string;
    timeZone?: string | null;
  }): Promise<DailyForecast> {
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new WeatherError("Invalid coordinates.");
    }
    if (startDate > endDate) {
      throw new WeatherError("Start date must be before or equal to end date.");
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    url.searchParams.set(
      "daily",
      "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,wind_speed_10m_max"
    );
    url.searchParams.set("timeformat", "iso8601");
    url.searchParams.set("timezone", timeZone?.trim() || "auto");

    let response: Response;
    try {
      response = await fetch(url.toString(), { cache: "no-store" });
    } catch {
      throw new WeatherError("Unable to reach the weather service.");
    }

    if (!response.ok) {
      throw new WeatherError(`Weather service returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      daily?: {
        time?: string[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_sum?: number[];
        weathercode?: number[];
        wind_speed_10m_max?: number[];
      };
      error?: boolean;
      reason?: string;
    };

    if (payload.error || !payload.daily?.time) {
      throw new WeatherError(payload.reason ?? "Weather service returned an invalid forecast.");
    }

    const daily = payload.daily!;
    const dates = daily.time!;
    const temperature2mMax = daily.temperature_2m_max ?? new Array(dates.length).fill(NaN);
    const temperature2mMin = daily.temperature_2m_min ?? new Array(dates.length).fill(NaN);
    const precipitationSum = daily.precipitation_sum ?? new Array(dates.length).fill(0);
    const weatherCode = daily.weathercode ?? new Array(dates.length).fill(-1);
    const windSpeed10mMax = daily.wind_speed_10m_max ?? new Array(dates.length).fill(0);

    if (
      temperature2mMax.length !== dates.length ||
      temperature2mMin.length !== dates.length ||
      precipitationSum.length !== dates.length ||
      weatherCode.length !== dates.length ||
      windSpeed10mMax.length !== dates.length
    ) {
      throw new WeatherError("Weather service returned mismatched daily arrays.");
    }

    return {
      dates,
      temperature2mMax,
      temperature2mMin,
      precipitationSum,
      weatherCode,
      windSpeed10mMax,
    };
  }
}
