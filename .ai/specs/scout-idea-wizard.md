# Feature Specification: Scout's Trip Idea Wizard

**Project:** Viatik
**Owner:** Abimael Garcia
**Status:** Ready for QA
**Created:** 2026-10-19
**Updated:** 2026-10-25
**Related work:** [Vacation Planner](./vacation-planner.md), [AI Activity Scout](./ai-activity-scout.md), [Scout — Exact Destination, Dates, Travelers & Flight Routes](./scout-exact-destination-routes.md)

> **Update (2026-10-26):** the newer spec adds a Where step (named step list, 6 screens in idea mode / 5 in route mode), contact-based crews, exact dates, and per-idea flight routes. The "five screens" acceptance notes below describe the pre-Where flow.

## Conversational co-planner pass (2026-10-25)

Scout stopped reading as a five-step form and started reading as a planning
conversation with a well-traveled friend.

- **Voice:** the dialog is titled **Let's find your kind of trip** — a spoken
  invitation, not a branded feature name, and still distinct from the
  **Ask Scout for ideas** trigger. Scout speaks in the first person
  ("Tap a vibe, or tell me in your own words.", "I'll take it from there.",
  "I'll use your travel preferences to find ideas that fit."). The rail reads
  *Vibe · The Crew · Budget · Takeoff · Timing*; the subtitle keeps the
  `Step N of 5 · <step>` counter.
- **Questions are invitations, not fields.** "Picture your next getaway. What's
  the main feeling you're craving?", "Who are we scheming this trip for?",
  "Let's keep this trip guilt-free. What's comfortable to set aside?", "Where are
  you taking off from?", "When are you dreaming of packing your bags?"
- **No emoji anywhere.** Answer anchors are `lucide-react` icons (Waves /
  Building2 / Trees for the vibes, User / Heart / Users for the crew,
  PiggyBank / CalendarDays / TrendingDown for timing) and the primary CTA is
  plain text. Icons are decorative (`aria-hidden`) so they never enter an
  accessible name.
- **Answer chips carry a mood anchor.** The three vibe chips render an icon and
  the labels are the vibe text that is sent to Scout, so the free-text field
  never contradicts the chip the traveler tapped.
- **Crew and timing are tactile cards**, not buttons: an icon anchor, a title,
  an optional one-line subtitle, `rounded-xl border bg-card/60 p-4`, and a
  selected state of `ring-2 ring-primary border-primary bg-primary/5 shadow-sm`.
  Selection is exposed with `aria-pressed`, never color alone.
- **Micro-feedback.** Picking a vibe, crew size, or timing card makes Scout react
  in one short line inside the speech bubble (`Nothing beats ocean air.`,
  `Solo trips are the best for recharging.`). The line lives in an `aria-live`
  region, is derived from the current answer (so it disappears when the traveler
  types their own vibe), and never appears for a default the traveler did not
  choose.
- **Budget quick pills.** `$100 / $250 / $500` in whole units of the traveler's
  planner currency (`scoutBudgetPresets`), one tap to fill the amount. Values are
  per-currency constants, not a live FX conversion, because Scout must work
  without a network round-trip.
- **Motion is directional** (`x: ±18px` fade/slide depending on forward vs back)
  and remains gated by `useReducedMotion()`.
- **Results read editorially.** The `scout_pitch` is surfaced directly under the
  destination in every row (clamped to two lines until expanded), before the
  numbers. The first card carries a **Top Match for You** pill with a gradient
  border and a thicker gradient rail. The expanded detail separates the trip
  goal, the per-traveler fare, and the stay total into three labelled stat pills
  (gradient / blue / magenta) instead of a single block of figures.
- **Scout's system prompt** now asks for a candid, well-traveled voice and a
  fixed two-sentence pitch rhythm: sentence one for sensory atmosphere,
  authentic highlights, and vibe fit; sentence two for group ease, travel
  simplicity, or budget friendliness. Every previous hard constraint (integer
  whole-currency units, `City, Country`, duration overrides, valid JSON) is
  retained.

Acceptance criteria for this pass:

- [x] Every wizard question, option, help line, consent sentence, CTA, and
      loading message above renders in English and Spanish through `lib/i18n`.
- [x] Crew and timing answers are cards with an icon anchor and an
      `aria-pressed` selected state; no screen uses emoji.
