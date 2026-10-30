# Feature Specification: Scout Nearby Destinations & Idea Card Redesign

**Project:** Viatik
**Owner:** Abimael Garcia
**Status:** In Progress
**Created:** 2026-10-29
**Updated:** 2026-10-29
**Related work:** [Scout's Trip Idea Wizard](./scout-idea-wizard.md), [Scout — Exact Destination, Routes](./scout-exact-destination-routes.md), [Design System](./design-system.md)

## What & Why

### What

Two connected changes to Scout and the Wish List:

1. **Scout's ranking brain.** The system prompt stops treating "one continent" as a
   hard rule and starts doing an explicit, per-candidate analysis anchored on the
   departure city: how close the destination is, how cheap it is to reach, whether
   it is a recognized place a traveler would actually want, and how well it matches
   the requested vibe. Nearby underrated options are explicitly welcome next to
   famous ones. No destination is hardcoded.
2. **Idea card.** The saved-idea card (and the matching Scout result card) is
   rebuilt: destination as the headline, fact tiles instead of an inline `<dl>`,
   a proportional budget bar instead of loose chips, a real map pin, and actions
   that read as actions. The wizard result card adopts the same visual language.

### Why

The current prompt ranks with a rigid "keep every idea on a single continent" rule
and never reasons about *proximity to the traveler*. A traveler leaving Chihuahua
for a beach trip gets Cancún (a cross-country flight) while Mazatlán, San Carlos,
Puerto Escondido, or Tecolutla — closer, cheaper, and equally "playa" — never
surface. Asking Gemini the same question in the browser returns exactly those
nearby options, so the gap is the prompt, not the model.

Separately, the saved idea card packs the title, a duplicated destination line, a
two-column inline definition list, currency-duplicated totals, and six chips into
one dense block. It reads as a debug dump rather than a plan.

### Users and scenarios

- **Primary user:** a signed-in traveler using the Wish List planner offline-first.
- **Scenario 1:** Given a departure city in northern Mexico and the beach vibe,
  when Scout runs, then the ideas lead with nearby Pacific/Gulf beaches and only
  reach farther destinations when they are clearly better value.
- **Scenario 2:** Given a saved idea with coordinates, when the card renders online,
  then a small OpenStreetMap panel shows a pin for the destination; offline it
  degrades to a static location tile with an external maps link.
- **Scenario 3:** Given a legacy saved idea without coordinates, when the traveler
  taps **Locate**, then Viatik geocodes the destination and persists the
  coordinates locally so the pin survives a reload.
- **Offline or degraded-network behavior:** the card renders fully offline. The
  map is the only network-dependent element and always has a static fallback. The
  idea save never blocks on geocoding.

## In Scope

- `SYSTEM_PROMPT` and `buildUserPromptPayload` in `app/actions/scout-trip-ideas.ts`.
- A `resolveDestinationCoordinates` server action in `app/actions/places.ts`
  (keyless Open-Meteo path already exists).
- Coordinate hydration for Scout-saved ideas (non-blocking, after the local write).
- New `IdeaMapCard` component (OSM embed + offline/unknown fallbacks).
- Redesign of `features/trip-planner/components/trip-idea-card.tsx`.
- Visual alignment of the Scout result card in `scout-idea-wizard.tsx`.
- EN/ES copy in `lib/i18n/frontend-copy.ts`.
- Unit tests for the prompt payload, coordinate resolution, and map card states.

## Out of Scope

- Any new map dependency (MapLibre, Leaflet, Mapbox, Google Maps JS).
- Changing the deterministic fallback pools (`FALLBACK_POOLS`). They remain the
  last-resort path when no provider key is configured and are explicitly **not**
  the ranking mechanism.
- Dexie schema changes, Supabase migrations, outbox changes. `tripIdeas` is local
  only and already carries `latitude`/`longitude`/`timeZone`.
- Server-side geocoding of every stored idea, or any background sync of coordinates.

## Constraints and Design

- **Architecture boundaries:** the ranking lives in the server action; the map is
  a presentation component in `features/trip-planner/components/`; geocoding is an
  infrastructure call through `app/actions/places.ts`, never a Supabase domain query.
- **Data ownership:** `tripIdeas` stays Dexie-owned. Coordinates are written through
  `tripIdeaRepository.updateIdea` inside its existing `TransactionContext`; no outbox
  entry because the table is local-only.
- **Security requirements:** the destination string is already length-bounded by the
  Scout schema; the geocode action re-validates length and never logs coordinates or
  API keys. The OSM iframe uses `loading="lazy"`, `referrerPolicy="no-referrer"`, a
  descriptive `title`, and is only mounted when the browser reports online.
- **Privacy:** the OSM embed is a third-party request; it is the only one, it is
  user-visible, and it is skipped entirely when offline.
- **Compatibility:** no new dependencies; works in the Capacitor shells.
- **SOLID/design decisions:** `IdeaMapCard` owns one responsibility (showing where a
  destination is) and receives coordinates + an optional resolver. Prompt assembly
  stays a pure function so it is unit-testable without a network call.
- **Migration/rollback plan:** none. Reverting the prompt and the components is safe;
  stored coordinates are additive and ignored by older code paths.

## Acceptance Criteria

### Functional

- [ ] The prompt no longer contains the "keep every idea on a single continent" rule.
- [ ] The prompt asks for proximity/cost/vibe analysis anchored on the departure city
      and explicitly welcomes nearby underrated destinations next to famous ones.
- [ ] The prompt keeps every existing hard constraint (integer whole-currency units,
      `City, Country`, duration overrides, valid JSON, route chaining).
- [ ] `buildUserPromptPayload` includes an `anchor` block when an origin city is set.
- [ ] A Scout-saved idea gets coordinates when geocoding succeeds and is still saved
      when it fails or the device is offline.
- [ ] The saved card shows the map pin when coordinates exist and a static location
      tile otherwise.
- [ ] The Locate action persists coordinates and the pin survives a reload.
- [ ] The card never prints the currency code twice in the budget total.

### Accessibility and UX

- [ ] Fact tiles are `dl`/`dt`/`dd` semantically or carry equivalent labels.
- [ ] The map iframe has a `title`; the fallback exposes the coordinates as text.
- [ ] The budget bar is decorative (`aria-hidden`) with the numbers available as text.
- [ ] All interactive targets are ≥44px and keep focus rings.
- [ ] Copy renders in EN and ES through `lib/i18n`.

### Reliability and offline behavior

- [ ] Rendering the card requires no network round-trip.
- [ ] The map falls back to a static tile offline and on iframe failure.
- [ ] Geocoding failures are silent (no error toast) and never block a save.

### Verification

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.

## Implementation Plan

1. Prompt payload + system prompt tests (red).
2. `resolveDestinationCoordinates` + tests.
3. `IdeaMapCard` + state tests.
4. Card redesigns (saved idea, Scout result).
5. i18n copy EN/ES.
6. Verification + memory update.

## Risks and Open Questions

- **Risk:** the OSM embed is a third-party request in an offline-first app. Mitigated
  by mounting it only when online and always providing a static fallback.
- **Risk:** a looser prompt could drift back to long-haul picks. Mitigated by making
  proximity an explicit, first-class ranking input rather than a continent rule.
- **Question:** should coordinates also hydrate when an idea is edited? Deferred —
  the Locate action covers the manual path.

## Completion Notes

- **Verification commands:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- **Verification results:** lint ✅ (no warnings) · typecheck ✅ · build ✅ (21
  routes) · test ✅ 226 files / 1,528 passed. The 3 failures in
  `scout-idea-wizard.test.tsx` ("drops a stale second wave after Try again",
  "excludes first-wave routings in route mode", "rotates through stage messages
  while Scout searches") are pre-existing: they fail identically on `HEAD` with
  the working tree stashed, so this change neither caused nor fixed them.
- **New tests:** `app/actions/places.test.ts` (`resolveDestinationCoordinates`),
  `app/actions/scout-trip-ideas.test.ts` (anchor payload + no continent rule),
  `features/trip-planner/components/__tests__/idea-map-card.test.tsx`,
  `features/trip-planner/components/__tests__/trip-idea-card.test.tsx`.
- **Bug-ledger updates:** not applicable.
- **Follow-up work:** the 3 pre-existing wizard test failures should be triaged
  separately; they are timing-related (fake timers + async second wave).
