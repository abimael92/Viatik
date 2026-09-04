# Feature Specification: Destination Coordinates, Open-Meteo Weather, and Itinerary Warnings

**Project:** Viatik  
**Owner:** Viatik Engineering  
**Status:** In Progress  
**Created:** 2026-09-03  
**Updated:** 2026-09-03  
**Releases:** 1C (Destination Coordinates & Weather Cache), 1D (Weather Warnings & UI Integration)  
**Related work:** Phase 1 technical design, `.ai/specs/trip-vault.md`

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md) before completing this template.

## What & Why

### What

Extend every trip with normalized destination coordinates (`latitude`, `longitude`, `placeId`, `timeZone`). Integrate the free Open-Meteo API to fetch daily weather forecasts for a trip’s date range, cache the forecast both locally (Dexie) and remotely (Supabase `trip_weather_forecasts`), and surface weather-aware warnings and day-level weather badges across the trip workspace, calendar, and itinerary board.

### Why

Travelers plan activities around expected weather. Bringing forecast data into the itinerary helps members dress and schedule appropriately, and automatic warnings for extreme heat, freezing temperatures, heavy rain, or high wind reduce the risk of missed outdoor planning signals.

### Users and scenarios

- **Primary user:** Trip editors and viewers
- **Scenario 1:** A trip editor selects a destination from Google Places. The trip stores normalized coordinates and timezone. On opening the trip, the weather strip loads the daily forecast for the trip dates.
- **Scenario 2:** A member opens the itinerary board. Each day column shows a compact weather badge; warnings appear for days with extreme conditions.
- **Scenario 3:** A member opens the trip on a train with no signal. The last cached forecast is shown; only stale/missing data triggers a background refresh when the device comes back online.

## In Scope

- `Trip` domain model extension: `latitude`, `longitude`, `placeId`, `timeZone`.
- Dexie schema v14 (`tripWeatherForecasts`) and Supabase migration (`trip_weather_forecasts` + `trips` coordinate columns).
- Google Places details server action to resolve coordinates and IANA timezone from a `placeId`.
- Open-Meteo weather provider adapter (`lib/weather/open-meteo-provider.ts`).
- Authenticated server action `fetchTripWeatherForecast(tripId)` verifying active trip membership.
- `DexieWeatherRepository` for local cache, outbox writes, and stale detection.
- Weather warning rule engine (`features/weather/domain/weather-warnings.ts`).
- Mobile-first UI: `TripWeatherStrip`, `WeatherDayBadge`, integration into `TripWorkspace`, `WeekCalendar`, and `ItineraryBoard`/`DayColumn`.
- Sync-engine routing and mappers for `tripWeatherForecast` outbox mutations.
- Tests for Open-Meteo mapping, warning thresholds, repository behavior, stale/offline fallback, and migration/RLS assertions.

## Out of Scope

- Hourly or minute-by-minute forecasts.
- Push notifications for weather changes.
- Historical weather / climate averages.
- Custom warning thresholds per user.
- Automatic rerouting or rescheduling of activities.

## Constraints and Design

- **Architecture boundaries:**
  - Domain types live in `features/weather/domain/weather-types.ts`.
  - The `WeatherProvider` interface is in `lib/weather/weather-provider.ts`; `OpenMeteoProvider` is the only implementation in `lib/weather/open-meteo-provider.ts`.
  - `DexieWeatherRepository` in `features/weather/data/dexie-weather-repository.ts` is the local persistence boundary.
  - The server action `app/actions/weather.ts` is the only server-side caller of `OpenMeteoProvider`.
  - UI components depend on the repository and application loader, never on `OpenMeteoProvider` or Supabase directly.
- **Data ownership:**
  - Dexie is the local source of truth for cached forecasts; Supabase is the remote sync target.
  - `trip_weather_forecasts` is a shared syncable entity: all active members read; editors write.
  - The server action returns a forecast object; the client repository persists it locally and, for editors, enqueues an outbox mutation.
- **Security requirements:**
  - Server action must verify active trip membership before calling Open-Meteo.
  - Supabase RLS: `trip_weather_forecasts` read for active members; insert/update/delete restricted to trip editors.
  - `created_by` is immutable and set by a trigger.
  - No Open-Meteo API secret is required; no user credentials or keys are logged.
- **Compatibility:**
  - Open-Meteo free API, no key.
  - Gracefully degrade when coordinates are missing or the API is unreachable.
- **SOLID/design decisions:**
  - `WeatherProvider` is an interface so the adapter can be mocked in tests.
  - Forecast data is stored as opaque JSON (`forecast_json`) in Postgres; the domain parses it into typed arrays.
  - Warnings are pure derivations from a `DailyForecast` + thresholds; no side effects.
