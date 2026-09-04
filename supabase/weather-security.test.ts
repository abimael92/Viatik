import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(__dirname, "migrations/00000000000021_trip_weather_forecasts.sql");
const migration = readFileSync(migrationPath, "utf8");

describe("trip_weather_forecasts migration security", () => {
  it("creates the trip_weather_forecasts table with expected columns", () => {
    expect(migration).toContain("create table public.trip_weather_forecasts");
    expect(migration).toContain("trip_id uuid not null references public.trips");
    expect(migration).toContain("forecast_json jsonb");
    expect(migration).toContain("location_revision text not null");
    expect(migration).toContain("unique (trip_id)");
  });

  it("enables row level security and restricts writes to editors", () => {
    expect(migration).toContain("alter table public.trip_weather_forecasts enable row level security");
    expect(migration).toMatch(/trip_weather_forecasts_insert_editors[\s\S]*public\.is_trip_editor\(trip_id\)/);
    expect(migration).toMatch(/trip_weather_forecasts_update_editors[\s\S]*public\.is_trip_editor\(trip_id\)/);
    expect(migration).toMatch(/trip_weather_forecasts_delete_editors[\s\S]*public\.is_trip_editor\(trip_id\)/);
  });

  it("allows read access for active trip members", () => {
    expect(migration).toMatch(
      /trip_weather_forecasts_select_active_members[\s\S]*public\.is_active_trip_member\(trip_id, auth\.uid\(\)\)/
    );
  });

  it("adds coordinate columns to public.trips", () => {
    expect(migration).toContain("add column latitude");
    expect(migration).toContain("add column longitude");
    expect(migration).toContain("add column place_id");
    expect(migration).toContain("add column time_zone");
  });

  it("exports a dedicated CAS upsert function only to authenticated users", () => {
    expect(migration).toContain("create or replace function public.sync_trip_weather_forecast_cas_upsert");
    expect(migration).toContain("grant execute on function public.sync_trip_weather_forecast_cas_upsert");
    expect(migration).toContain("to authenticated");
  });
});
