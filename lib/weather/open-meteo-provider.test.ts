import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenMeteoProvider, WeatherError } from "@/lib/weather/open-meteo-provider";

describe("OpenMeteoProvider", () => {
  const provider = new OpenMeteoProvider();

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockResponse(payload: object, ok = true, status = 200) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok,
      status,
      json: async () => payload,
    } as Response);
  }

  it("maps a valid Open-Meteo response to a DailyForecast", async () => {
    mockResponse({
      daily: {
        time: ["2026-09-01", "2026-09-02"],
        temperature_2m_max: [28, 30],
        temperature_2m_min: [18, 20],
        precipitation_sum: [0, 12],
        weathercode: [0, 61],
        wind_speed_10m_max: [10, 25],
      },
    });

    const forecast = await provider.fetchForecast({
      latitude: 35.6762,
      longitude: 139.6503,
      startDate: "2026-09-01",
      endDate: "2026-09-02",
      timeZone: "Asia/Tokyo",
    });

    expect(forecast.dates).toEqual(["2026-09-01", "2026-09-02"]);
    expect(forecast.temperature2mMax).toEqual([28, 30]);
    expect(forecast.precipitationSum).toEqual([0, 12]);
    expect(forecast.weatherCode).toEqual([0, 61]);

    const request = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(request).toContain("latitude=35.6762");
    expect(request).toContain("longitude=139.6503");
    expect(request).toContain("timezone=Asia%2FTokyo");
  });

  it("falls back to auto timezone when none is provided", async () => {
    mockResponse({
      daily: {
        time: ["2026-09-01"],
        temperature_2m_max: [20],
        temperature_2m_min: [10],
        precipitation_sum: [0],
        weathercode: [1],
        wind_speed_10m_max: [5],
      },
    });

    await provider.fetchForecast({
      latitude: 0,
      longitude: 0,
      startDate: "2026-09-01",
      endDate: "2026-09-01",
    });

    const request = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(request).toContain("timezone=auto");
  });

  it("rejects invalid coordinates", async () => {
    await expect(
      provider.fetchForecast({
        latitude: 95,
        longitude: 0,
        startDate: "2026-09-01",
        endDate: "2026-09-01",
      })
    ).rejects.toBeInstanceOf(WeatherError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects when start date is after end date", async () => {
    await expect(
      provider.fetchForecast({
        latitude: 0,
        longitude: 0,
        startDate: "2026-09-02",
        endDate: "2026-09-01",
      })
    ).rejects.toBeInstanceOf(WeatherError);
  });

  it("throws WeatherError on API errors", async () => {
    mockResponse({ error: true, reason: "Parameter 'latitude' is invalid" }, false, 400);
    await expect(
      provider.fetchForecast({
        latitude: 0,
        longitude: 0,
        startDate: "2026-09-01",
        endDate: "2026-09-01",
      })
    ).rejects.toBeInstanceOf(WeatherError);
  });

  it("throws when returned arrays are mismatched", async () => {
    mockResponse({
      daily: {
        time: ["2026-09-01", "2026-09-02"],
        temperature_2m_max: [20],
      },
    });

    await expect(
      provider.fetchForecast({
        latitude: 0,
        longitude: 0,
        startDate: "2026-09-01",
        endDate: "2026-09-02",
      })
    ).rejects.toBeInstanceOf(WeatherError);
  });

  it("handles network failures", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));
    await expect(
      provider.fetchForecast({
        latitude: 0,
        longitude: 0,
        startDate: "2026-09-01",
        endDate: "2026-09-01",
      })
    ).rejects.toBeInstanceOf(WeatherError);
  });
});
