# Feature Specification: Pre-Trip Home Content and Command Palette Data Search

**Project:** Viatik
**Owner:** Main agent
**Status:** In Progress
**Created:** 2026-10-30
**Updated:** 2026-10-30
**Related work:** Quick-wins review (Home empty before trip start; palette has 7 static commands)

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md). No Dexie schema, Supabase migration, RLS, mapper, or outbox change is part of this work. Everything below is read-only over existing Dexie repositories.

## What & Why

### What

1. **Pre-trip Home.** While the featured trip is `planned` (not `active`), Home shows planning content instead of only the hero and quick actions: the readiness card, a passport/visa risk banner (when departure is within 90 days), the open-tasks widget, and a preview of the first three Day 1 itinerary activities.
2. **Home hygiene.** The inline "check-in / pack" 24-hour banner becomes a reusable component, and the hard-coded English strings in `home-page.tsx` move to `t()` (EN + ES).
3. **Command palette v2.** The palette searches real local data (trips, activities, contacts), groups results under category headers, offers contextual trip actions that deep-link into the featured trip, adds "Go to Home", and is discoverable through a visible shortcut pill in the sidebar and mobile header.
4. **Test hygiene.** Re-enable `home-trips-temporal.test.ts` and `home-page.test.tsx` in Vitest.

### Why

Most of a trip's life is spent in the `planned` state, but Home gates nearly all useful widgets behind `isActive`. The palette already exists but only navigates between four pages and has no visible entry point. Both changes reuse existing components and repositories, so value is high and risk is low.

### Users and scenarios

- **Primary user:** a traveler preparing a trip (planned, 0 to 90+ days out).
- **Scenario 1:** Given a planned trip departing in 20 days with an expiring passport, when the user opens Home, then the hero + readiness card, a document-risk banner, open tasks, and a Day 1 preview are visible.
- **Scenario 2:** Given the user presses Cmd/Ctrl+K and types "lis", then trips, activities, and contacts whose text matches (case- and accent-insensitive) appear under separate headers, and Enter opens the selected one.
- **Scenario 3:** Given a featured trip, when the user opens the palette with an empty query, then contextual actions ("Add expense", "Add activity", "Open vault", "Convert currency") deep-link to that trip.
- **Offline behavior:** unchanged and required. Every read is a Dexie `liveQuery`; no network is needed to render or search.

## In Scope

- `PreTripSection` on Home for a non-active featured trip.
- `WithinNext24HoursBanner` extracted from `home-page.tsx`.
- i18n for the three hard-coded strings plus all new strings (EN + ES).
- Palette: data search, grouped results, contextual actions, `Go to Home`, global shortcuts, discovery pill.
- Un-excluding the two Home test files and fixing them.

## Out of Scope

- Vault entry search. See "Vault decision" below.
- Search by travel documents (health), notes, expenses, media. Documented follow-up.
- Service worker / PWA install work.
- Localizing the English strings still inside `features/trips/lib/home-trips.ts` (`formatCountdown`). **Done 2026-10-31** — see `navigation-account-menu-and-countdowns.md`.
- Schema, sync, RLS, mapper, outbox changes: none.

## Constraints and Design

### Pre-trip Home architecture

- **Gate:** `primaryTrip !== null && !isActive`, where `isActive = primaryTrip.status === "active"` (existing). `useHomeData` already returns `primaryTrip`, `readiness`, and `timeline` (scope `"upcoming"` when no active trip), so no new subscription is needed for the readiness card or the preview.
- **Readiness card:** already rendered inside `TripCountdownHero` via `TripReadinessSection` when `readiness` is non-null, including for planned trips. Do not render a second copy. Add a test that proves it renders for a planned trip.
- **`DocumentRiskBanner`:** render only when `primaryTrip.startDate` is set and `0 <= daysUntil(startDate) <= 90` (`daysUntil` from `features/trips/lib/home-trips`). Props: `userId`, `destination`, `travelDate = startDate`. The 90-day gate lives in a small exported pure helper `isWithinDocumentWindow(startDate, today, days = 90)` in `features/trips/lib/home-trips.ts` (unit tested). The active-trip branch keeps its current unconditional banner.
- **`OpenTasksWidget`:** `tripId = primaryTrip.id`, `userId`. It already returns `null` when there are no open tasks.
- **Day 1 preview** (new `features/trips/components/home/day-one-preview.tsx`):
  - Input: `trip: Trip`, `items: TimelineItem[]`.
  - Selects items where `item.dayDate === trip.startDate`, keeps the order `buildTimeline` returns, takes the first 3.
  - Renders heading, up to 3 rows (time label or "All day" style fallback from existing copy, title, location), and a link "View full itinerary" to `tripTabPath(trip.id, "itinerary")`.
  - Empty state (trip has a start date but no Day 1 items): short message plus a link to `${tripTabPath(trip.id, "itinerary")}&action=add-activity`. The trip page already supports `action=add-activity`.
  - If `trip.startDate` is null: render nothing.
  - Section uses `aria-labelledby`; rows are a semantic `<ul>`.
