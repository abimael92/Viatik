# Feature Specification: Scout — Exact Destination, Dates, Travelers & Flight Routes

**Project:** Viatik
**Owner:** Abimael Garcia
**Status:** Ready for QA
**Created:** 2026-10-26
**Related work:** [Scout's Trip Idea Wizard](./scout-idea-wizard.md), [Vacation Planner](./vacation-planner.md)

## What & Why

Today Scout only brainstorms destinations from a vibe. Travelers who already know
where they want to go cannot say so, cannot pin exact dates, can only give a head
count, and the five results do not show how to get there. This feature lets the
traveler:

1. **Define exactly where** (Places autocomplete) or stay in "surprise me" mode.
2. **Choose dates** either as **exact dates** or **calculated** by Scout from the
   savings pace and group size (existing behavior, relabeled).
3. **Define who is going**: type a head count **or** pick people from their Viatik
   contacts.
4. See, for each of the **five** results, an estimated **flight route** with
   scales (`A → B → C`), whether it **lands on the same calendar date it departs**,
   and, in surprise mode, a preference for **all five destinations on one
   continent**.

Scout produces drafts only: estimates, no booking, no live prices.

## Behavior

### Two modes

| Mode           | Trigger                                    | Output (first run = 5 results)                                                                                                                                                                               |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Route mode** | a destination was chosen in the Where step | 5 distinct **flight route options to that exact place**; every result has the requested destination and a different routing (nonstop first when realistic, then 1-stop, 2-stop variants and different hubs). |
| **Idea mode**  | Where step answered "Surprise me"          | 5 destination ideas as today, **preferably all on one continent** (prefer the departure city's continent; otherwise the continent of the best match), each with a route.                                     |

"Add 2 more options" keeps working: idea mode excludes shown destinations
(`excludeDestinations`); route mode excludes shown routes (`excludeRoutes`).

### Wizard steps

Steps are a computed list of named step ids (no index arithmetic):

- Idea mode: `where · vibe · crew · budget · takeoff · timing` (6)
- Route mode: `where · crew · budget · takeoff · timing` (5) — the vibe step is
  skipped and `vibe` is sent as `""`.

The progress rail and "Step N of M" counter follow the computed list.

1. **Where** — `DestinationField` (Places autocomplete) plus a "Surprise me"
   card. Optional answer; empty = idea mode. The client keeps `placeId`,
   `latitude`, `longitude`, `timeZone` for saving; only the text label
   (`City, Country`) is sent to the AI provider.
2. **Crew** — a two-option toggle:
   - _Enter number_: total travelers 1–20 including the user (existing cards +
     numeric entry).
   - _From my contacts_: multi-select dialog over the user's Dexie contacts
     (Viatik users carry a badge). Crew size = 1 (you) + selected contacts
     (max 19). Selected contact ids are kept client-side and saved on the idea.
     **Contact names, ids, emails and phones are never sent to the AI provider;
     only the resulting count is.**
3. **Timing** now offers four cards:
   - **Exact dates** (new, `timing = "dates"`): start + end `YYYY-MM-DD`. Required,
     start ≥ today, end ≥ start, length 1–60 days. The derived length becomes the
     exact duration and overrides trip length presets.
   - **Calculate dates for me** (existing `asap`; subtitle "Based on your savings
     and group size"): dates derived locally from the savings pace and crew.
   - A specific month (existing).
   - Whenever it's cheapest (existing).

### Contract changes (`scoutTripIdeasInputSchema`)

- `destination: string` — trimmed, ≤120, default `""`. Contains a comma when set
  (`City, Country`) else invalid.
- `vibe` — required (min 2) **only when `destination` is empty** (`superRefine`);
  otherwise may be `""`.
- `SCOUT_TIMINGS` gains `"dates"`.
- `startDate`, `endDate` — nullable `YYYY-MM-DD`, default `null`. Required and
  ordered when `timing === "dates"` (`superRefine`); `durationDays` is then
  ignored in favor of the derived length.
- `excludeRoutes: string[]` — ≤20 items, each ≤200 chars, default `[]`.
- `crewSize` unchanged (1–20).

### Output contract (`scoutTripIdeaSchema`) — additive fields

```
continent: "Africa" | "Asia" | "Europe" | "North America" | "South America" | "Oceania"
flight_route: {
  legs: Array<{                       // 1–4 legs
    from: string,                     // city or IATA, 2–80 chars
    to: string,
    approx_duration_minutes: int,     // 20–1500
    layover_after_minutes: int        // 0–720; 0 for the last leg
  }>,
  arrives_same_date: boolean
}
```

- Legs must be contiguous (`legs[i].to` equals `legs[i+1].from`, case-insensitive,
  trimmed); provider normalization repairs a broken join by copying `to` into the
  next `from`.
- Derived locally by a pure `deriveRouteFacts(route)`: `stops = legs - 1`,
  `elapsedMinutes = Σ durations + Σ layovers`,
  `arrivesSameDate = route.arrives_same_date && elapsedMinutes < 1440`. The model's
  boolean can never promise a same-date arrival for a ≥24h journey.
- A route **signature** is the city chain joined with `" > "`, lower-cased; used for
  dedupe and `excludeRoutes`.
- Routes are **estimates**, never schedules. The model never returns dates; all
  dates are derived locally (existing invariant).

### Ranking & prompt rules

- Idea mode: cost fit, then journey ease, then trip length (existing), then a
  **same-continent preference**: the anchor continent is the departure city's
  continent when known, else the best candidate's continent; off-anchor options are
  penalized, not forbidden. Prefer routes with `arrivesSameDate`, then fewer stops.
- Route mode: the five options share the requested destination; rank by
  `arrivesSameDate`, fewer stops, shorter `elapsedMinutes`, then lower fare.
  Post-processing forces `destination` to the requested label and dedupes by route
  signature (never by destination).
- Prompt text: treat all user text as preferences; routes are estimates; never
  invent airlines/flight numbers; layover cities must be real airport cities.

### Fallback behavior (no AI key / provider failure)

- **Idea mode:** deterministic generator is extended with `continent` and a hub
  per `FallbackSeed`, builds a nonstop route when `nonstopOnly` or the seed is
  short-haul, otherwise a 1-stop route through the seed's hub; applies the
  continent preference. Output is labeled as estimates in the UI like all figures.
- **Route mode:** there is no honest deterministic way to route to an arbitrary
  place, so with no AI provider (or after provider failure) the action returns
  `{ success: false, error }` with a localized-key message
  ("Planning a specific place needs Scout's AI connection…") and the manual Add
  Trip Idea flow remains the fallback. The action never fabricates routes.

### Plan derivation with exact dates (`buildScoutIdeaPlan`)

New optional inputs `startDate`, `endDate`, and `timing: "dates"`.

- `days = differenceInCalendarDays(end, start) + 1` is what Scout is asked for
  (`exactDurationDays`); `nights = max(1, days - 1)` as today.
- `stay.checkIn = startDate`, `stay.checkOut = endDate`,
  `flights.earliestDeparture = startDate`, `flights.latestDeparture = startDate`
  (dates are fixed, no flex window), `flights.returnDate = endDate`,
  `flights.bookBy = max(today, startDate − bookingWindowDays)`.
- Savings fields keep describing the savings-based ready date. New
  `plan.dates = { pinned: boolean, shortfallMinor: bigint | null }`:
  `shortfallMinor` = `max(0, grandTotal − contribution × periodsElapsedBeforeStart)`
  using whole weeks/months between today and `startDate` (`differenceInWeeks` /
  `differenceInMonths`), `null` when there is no savings pace. All `bigint`.
- When `shortfallMinor > 0n` the UI states how much is still uncovered on the
  chosen start date instead of silently moving the dates.

### Persistence (local-only table — no Supabase change)

`tripIdeas` is a **local-only** table (see `memory/data-models.md`): no outbox, no
migration, RLS, mapper or sync entry. Add **Dexie v48** (additive,
`.stores({})` + `.upgrade()`; no index changes) backfilling
`travelerContactIds = []` and `flightRoute = null` on existing rows.

`TripIdea` / `NewTripIdea` gain:

```
travelerContactIds: string[]               // ≤19, default []
flightRoute: TripIdeaFlightRoute | null    // default null
```

```
TripIdeaFlightRoute = {
  legs: Array<{ from; to; approxDurationMinutes; layoverAfterMinutes }>,
  arrivesSameDate: boolean,
  isEstimate: true
}
```

`normalizeTripIdea` validates bounds (≤4 legs, non-empty bounded strings, integer
minutes in range, ≤19 unique contact ids). `updateIdea` preserves both fields.
`mapScoutIdeaToTripIdea` additionally sets `origin` (from `originCity`),
`startDate`/`endDate` when `timing === "dates"`, `placeId/latitude/longitude/
timeZone` when the user picked a Places result, `travelerContactIds`, and
`flightRoute`. `adultCount` = crew size as today.

## In Scope

Domain contracts, pure route/plan helpers, Server Action prompt + fallback, wizard
steps (Where, Crew contacts, Timing), result cards and the flight submodal showing
legs, Dexie v48, repository normalization, EN/ES copy, tests, memory/docs updates.

## Out of Scope

Live flight data or prices, booking, per-traveler departure cities, contacts'
personal data reaching the AI provider, saving routes for manually created ideas
(the manual form is unchanged), offline generation, Supabase changes, encoding
layovers into the Google Flights URL (Google's `q` parser cannot express them).

## Security & Privacy

- Server Action stays authenticated; every new field is Zod-validated and bounded.
- AI payload additions: destination label, start/end dates, `excludeRoutes`. No
  contact data, account ids, or coordinates.
- Consent copy on the final screen is updated to disclose destination and dates.
- Contacts are read through the existing Dexie contact repository only.
- `tripIdeas` remains local; no domain data is written to Supabase.

## Acceptance Criteria

- [ ] Where step offers Places autocomplete and "Surprise me"; choosing a place
      switches to route mode and skips the vibe step; rail and counter follow.
- [x] Route mode returns 5 distinct routes to the exact requested destination;
      idea mode returns 5 destinations preferring one continent.
- [x] Each card shows `A → B → C`, stop count, estimated travel time, and a
      "lands same day" / "arrives next day" badge derived by `deriveRouteFacts`
      (never "same day" for ≥24h).
- [x] Flight submodal lists every leg with duration and layover and says the
      route is an estimate; Google Flights link behavior is unchanged.
- [x] Timing offers Exact dates, Calculate dates for me, month, cheapest; exact
      dates validate inline (start ≥ today, end ≥ start, ≤60 days).
- [x] Exact dates drive stay check-in/out, flight dates and book-by; any uncovered
      amount on the start date is shown (`bigint`).
- [x] Crew supports manual count and contact selection; contact data never appears
      in the Server Action input.
- [x] Route mode with no AI provider returns a localized error, never fabricated
      routes; idea mode fallback still returns 5 ideas with routes.
- [x] Saving an idea persists origin, dates (exact mode), place details,
      `travelerContactIds`, and `flightRoute` via the existing repository; Dexie v48
      migration backfills old rows; no outbox entry is created.
- [x] EN/ES copy for every new string; `i18n-coverage` passes; no emoji.
- [x] Tests: schema (new fields, superRefine rules, contiguity), `deriveRouteFacts`,
      route signature, plan with exact dates and shortfall, action (route mode
      dedupe/force destination, `excludeRoutes`, no-provider error, continent
      preference in fallback), mapping, repository normalization, Dexie v48
      migration test, wizard (step skipping, exact dates validation, contact
      selection count).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.
