# Feature Specification: Scout's Trip Idea Wizard

**Project:** Viatik
**Owner:** Abimael Garcia
**Status:** Ready for QA
**Created:** 2026-10-19
**Updated:** 2026-10-21
**Related work:** [Vacation Planner](./vacation-planner.md), [AI Activity Scout](./ai-activity-scout.md)

## What & Why

Add a conversational Scout flow to the existing Want to Go planner. Scout asks
about the user's desired trip vibe, crew size, and weekly/monthly savings
capacity, then requests **five** structured destination ideas ordered
best-match-first from Google Gemini (with OpenAI as an optional fallback). The
user can review estimates and outbound Google Travel links, reveal richer
details, ask for **two more** options, and save a selected idea to the existing
local planner.

"Best match" is defined explicitly: the closest options by total group cost
relative to the stated savings pace, then by travel ease (lower round-trip
fare), then by shorter trip length. Scout must never present a distant,
expensive, or long-haul option as the top match.

This flow creates draft destination ideas only. It does not create an itinerary,
book travel, or provide financial advice.

## In Scope

- A keyboard-accessible, responsive wizard with **five required question
  screens** — vibe, crew size, savings pace, departure city, and timing — plus
  one skippable **Fine-tune** screen. One question is visible at a time, with
  answer chips/free text, loading/error states, a manual-add fallback action,
  and consent before answers are sent to the AI provider.
- **Departure city** uses the existing Places autocomplete and is pre-filled
  from the most recent saved idea so the traveler rarely types it.
- **Timing** is one of *as soon as I've saved enough*, *a specific month*, or
  *whenever it's cheapest*. A pinned month defers the recommended departure to
  that month but never earlier than the savings goal.
- **Fine-tune** bundles trip length, pace/comfort, stay style, a nonstop
  preference, and one free-text constraint line. Skipping it sends the defaults.
- The wizard never asks for a budget ceiling, age, or gender.
- An authenticated Server Action with input validation, enriched per-traveler
  savings horizon benchmarks, and strict Zod output validation using Google
  Gemini (`GEMINI_API_KEY`) as primary provider, OpenAI (`OPENAI_API_KEY`) as
  secondary provider, and a deterministic vibe- and savings-aware fallback
  generator when neither API key is configured or remote providers are
  unavailable. API keys remain server-only.
- **Five** ranked suggestion cards on the first run, each with destination,
  ideal season, historical per-person flight and daily-cost baselines, duration,
  pitch, match badge, and supported planner currency.
- An **Add 2 more options** action that requests two additional distinct
  destinations, excluding every destination already shown.
- Saving a selected suggestion through the existing TripIdea and
  TripSavingsPlan repositories, without changing the Dexie schema.
- In-app **flight details** and **stay details** submodals that restate the
  traveler's exact search criteria (route, dates, travelers, cabin, stops), say
  **why** that option was picked, and show the estimate breakdown. The primary
  action opens a **pre-filtered** provider search rather than a generic landing
  page, so tapping a card never navigates away until the traveler asks.
- A clear historical-estimate disclaimer wherever an estimate is shown.
- An inline **View details** panel per suggestion covering the budget
  breakdown, the savings timeline, the recommended flight booking window, and a
  hotel-versus-Airbnb cost comparison.
- Full English and Spanish copy for the wizard, the trip planner trigger, and
  every detail section, including the fallback provider's season and pitch text.
- A distinctive, animated conversational surface: card-toned header with a 2px
  gradient accent rail, ambient glow behind the avatar, typewriter dialogue on
  the first question only, animated step transitions, a progress indicator,
  staggered compact rows, rank badges, and hover lift — all gated by
  `useReducedMotion()`.
- Compact, expandable result rows (horizontal snap-scroll on mobile), a single
  consolidated disclaimer, and a dashed "add more" card at the end of the list.

## Out of Scope

- Offline generation of Scout's destination recommendations. The wizard is
  disabled offline and the manual Add Trip Idea flow remains available.
- Live prices, booking, currency conversion, price guarantees, itineraries, or
  direct UI access to Supabase.
- Live Airbnb or hotel rate lookups. The app has no Airbnb pricing API; stay
  comparisons are estimates derived from Scout's own figures plus outbound
  search links.
- Persisting the stated savings capacity or adding fields/tables to Dexie.

## Constraints and Design