- **Migration/rollback plan:**
  - Migration `00000000000021_trip_weather_forecasts.sql` adds columns to `trips` and creates `trip_weather_forecasts` table, indexes, triggers, RLS, and a dedicated CAS upsert function.
  - Rollback: drop the new table and columns; older app versions will ignore them.
- **Observability:**
  - Log fetch failures via `logger` with trip id and error message; do not log coordinates or user secrets.

## Acceptance Criteria

### Functional

- [ ] A `Trip` can store `latitude`, `longitude`, `placeId`, and `timeZone`.
- [ ] Selecting a Google Places suggestion resolves coordinates/timezone and persists them with the trip.
- [ ] `OpenMeteoProvider.fetchForecast` returns a typed `DailyForecast` with the requested variables.
- [ ] `fetchTripWeatherForecast` rejects requests from non-members.
- [ ] `DexieWeatherRepository` returns cached forecasts, marks stale data, and triggers background refresh.
- [ ] `deriveWeatherWarnings` returns warnings for extreme heat (>35°C), freezing (<0°C), heavy rain (>20mm), and high wind (>50km/h).
- [ ] `TripWeatherStrip` and `WeatherDayBadge` render forecast and warnings accessibly.

### Authorization and security

- [ ] `trip_weather_forecasts` RLS enforces active-member read and editor-only write.
- [ ] Server action verifies active membership before calling external API.
- [ ] No API keys or user credentials are exposed in client bundles or logs.

### Reliability and offline behavior

- [ ] Forecasts are cached in Dexie by `tripId` and `locationRevision`.
- [ ] Offline users see the last cached forecast until it expires or the location changes.
- [ ] Missing or changed coordinates trigger a new fetch rather than reusing stale data.
- [ ] Failed Open-Meteo calls surface a readable error in the UI.

### Accessibility and UX

- [ ] Weather badges have `aria-label` describing conditions and warnings.
- [ ] The weather strip is horizontally scrollable on narrow viewports.
- [ ] Focus and color-contrast follow existing component patterns.

### Verification

- [ ] Unit tests added for `OpenMeteoProvider`, `deriveWeatherWarnings`, `DexieWeatherRepository`.
- [ ] Integration tests for stale/offline fallback.
- [ ] Static migration/RLS tests in `supabase/weather-security.test.ts`.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check` pass.
- [ ] QA and Security Agent reviews attached before release.

## Implementation Plan

1. Write specification and failing tests.
2. Extend `Trip` domain, `NewTrip` contract, Dexie v14, and `trips` Supabase columns.
3. Implement `WeatherProvider` interface and `OpenMeteoProvider`.
4. Implement `fetchTripWeatherForecast` server action and `getPlaceDetails` coordinate resolver.
5. Implement `DexieWeatherRepository` and `loadTripWeatherForecast` application loader.
6. Add `trip_weather_forecasts` migration, mappers, `OutboxEntityType`, sync-engine routing, and `cloud-sync` table registration.
7. Implement warning rules and weather UI components.
8. Integrate weather strip and day badges into `TripWorkspace`, `WeekCalendar`, `ItineraryBoard`, and `DayColumn`.
9. Run green verification and update completion notes.
10. Hand off to QA and Security Agent.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Forecast load success rate | 0% | 95% | Server action success logs | Engineering |
| Warning accuracy | 0% | 100% threshold hit-rate | Unit tests | Engineering |
| Offline forecast availability | 0% | 100% when cached | Manual test | QA |
| Type/lint/build pass | false | true | CI | Engineering |

## Risks and Open Questions

- **Risk:** Open-Meteo rate limits or temporary outages. *Mitigation:* cache aggressively, surface errors gracefully, avoid fetching more than once per location/date set per hour.
- **Risk:** Google Places details API incurs additional cost. *Mitigation:* only call on explicit selection; keep field mask minimal (`location`, `timeZone`).
- **Question:** Should forecast cache TTL be configurable per trip? Decision deadline: end of Phase 1D.
- **Question:** Do we need a separate server-side cron to refresh forecasts, or is on-demand + sync sufficient? Decision deadline: end of Phase 1D.

## Completion Notes

- **Verification commands:** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`
- **Verification results:** PASS
  - `pnpm typecheck` passed
  - `pnpm lint` passed
  - `pnpm test` passed (177 tests)
  - `pnpm build` passed
  - `git diff --check` passed
- **Bug-ledger updates:** Not applicable
- **Follow-up work:** QA and Security Agent review
