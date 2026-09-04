/**
 * Weather domain entities. These are plain TypeScript shapes with no
 * dependency on Open-Meteo, Dexie, or Supabase row types.
 */

export interface DailyForecast {
  dates: string[]; // ISO yyyy-mm-dd
  temperature2mMax: number[]; // °C
  temperature2mMin: number[]; // °C
  precipitationSum: number[]; // mm
  weatherCode: number[]; // WMO Weather interpretation codes (WW)
  windSpeed10mMax: number[]; // km/h
}

export interface TripWeatherForecast {
  id: string; // same as tripId (one forecast per trip)
  tripId: string;
  locationRevision: string;
  fetchedAt: string; // ISO datetime
  forecast: DailyForecast;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type WeatherWarningType = "extremeHeat" | "freezing" | "heavyRain" | "highWind";

export interface WeatherWarning {
  type: WeatherWarningType;
  severity: "low" | "medium" | "high";
  dayDate: string;
  title: string;
  message: string;
}

export interface WeatherProvider {
  fetchForecast(params: {
    latitude: number;
    longitude: number;
    startDate: string;
    endDate: string;
    timeZone?: string | null;
  }): Promise<DailyForecast>;
}

export interface WeatherForecastRepository {
  getForecast(tripId: string): Promise<TripWeatherForecast | undefined>;
  watchForecast(tripId: string, onChange: (forecast?: TripWeatherForecast) => void): () => void;
  saveForecast(forecast: TripWeatherForecast, userId: string, canEdit: boolean): Promise<void>;
  isStale(forecast: TripWeatherForecast, maxAgeHours?: number): boolean;
}