- [x] Selecting a vibe, crew, or timing answer shows one Scout reaction line and
      clears it when the step changes.
- [x] The budget step offers one-tap presets in the traveler's currency.
- [x] The first result carries a gradient-bordered **Top Match for You** pill.
- [x] `scout_pitch` renders under the destination before any numeric figure.
- [x] Step transitions slide in the travel direction and respect
      `prefers-reduced-motion`.
- [x] `scoutBudgetPresets` is covered by unit tests for every supported
      currency plus an unsupported code.
- [x] Each vibe chip label is also the vibe string sent to Scout, and the
      deterministic fallback keeps mapping it to the matching pool (the beach
      matcher now accepts "water").

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

- A keyboard-accessible, responsive wizard with **five question screens** —
  vibe, crew size, savings pace, departure city, and timing. One question is
  visible at a time, with answer chips/free text, loading/error states, a
  manual-add fallback action, and consent before answers are sent to the AI
  provider.
- **Departure city** uses the existing Places autocomplete and is pre-filled
  from the most recent saved idea so the traveler rarely types it.
- **Use my current location** is a one-tap quick action on the departure screen.
  It asks the browser for a single coarse position, reverse-geocodes it through a
  server action, and fills the departure field with the resulting city label. It
  is optional, cancellable, and never blocks manual typing. Denied, unavailable,
  timed-out, and offline states each explain themselves and keep the field
  editable.
- A **five-segment progress rail** names every screen the wizard shows — vibe,
  crew, budget, departure, timing — so the counter and the rail always match the
  flow.
- **Timing** is one of *as soon as I've saved enough*, *a specific month*, or
  *whenever it's cheapest*. A pinned month defers the recommended departure to
  that month but never earlier than the savings goal.
- **Duration** is a preset (no preference / long weekend / about a week / two
  weeks or more) plus an optional **exact day count** (1–60). The exact count
  wins over the preset and constrains every suggestion.
- The timing screen also collects one optional free-text line for anything the
  plan must respect (dietary needs, mobility, school calendar).
- **Savings is optional.** Leaving the amount empty lets the traveler brainstorm
  without a pace: the savings timeline, ready date, and book-by date are hidden
  and replaced with "Add a savings pace to see when you could go", while the
  trip-goal and fare estimates still render. Scout ranks by lowest all-in cost
  when no pace is set.
- **Consent lives on the final screen, directly above "Find my trip ideas"** —
  the moment answers are actually sent — not on the budget screen.
- The wizard does **not** ask for pace/comfort, stay style, or a nonstop
  preference. Those are per-idea decisions the traveler makes later; the wizard
  uses `balanced`, `either`, and any-stops defaults so the estimates stay
  neutral.
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
- A calm header: a short dialog title (never the trigger sentence) plus one
  subtitle that names the current step ("Step 5 of 5 · Timing"). The
  five-segment rail is the only step indicator; past, current, and future
  segments use distinct fills.
- Optional timing extras (trip length, exact day count, free-text constraints)
  live in a closed-by-default **Trip details** `Collapsible` that summarizes what
  is set, so the final screen shows timing + consent only.
- Back / Next / **Find my trip ideas** render in a fixed dialog footer outside
  the scroll container, so the primary action is always reachable without
  scrolling.
- Compact, expandable result rows (horizontal snap-scroll on mobile), a single
  consolidated disclaimer, and a dashed "add more" card at the end of the list.
- An expanded detail surface that reads as a summary rather than a document:
  - a **highlight strip** with the trip goal, the per-traveler fare, and the
    ready-to-book date as three labelled stat tiles;
  - a **savings timeline** drawn from today → goal reached → book by, with a
    progress rail and the existing one-line savings summary;
  - a **segmented tab panel** (Budget · Savings · Flights · Stay) so only one
    detail block is open at a time instead of a long scroll, with the tab
    underline animating under the active label;
  - the two provider shortcuts (Flight details, Stay details) remain one tap
    away in the always-visible footer next to the primary save action.

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
  cannot invent a calendar. Nights are `max(1, durationDays - 1)`. With no
  savings pace (`savingsCapacityMinor === 0n`) the plan reports
  `savings.hasPace = false`, uses zero periods, and anchors the departure and
  booking dates to today so no invented far-future date is shown.