- **`PreTripSection`** (new `pre-trip-section.tsx`) composes the four pieces in this order: document banner, open tasks, Day 1 preview. (Readiness is in the hero.) `home-page.tsx` renders it under `OngoingTripsQuickView` when `!isActive`.
- **`WithinNext24HoursBanner`** (new `within-24-hours-banner.tsx`): pure presentational component that takes the trip's `startDate` and returns the existing markup (or `null`). It owns the `isWithinNext24Hours` helper (moved, exported, unit tested). Behavior and visuals are unchanged.

### i18n

Add to `lib/i18n/frontend-copy.ts` under the existing `copy` namespace in both `en` and `es`. Before adding any key, grep for an existing equivalent and reuse it.

| Key | EN | Replaces |
|---|---|---|
| `copy.recentActivity` | Recent activity | `heading="Recent activity"` in `home-page.tsx` |
| `copy.recentActivityEmpty` | No activity yet. Changes you make on this trip appear here. | `emptyMessage` in `home-page.tsx` |
| `copy.pleaseTryAgain` | Please try again. | fallback in `localizeThrownError(cause, t, "Please try again.")` |
| `copy.dayOnePreviewTitle` | Day 1 preview | new |
| `copy.dayOnePreviewEmpty` | Nothing planned for day 1 yet. | new |
| `copy.dayOnePreviewAddActivity` | Plan your first day | new |
| `copy.viewFullItinerary` | View full itinerary | new |
| `copy.paletteGroupActions` / `paletteGroupNavigation` / `paletteGroupTrips` / `paletteGroupActivities` / `paletteGroupContacts` | Trip actions / Navigation / Trips / Activities / Contacts | new |
| `copy.paletteGoToHome` | Go to Home | new |
| `copy.paletteAddExpense` / `paletteAddActivity` / `paletteOpenVault` / `paletteConvertCurrency` | Add expense / Add activity / Open vault / Convert currency | new |
| `copy.paletteSearchPlaceholder` | Search trips, activities, contacts, or run a command | new (replaces `common.searchCommands` placeholder only) |
| `copy.paletteShortcutPill` | Search | new (aria-label / visible text of the sidebar pill) |

`lib/i18n/i18n-coverage.test.ts` must keep passing (EN/ES key parity). No hard-coded user-visible English in any new or touched component.

### Command palette architecture

Actual file is `components/pro/command-palette.tsx` (not `components/navigation/`). Keep it there. Split for single responsibility:

- `components/pro/command-search.ts` (pure, no React, unit tested): normalization (`NFD`, strip combining marks, lowercase, trim), matcher, grouping, per-group cap (5), flat ordering used for keyboard navigation.
- `components/pro/use-palette-data.ts` (hook): live data, active only while the palette is open (see below).
- `components/pro/command-palette.tsx`: UI, keyboard handling, rendering. It gains a `userId: string` prop; `app/(app)/layout.tsx` passes `data.user.id` (already available server-side).

**Data sources (all existing repositories, all `liveQuery`-backed, all unsubscribed on close):**

| Entity | Repository call | Searched fields | Navigates to |
|---|---|---|---|
| Trips | `tripRepository.watchAll` (skip `deletedAt`) | `name`, `destination`, `status` | `/trips/${id}` |
| Activities | `activityRepository.watchByTrip(tripId, ...)` per trip, capped to the 20 most recent trips by `startDate` desc; skip `deletedAt` | `title`, `placeName`, `dayDate`, and the parent trip `name` (shown as subtitle) | `tripActivityEditPath(tripId, activityId)` |
| Contacts | `contactRepository.watch(userId, ...)` (skip `deletedAt`) | `fullName`, `email`, `relationship` | `/contacts` |

