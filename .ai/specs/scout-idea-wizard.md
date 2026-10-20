# Feature Specification: Scout's Trip Idea Wizard

**Project:** Viatik
**Owner:** Abimael Garcia
**Status:** Ready for QA
**Created:** 2026-10-19
**Updated:** 2026-10-19
**Related work:** [Vacation Planner](./vacation-planner.md), [AI Activity Scout](./ai-activity-scout.md)

## What & Why

Add a conversational Scout flow to the existing Want to Go planner. Scout asks
about the user's desired trip vibe, crew size, and weekly/monthly savings
capacity, then requests three structured destination ideas from OpenAI. The user
can review estimates and outbound Google Travel links and save a selected idea
to the existing local planner.

This flow creates draft destination ideas only. It does not create an itinerary,
book travel, or provide financial advice.

## In Scope

- A keyboard-accessible, responsive, three-question wizard with one question
  visible at a time, answer chips/free text, loading/error states, and consent
  before answers are sent to OpenAI.
- An authenticated Server Action with input validation and OpenAI strict JSON
  Schema output validation. The API key is server-only.
- Three suggestion cards with destination, ideal season, historical per-person
  flight and daily-cost baselines, duration, pitch, and supported planner
  currency.
- Saving a selected suggestion through the existing TripIdea and
  TripSavingsPlan repositories, without changing the Dexie schema.
- Google Travel links created by the existing verified link builders and a
  clear historical-estimate disclaimer.

## Out of Scope

- Offline generation of Scout's destination recommendations. The wizard is
  disabled offline and the manual Add Trip Idea flow remains available.
- Live prices, booking, currency conversion, price guarantees, itineraries, or
  direct UI access to Supabase.
- Persisting the stated savings capacity or adding fields/tables to Dexie.

## Constraints and Design

- **Architecture:** `features/trip-planner/domain` owns Zod contracts and a pure
  mapping to `NewTripIdea`; the client wizard calls `app/actions/scout-trip-ideas.ts`
  and writes only through existing Trip Planner repositories.
- **Data ownership:** Dexie remains authoritative for saved ideas and plans.
  Creating an idea uses the existing repository transaction; the savings plan
  keeps zero current savings and adopts the user's weekly/monthly cadence.
- **Money:** Flight and daily estimates are integer amounts in the user's
  supported profile currency, not an inferred destination currency. Minor units
  and trip totals are calculated with `bigint`; no FX conversion is performed.
- **Privacy/security:** Before generation, disclose and obtain consent to send
  only the user's vibe, crew size, savings capacity/cadence, and supported
  currency to OpenAI. Do not send account identifiers or saved wishlist data.
  Authenticate and validate the Server Action input; never return or log the
  API key or sensitive answers.
- **Estimates:** The model must frame amounts as historical baselines, never
  promises. Display estimates as per-person flight and daily costs; calculate
  the whole-crew savings goal locally from integer amounts and duration.
- **Offline:** Detect connectivity in the client and disable opening/generation
  while offline. Keep Add Trip Idea usable as the fallback.
- **Schema/migration:** None. Reuse `TripIdea`, `TripSavingsPlan`, and the
  existing Google Travel URL builders.

## Acceptance Criteria

- [x] Scout asks about vibe, crew, and savings amount/cadence one step at a time.
- [x] The wizard is unavailable offline, while manual idea creation remains
      available.
- [x] The action requires an authenticated user, validates bounded input, and
      returns exactly three Zod-validated suggestions using OpenAI strict JSON
      Schema output.
- [x] Selecting a suggestion creates a local TripIdea and updates its existing
      TripSavingsPlan with the selected cadence and zero current savings.
- [x] Flight and total cost estimates are converted to minor units and calculated
      using `bigint`; no Dexie schema or Supabase/outbox changes occur.
- [x] Cards show the AI historical-estimate disclaimer and existing Google
      Travel outbound links.
- [x] Tests cover schema constraints, malformed model responses, money mapping,
      saving cadence mapping, offline gating, and successful wizard handoff.

## Verification

Run the affected Vitest suites, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
Record actual results and known limitations in Completion Notes before release.

## Completion Notes

- **Verification results:** `pnpm test` passed (210 files / 1,325 tests),
  `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed. The wizard, action,
  schema, and money-mapping tests passed.
- **Security review:** Server Action authentication, input/output validation,
  consent, server-only key handling, and data minimization reviewed during
  implementation; independent Security Agent review remains pending.
- **Follow-up work:** Configure `OPENAI_API_KEY` in deployment and manually QA
  the responsive wizard and Google Travel links with a configured provider.