- **Flight timing:** The earliest feasible departure is the day the savings
  goal is reached (today when no pace is set). The recommended booking window is
  12 weeks for long-haul fares (per-traveler flight ≥ 700 whole units) and 8
  weeks otherwise, and the book-by date is never earlier than today.
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
- **Privacy/security:** Consent is collected on the final screen, immediately
  before generation, and discloses that only the user's vibe, crew size, any
  savings amount and cadence entered, and supported currency are sent to the
  configured AI provider. Do not send account identifiers or saved wishlist
  data. Authenticate and validate the Server Action input; never return or log
  the API key or sensitive answers. A zero savings amount is valid and is sent
  as `"0"`, never as a guess.
- **Device location:** The quick action is opt-in and only runs on an explicit
  tap. It requests one coarse position with a 10s timeout and no watch, and
  sends only `latitude`/`longitude` to the server action — never an account id.
  The action validates bounds, resolves the city label server-side (Google
  Geocoding when `GOOGLE_MAPS_API_KEY` is configured, the keyless BigDataCloud
  reverse-geocode endpoint otherwise), and returns a city label only. The
  precise coordinates are never stored, synced, logged, or sent to the AI
  provider; only the resulting city label becomes `originCity`. Geolocation is
  unavailable offline, on insecure origins, and when the browser denies
  permission — all three degrade to typing the city by hand.
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
- [x] The wizard never asks for a budget ceiling, age, or gender (steps are
      now a computed named list: 6 in idea mode, 5 in route mode).
- [x] A departure city is collected through Places autocomplete and pre-filled
      when a previous idea already has one.
- [x] A pinned travel month defers the recommended departure but never precedes
      the savings goal.
- [x] Trip length is a preset plus an optional exact day count (1–60); the exact
      count overrides the preset and rejects out-of-range values before calling
      the action.
- [x] Leaving the savings amount empty is allowed: the wizard still generates
      ideas, sends `"0"`, hides savings-derived dates, and explains how to add a
      pace.
- [x] Pace/comfort, stay style, and nonstop are no longer asked in the wizard;
      the action receives neutral defaults and the flight search defaults to any
      stops.
- [x] Consent appears only on the final screen, next to "Find my trip ideas",
      and generation is blocked until it is checked.
- [x] Every mandatory answer is labelled **Required** and every optional answer
      **Optional**. Advancing never relies on a disabled button: the owning step
      validates on press, shows a localized inline error, and focuses the first
      invalid control.
- [x] Choosing a specific month requires a month before generation.
- [x] Result rows collapse to destination, trip goal, one tag, and a chevron;
      only one row expands at a time, and only the first question types itself
      out.
- [x] Loading renders skeleton placeholders, and a short result set explains
      itself instead of silently showing fewer cards.
- [x] The departure screen offers **Use my current location**, fills the field
      with the reverse-geocoded city on success, and shows a localized,
      non-blocking explanation when the browser denies or cannot resolve it.
- [x] The progress rail and counter list every computed step and match the
      flow exactly (5 in route mode, 6 in idea mode).
- [x] The expanded idea detail shows the trip goal, the per-traveler fare, and the
      stay total as labelled stat pills, a today → book-by → goal-reached
      timeline, and Budget/Savings/Flights/Stay tabs where only one panel renders
      at a time.