There is no `watchAll` for activities, so the per-trip fan-out is the only no-schema option; the cap bounds it. Subscriptions are created only when the palette view is `"palette"` and are disposed in the effect cleanup. The empty query shows commands only (no data groups). Data groups appear when the query has at least 1 character; activities require at least 2 characters.

**Vault decision (deviation from the request):** `VaultEntry` rows persist only `ciphertext`/IV. Title and category exist only after the user unlocks the vault with their passphrase and are deliberately never stored in plaintext. A global palette must not decrypt or index them. The palette therefore exposes only an **"Open vault"** action for the featured trip and never lists vault entries. This preserves the vault's security model.

**Contextual actions** (shown when a featured trip exists; featured trip = `pickPrimaryTrips(trips).primaryTrip`; subtitle shows its name):

| Action | Destination |
|---|---|
| Add expense | `${tripTabPath(id, "money")}&action=add-expense` |
| Add activity | `${tripTabPath(id, "itinerary")}&action=add-activity` |
| Open vault | `tripTabPath(id, "vault")` |
| Convert currency | `${tripTabPath(id, "money")}&action=money-tools` |

If there is no featured trip these four are omitted. The trips list is already subscribed while open, so no extra query is needed.

**Navigation commands:** Go to Home (`/home`, chord `G H`), Trips, Contacts, Settings, Create new trip, Sync now, Toggle theme, Keyboard shortcuts (existing, keep behavior). Navigation commands appear under "Navigation"; contextual under "Trip actions".

**Results rendering and a11y:** one `role="listbox"`; each group is `role="group"` with `aria-labelledby` pointing at a visible category header; options keep `role="option"`, `aria-selected`, and `aria-activedescendant` on the combobox input. Arrow keys traverse the flat list across groups. Enter runs the active item and closes. Empty state reuses `common.noMatchingCommands`. Touch targets stay at least 44px tall for rows.

**Global shortcuts (listeners live in the always-mounted component, so they work while closed):**

- `Cmd/Ctrl+K` toggles the palette (works from anywhere, including inputs; unchanged).
- `?` opens the cheatsheet outside typing targets (unchanged).
- Two-key chords `G` then `H/T/C/S` (800 ms window) now work **with the palette closed**. Guards: ignore when a modifier is held, when the target is a typing target, or when another `[role="dialog"][aria-modal="true"]` that is not the palette is open.
- The single-key `C` ("create trip") stays **palette-open only**. A prior bug (stray keypress hijacking navigation to `/trips`) is documented in the existing code comment; the single-key form is the risky one, a deliberate two-key chord is not. The cheatsheet labels `C` accordingly.
- An `open-command-palette` request is exposed as an exported `openCommandPalette()` helper that dispatches a `viatik:open-command-palette` `CustomEvent` on `window`; the component listens and sets the view to `"palette"`. The sidebar pill calls it.

**Discovery pill:** a `CommandPaletteHint` button in `app-shell.tsx`: desktop sidebar (under the brand row / above the user card) and mobile header (icon-only `Search` button with `aria-label`). Visible text: the `copy.paletteShortcutPill` label plus a `kbd` showing the shortcut. Platform symbol (Cmd vs Ctrl) is resolved in a `useEffect` after mount to avoid hydration mismatch (default to `Ctrl`). Min height 44px on touch, `lg` desktop may be `h-9`-free; use 44px.

### Other constraints

- **Architecture boundaries:** components import repositories only inside client components/hooks; server `layout.tsx` only passes `userId`.
- **Data ownership:** Dexie remains source of truth. No writes occur in this feature.
- **Security:** no secrets or ciphertext are read. Contact email is matched locally and only displayed in the palette on the user's own device. No new network calls.
- **Money:** not touched.
- **Compatibility:** React 19, Next 16 client components; Tailwind v4 tokens; reuse `components/ui/*`.
- **Migration/rollback:** none; revert the commit.

## Acceptance Criteria

### Functional

