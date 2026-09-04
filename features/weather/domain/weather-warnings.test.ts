import { describe, it, expect } from "vitest";
import { deriveWeatherWarnings, weatherCodeSummary } from "@/features/weather/domain/weather-warnings";
import type { DailyForecast } from "@/features/weather/domain/weather-types";

function forecast(overrides: Partial<DailyForecast> = {}): DailyForecast {
  return {
    dates: ["2026-09-01"],
    temperature2mMax: [22],
    temperature2mMin: [12],
    precipitationSum: [0],
    weatherCode: [0],
    windSpeed10mMax: [10],
    ...overrides,
  };
}

describe("weatherCodeSummary", () => {
  it("classifies common WMO codes", () => {
    expect(weatherCodeSummary(0).icon).toBe("sun");
    expect(weatherCodeSummary(2).icon).toBe("cloud");
    expect(weatherCodeSummary(61).icon).toBe("rain");
    expect(weatherCodeSummary(71).icon).toBe("snow");
    expect(weatherCodeSummary(95).icon).toBe("storm");
    expect(weatherCodeSummary(45).icon).toBe("fog");
  });
});

describe("deriveWeatherWarnings", () => {
  it("returns empty when conditions are mild", () => {
    expect(deriveWeatherWarnings(forecast())).toEqual([]);
  });

  it("warns for extreme heat above 35°C", () => {
    const warnings = deriveWeatherWarnings(forecast({ temperature2mMax: [36] }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("extremeHeat");
    expect(warnings[0].severity).toBe("high");
  });

  it("warns for freezing temperatures below 0°C", () => {
    const warnings = deriveWeatherWarnings(forecast({ temperature2mMin: [-2] }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("freezing");
  });

  it("warns for heavy rain above 20mm", () => {
    const warnings = deriveWeatherWarnings(forecast({ precipitationSum: [25] }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("heavyRain");
  });

  it("marks very heavy rain as high severity", () => {
    const warnings = deriveWeatherWarnings(forecast({ precipitationSum: [45] }));
    expect(warnings[0].severity).toBe("high");
  });

  it("warns for high wind above 50km/h", () => {
    const warnings = deriveWeatherWarnings(forecast({ windSpeed10mMax: [55] }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("highWind");
  });

  it("marks very high wind as high severity", () => {
    const warnings = deriveWeatherWarnings(forecast({ windSpeed10mMax: [90] }));
    expect(warnings[0].severity).toBe("high");
  });

  it("returns multiple warnings for one day when applicable", () => {
    const warnings = deriveWeatherWarnings(
      forecast({ temperature2mMax: [37], windSpeed10mMax: [60] })
    );
    const types = warnings.map((w) => w.type);
    expect(types).toContain("extremeHeat");
    expect(types).toContain("highWind");
  });

  it("matches warnings to the correct day date", () => {
    const input: DailyForecast = {
      dates: ["2026-09-01", "2026-09-02"],
      temperature2mMax: [22, 38],
      temperature2mMin: [12, 20],
      precipitationSum: [0, 0],
      weatherCode: [0, 0],
      windSpeed10mMax: [10, 10],
    };
    const warnings = deriveWeatherWarnings(input);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].dayDate).toBe("2026-09-02");
  });
});