- [x] The trigger ("Ask Scout for ideas") and the dialog title ("Let's find
      your kind of trip") are different strings in English and Spanish.
- [x] The dialog subtitle names the current step; the rail distinguishes past,
      current, and future segments.
- [x] Trip length, exact day count, and free-text constraints are collapsed
      behind **Trip details**, which summarizes the current values and reopens
      automatically when validation rejects the exact-day count.
- [x] The wizard's Back / Next / Find actions render in a fixed footer that
      stays visible at 430×900 without scrolling.

## Verification

Run the affected Vitest suites, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
Record actual results and known limitations in Completion Notes before release.

## Completion Notes

- **Verification results:** Full suite `pnpm test` — 218 files / 1,418 tests
  passed. `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check`
  passed. Provider links were also exercised against the live sites: Google
  Flights populated origin, destination, both dates, passenger count, and the
  Nonstop filter in both `hl=en` and `hl=es`; Airbnb resolved the slug to
  "Homes in Kyoto" with the correct dates and guest count. Focused coverage includes `scout-idea-plan.test.ts` (budget math,
  savings timeline, booking window, pinned month, stay check-in/check-out,
  return date, zero-decimal currency, unset savings pace), `google-travel-links.test.ts` and
  `stay-links.test.ts` (pre-filtered provider URLs and input bounds),
  `scout-idea-wizard.test.tsx` (five-screen flow, origin, pinned month, exact
  day count and its bounds, optional savings, consent gating, skeletons,
  expand/collapse, add-two-more, exhaustion, pre-filtered flight/stay submodals
  with the reason for the pick, save handoff, offline gating, five-segment
  progress rail, current-location success and denial, and
  one-detail-panel-at-a-time tabs), `places.test.ts` (reverse-geocode bounds,
  Google primary path, keyless fallback, label dedupe, and failure handling),
  `scout-trip-ideas.test.ts` (ranked ideas array, provider schemas,
  prompt payload, no-pace prompt, exact-day override, trip-length and comfort
  effects, rental goal, duplicate filtering, Spanish fallback, malformed
  responses), `scout-trip-ideas-schema.test.ts` (input defaults, duration bounds,
  and payload bounds), `destination-field.test.tsx` (offline autocomplete and
  `autoSearch={false}`), and `i18n-provider.test.tsx` (English/Spanish Scout copy
  and placeholders). The 2026-10-23 pass additionally verified the departure
  quick action against the live reverse-geocode endpoint and reviewed the
  redesigned detail surface and the new timing screen in a real browser at
  430px and 900px in light and dark themes. The 2026-10-25 validation pass added
  per-step inline errors, required/optional labels, and the mandatory pinned
  month; the suite then reported 218 files / 1,422 tests passing, and all five
  screens plus the inline vibe, crew, month, and consent errors were reviewed in
  a real browser through the `/e2e` harness. See
  [bug-scout-wizard-validation.md](./bug-scout-wizard-validation.md).
- **2026-10-25 clarity pass:** the final screen was rebuilt around a
  `Collapsible` "Trip details" section and a fixed dialog footer; the dialog was
  retitled and the progress rail simplified. `pnpm lint` ✅ · `pnpm typecheck` ✅ ·
  `pnpm test` ✅ 219 files / 1,427 tests · `pnpm build` ✅ (21 routes). The Timing
  screen was reviewed in the `/e2e` harness at 430×900 and 1000×900, light and
  dark, in English and Spanish, collapsed and expanded. See
  [bug-scout-wizard-last-step.md](./bug-scout-wizard-last-step.md).
- **2026-10-25 conversational pass:** the wizard copy, crew/timing cards,
  Scout reaction lines, budget quick pills, result presentation (Top Match pill,
  pitch under the destination, three stat pills), and the system prompt were
  reworked. `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ 220 files /
  1,438 tests · `pnpm build` ✅ (21 routes). All screens plus the results
  surface (stubbed locally, because the `/e2e` harness has no signed-in session)
  were reviewed in a real browser at 1000×900 and 430×900, in English and
  Spanish.
- **Security review:** Server Action authentication, input/output validation,
  consent, server-only key handling (`GEMINI_API_KEY` primary, `OPENAI_API_KEY`
  fallback), and data minimization reviewed during implementation. The exclusion
  list only ever carries destination names the user already saw. Outbound
  searches send only the destination and locally computed dates, and the UI
  discloses that before navigation. The location action validates coordinate
  bounds, resolves the label server-side, and never persists, logs, or forwards
  the coordinates. Independent Security Agent review remains pending.
  Residual risk: like the existing places autocomplete, the reverse-geocode
  action has no per-user rate limit; add one before public launch.
- **Known limitations:** Stay costs, flight windows, and savings timelines are
  deterministic estimates, not live availability or fares. Airbnb and hotel
  rates come from Scout's own figures plus outbound search links; no pricing
  API is called. The booking window is a planning heuristic (12 weeks for
  long-haul fares, 8 weeks otherwise). Live-provider prose follows the requested
  language through the prompt but is not schema-enforced; the deterministic
  fallback is fully localized. Device location needs a secure origin and a
  connection, and the keyless reverse-geocode provider can return a city-level
  label without the airport name; the traveler can still edit or replace it.
- **Follow-up work:** Configure `GEMINI_API_KEY` (and optional `OPENAI_API_KEY`
  fallback) in deployment and manually QA the animated wizard, the Spanish
  copy, and the Google/Airbnb links with a configured provider.