- [ ] Planned featured trip: Home renders hero + readiness card (once), document banner only when departure is within 0..90 days, open tasks when any, and a Day 1 preview with at most 3 items.
- [ ] Day 1 preview empty state shows a link to add an activity; null `startDate` renders nothing.
- [ ] Active trip Home is unchanged (no `PreTripSection`).
- [ ] The 24h banner renders exactly as before, via the extracted component.
- [ ] No hard-coded English remains in `home-page.tsx`; ES locale renders Spanish for the three replaced strings.
- [ ] Palette finds trips, activities (with parent trip subtitle), and contacts accent- and case-insensitively; deleted rows never appear; groups have headers; results capped at 5 per group.
- [ ] Empty query shows navigation + contextual action groups only; contextual actions are hidden when there is no featured trip.
- [ ] Each contextual action navigates to the exact path in the table above.
- [ ] "Go to Home" navigates to `/home`; `G H/T/C/S` works with the palette closed and does nothing inside inputs, with modifiers, or while another modal dialog is open.
- [ ] Sidebar/mobile pill opens the palette; Cmd/Ctrl+K still toggles it.
- [ ] Palette subscriptions are disposed when closed and on unmount.

### Authorization and security

- [ ] No vault entry title/category/ciphertext is read, displayed, or indexed.
- [ ] Only the signed-in user's contacts (via `userId`) are searched.
- [ ] No new Supabase or fetch call is introduced.

### Reliability and offline behavior

- [ ] Everything renders and searches offline.
- [ ] Live updates: adding/renaming a trip while the palette is open updates results.

### Accessibility and UX

- [ ] Combobox/listbox/group semantics as specified; headers visible; keyboard traversal crosses groups.
- [ ] Pill has an accessible name; touch target at least 44px; focus ring visible.
- [ ] Motion (if any) respects `useReducedMotion`; no emoji; dark and light themes use tokens only.

### Verification

- [ ] Unit tests: `command-search.test.ts`, `isWithinDocumentWindow`, `isWithinNext24Hours` / banner, `DayOnePreview`, `PreTripSection`, palette component (data groups, contextual actions, chords, pill event).
- [ ] `home-trips-temporal.test.ts` and `home-page.test.tsx` removed from the Vitest `exclude` list and passing; home-page tests fixed (they currently fail 3 of 18 because of stale expectations, not because of this feature).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass; `pnpm build` passes because `layout.tsx` and the shell changed.

## Test hygiene plan (pre-flight)

Baseline measured 2026-10-30 with the two files temporarily un-excluded: `home-trips-temporal.test.ts` passes (all tests); `home-page.test.tsx` has 3 failing of 21 combined. Strategy: remove both entries from `vitest.config.mjs` `exclude`; fix stale mocks/expectations in the test (query labels, collapsed checklist button name, copy changes); change production code only if a failure proves a real bug, and then record it in `bug-ledger.md`. Do not weaken or delete assertions. If any temporal assertion depends on the machine timezone or current date, pin it with `vi.useFakeTimers()` / `vi.setSystemTime` and an explicit `TZ`-independent date.

## Implementation Plan

1. Pre-flight: un-exclude the two test files, fix to green.
2. Red tests for pure helpers (`isWithinDocumentWindow`, `isWithinNext24Hours`, `command-search`).
3. Extract `WithinNext24HoursBanner`; add `DayOnePreview`, `PreTripSection`; wire into `home-page.tsx`; i18n.
4. Palette split (`command-search.ts`, `use-palette-data.ts`, component), `userId` prop, shortcuts, `openCommandPalette()`, pill in the shell, i18n.
5. Verify, update memory, commit.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Vitest files excluded for Home | 2 | 0 | `vitest.config.mjs` | QA |
| Home widgets visible on a planned trip | 2 | 5 | component test | QA |
| Palette command + data sources | 7 commands, 0 data | 11+ commands, 3 data sources | palette test | QA |

## Risks and Open Questions

- **Risk:** per-trip activity subscriptions on large accounts. Mitigation: only while open, capped at 20 trips.
- **Risk:** the `G` chord could surprise users while a non-modal widget has focus. Mitigation: guards above; `C` stays gated.
- **Follow-up:** search travel documents (plaintext in `travelDocuments`), expenses, notes. (`formatCountdown` localization shipped 2026-10-31.)

## Completion Notes

- **Verification commands:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- **Verification results:** to be filled in by QA after implementation
- **Bug-ledger updates:** only if a production bug is found while fixing the Home tests
- **Follow-up work:** vault/document search (needs an unlock-aware design). `formatCountdown` i18n shipped 2026-10-31.