- **Architecture:** `features/trip-planner/domain` owns Zod contracts, a pure
  plan builder (`scout-idea-plan.ts`), and a pure mapping to `NewTripIdea`; the
  client wizard calls `app/actions/scout-trip-ideas.ts` and writes only through
  existing Trip Planner repositories.
- **Data ownership:** Dexie remains authoritative for saved ideas and plans.
  Creating an idea uses the existing repository transaction; the savings plan
  keeps zero current savings and adopts the user's weekly/monthly cadence.
- **Money:** Flight, daily, hotel, and Airbnb estimates are integer amounts in
  the user's supported profile currency, not an inferred destination currency.
  Minor units and every total are calculated with `bigint`; no FX conversion is
  performed.
- **Estimate semantics:** `estimated_flight_cost_per_person` is a round-trip
  fare per traveler. `estimated_daily_budget_per_person` covers meals, local
  transport, and activities per traveler and **excludes lodging**.
  `estimated_hotel_per_night` and `estimated_alt_stay_per_night` are per night
  for the whole group (one room or one rental).
- **Plan derivation:** The savings timeline, ready date, booking window, and
  stay comparison are derived locally by `buildScoutIdeaPlan` from the
  user's inputs and Scout's estimates. The model never returns dates, so it
  cannot invent a calendar. Nights are `max(1, durationDays - 1)`.
- **Flight timing:** The earliest feasible departure is the day the savings
  goal is reached. The recommended booking window is 12 weeks for long-haul
  fares (per-traveler flight ≥ 700 whole units) and 8 weeks otherwise, and the
  book-by date is never earlier than today.
- **Provider links:** Google Flights parses `q` as a search-box query, so two
  things silently drop the whole search to the marketing homepage:
  1. **Word order.** `Flights from {origin} to {destination} on {depart}
     through {return} [nonstop] [{n} passengers]` populates the form;
     `Flights to {destination} from {origin} …` does not.
  2. **Locale-sensitive words.** Appending the English cabin phrase
     `economy class` breaks the parse whenever `hl` is not English. Cabin is
     therefore never encoded — Google Flights already opens on Economy, and the
     submodal says so.

  With no origin, Google starts from the viewer's location and the UI says so.
  Airbnb needs a hyphenated slug (`Kyoto--Japan`), not a percent-encoded comma.
- **Privacy/security:** Before generation, disclose and obtain consent to send
  only the user's vibe, crew size, savings capacity/cadence, and supported
  currency to the configured AI provider. Do not send account identifiers or
  saved wishlist data. Authenticate and validate the Server Action input; never
  return or log the API key or sensitive answers.
- **Estimates:** The model must frame amounts as historical baselines, never
  promises. Display estimates as per-person flight and daily costs plus a
  group nightly stay rate; calculate the whole-crew savings goal locally from
  integer amounts and duration.
- **Offline:** Detect connectivity in the client and disable opening/generation
  while offline. Keep Add Trip Idea usable as the fallback.
- **Schema/migration:** None. Reuse `TripIdea`, `TripSavingsPlan`, and the
  existing Google Travel URL builders.

## Acceptance Criteria

- [x] Scout asks about vibe, crew, and savings amount/cadence one step at a time.
- [x] The wizard is unavailable offline, while manual idea creation remains
      available.
- [x] The action requires an authenticated user, validates bounded input, and
      returns Zod-validated suggestions using Gemini or OpenAI when configured
      and falling back to deterministic vibe/budget-matched suggestions when
      providers are unconfigured or unavailable.
- [x] The first run returns **five** distinct destinations ordered
      best-match-first, and the order reflects cost fit, travel ease, then trip
      length.
- [x] **Add 2 more options** returns two additional destinations that exclude
      every destination already displayed.
- [x] Fallback season and pitch text render in the requested locale.
- [x] Selecting a suggestion creates a local TripIdea and updates its existing
      TripSavingsPlan with the selected cadence and zero current savings.
- [x] Flight and total cost estimates are converted to minor units and calculated
      using `bigint`; no Dexie schema or Supabase/outbox changes occur.
- [x] Cards show the AI historical-estimate disclaimer and open in-app details
      submodals instead of navigating away; provider links are secondary
      actions inside those submodals.
- [x] Tests cover schema constraints, malformed model responses, money mapping,
      saving cadence mapping, offline gating, and successful wizard handoff.
- [x] Every suggestion card shows a one-line savings summary (periods, ready
      date, book-by date) computed with `bigint`.
- [x] **View details** expands inline and shows the flights, stay, daily, and
      total budget breakdown for the whole crew.
- [x] **View details** shows the recommended booking window, book-by date, and
      earliest/latest departure dates, and links flights for the earliest
      departure.
- [x] **View details** compares hotel and Airbnb nightly and total costs and
      links both providers; both are labelled as estimates, not live rates.
- [x] **Flight details** and **Stay details** open a nested submodal with the
      estimate breakdown and dates, and the wizard stays open behind it.
- [x] The flight submodal restates route, departure, return, travelers, cabin,
      and stop preference, explains why the option was picked, and its primary
      action opens Google Flights pre-filtered with those exact criteria.
      Verified in a live browser: the form shows the route, both dates, the
      passenger count, and the Nonstop filter when requested.
- [x] The stay submodal restates check-in, check-out, guests, and nights, and
      its primary action opens Airbnb pre-filtered with those dates and guests.
- [x] All wizard copy, including the trigger and every detail section, renders
      in English and Spanish through `lib/i18n`.
- [x] The wizard runs five required screens plus one skippable Fine-tune screen
      and never asks for a budget ceiling, age, or gender.
- [x] A departure city is collected through Places autocomplete and pre-filled
      when a previous idea already has one.
- [x] A pinned travel month defers the recommended departure but never precedes
      the savings goal.
- [x] Fine-tune choices change the estimates: trip length bends duration,
      comfort shifts stay/daily costs, and a rental preference makes the rental
      rate the savings goal.
- [x] Result rows collapse to destination, trip goal, one tag, and a chevron;
      only one row expands at a time, and only the first question types itself
      out.
- [x] Loading renders skeleton placeholders, and a short result set explains
      itself instead of silently showing fewer cards.

## Verification

Run the affected Vitest suites, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
Record actual results and known limitations in Completion Notes before release.

## Completion Notes

- **Verification results:** Full suite `pnpm test` — 216 files / 1,393 tests
  passed. `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check`
  passed. Provider links were also exercised against the live sites: Google
  Flights populated origin, destination, both dates, passenger count, and the
  Nonstop filter in both `hl=en` and `hl=es`; Airbnb resolved the slug to
  "Homes in Kyoto" with the correct dates and guest count. Focused coverage includes `scout-idea-plan.test.ts` (budget math,
  savings timeline, booking window, pinned month, stay check-in/check-out,
  return date, zero-decimal currency), `google-travel-links.test.ts` and
  `stay-links.test.ts` (pre-filtered provider URLs and input bounds),
  `scout-idea-wizard.test.tsx` (five-step flow, origin, pinned month, fine-tune
  and Skip, skeletons, expand/collapse, add-two-more, exhaustion, pre-filtered
  flight/stay submodals with the reason for the pick, save handoff, offline
  gating), `scout-trip-ideas.test.ts` (ranked ideas array, provider schemas,
  prompt payload, trip-length and comfort effects, rental goal, duplicate
  filtering, Spanish fallback, malformed responses),
  `scout-trip-ideas-schema.test.ts` (input defaults and bounds), and
  `i18n-provider.test.tsx` (English/Spanish Scout copy and placeholders).
- **Security review:** Server Action authentication, input/output validation,
  consent, server-only key handling (`GEMINI_API_KEY` primary, `OPENAI_API_KEY`
  fallback), and data minimization reviewed during implementation. The exclusion
  list only ever carries destination names the user already saw. Outbound
  searches send only the destination and locally computed dates, and the UI
  discloses that before navigation. Independent Security Agent review remains
  pending.
- **Known limitations:** Stay costs, flight windows, and savings timelines are
  deterministic estimates, not live availability or fares. Airbnb and hotel
  rates come from Scout's own figures plus outbound search links; no pricing
  API is called. The booking window is a planning heuristic (12 weeks for
  long-haul fares, 8 weeks otherwise). Live-provider prose follows the requested
  language through the prompt but is not schema-enforced; the deterministic
  fallback is fully localized.
- **Follow-up work:** Configure `GEMINI_API_KEY` (and optional `OPENAI_API_KEY`
  fallback) in deployment and manually QA the animated wizard, the Spanish
  copy, and the Google/Airbnb links with a configured provider.
