# Feature Specification: Trip Lifecycle

**Project:** Viatik
**Owner:** Abimael Garcia
**Status:** In Progress
**Created:** 2026-09-09
**Updated:** 2026-09-09
**Related work:** Home cockpit + Trips dashboard status separation

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md) before implementing. Framework entry point: [`../llms.txt`](../llms.txt). Record resulting bug invariants in [`../specs/bug-ledger.md`](../specs/bug-ledger.md).

## What & Why

### What

Introduce an explicit trip lifecycle state (`planned | active | completed | cancelled`) with optional `startedAt` / `completedAt` timestamps, and reshape the Home cockpit and Trips dashboard around it:

- Home surfaces a **single** operational hero card for the active or soon-to-start trip, with a compact **"Up Next" rail only when the hero is planned**.
- The Trips dashboard uses a **segmented tab bar**: `Upcoming & Active` vs `Past Trips`.
- Users **start / end / cancel** trips manually via one-click confirmations; the app may **nudge** when today crosses a trip's boundary dates but never flips state silently.

### Why

Today "active" is derived purely from dates, ended trips are buried in a "recent" list, and Home shows only the nearest trip with no notion of a trip being underway or finished. Users need clear operational context: what is happening now, what is next, and where past trips live — so the app acts as a launchpad while traveling, not a chronological dump.

### Users and scenarios

- **Primary user:** Trip owner / organizer.
- **Scenario 1 (active):** Today is within a trip's dates and the trip is `active`. Home shows a Live hero ("Day X of Y") with an **End trip** action; no "Up Next" rail appears. Ended trips are absent from Home.
- **Scenario 2 (planned/starting soon):** A trip is `planned` and starts within ~7 days. Home shows a countdown hero with a **Start trip** action, plus a compact **Up Next** rail of other planned trips.
- **Scenario 3 (ended/cancelled):** A trip is `completed` or `cancelled`. It drops from Home immediately and appears only under **Past Trips**, muted and non-actionable.
- **Offline or degraded-network behavior:** Status changes are local-first and queued via the existing outbox sync; they are durable on refresh and reconcile with Supabase when online.

## In Scope

- `TripStatus` enum and `status` / `startedAt` / `completedAt` fields on the domain `Trip`.
- Date-derived fallback helper (`resolveTripStatus`) so existing unset records keep working.
- Dexie schema **v32** backfill and Supabase migration **#35** with a check constraint.
- `startTrip` / `endTrip` / `cancelTrip` repository methods through the transactional outbox.
- Home hero states (planned/active), "Up Next" rail (planned-only), exclusion of ended trips.
- Trips dashboard segmented tab bar (`Upcoming & Active` | `Past Trips`).
- One-click lifecycle nudge when boundary dates roll over (never silent).

## Out of Scope

- Recurring trips, cloning lifecycle state, or bulk operations on many trips at once.
- Per-member role-based start/end permissions beyond the existing owner/editor RLS (single-writer start/end on the owner/editor row predicate).
- Timeline/history audit of status transitions (only latest state + timestamps are stored).
- Public/community template status (community `isPublic` templates are unaffected).

## Constraints and Design

- **Architecture boundaries:** `features/domain/entities.ts` (types), `features/domain/repositories/trip-repository.ts` (interface), `features/trips/data/dexie-trip-repository.ts` (Dexie impl), `lib/db/dexie.ts` (schema), `lib/supabase/mappers.ts` (remote mapping), `supabase/migrations/` (schema), `features/trips/components/home/*` and `features/trips/components/trip-dashboard.tsx` (UI). UI depends only on the repository interface, never on Dexie/Supabase directly.
- **Data ownership:** Dexie (IndexedDB) is the local source of truth; Supabase is the sync/authorization target. Status changes are optimistic local writes appended to the outbox, drained by the sync engine. `tripToRow`/`rowToTrip` are the single mapping layer.
- **Security requirements:** Start/end/cancel respect existing trip RLS (owner/editor); values validated to the enum; no secrets exposed.
- **Compatibility:** Next.js 16 (proxy), Dexie v4, TypeScript; browser/local-first.
- **SOLID/design decisions:** New pure `resolveTripStatus` helper owns date-derived fallback; repository exposes explicit lifecycle verbs instead of leaking status fields; UI consumes the enum only.
- **Migration/rollback plan:** `version(32)` backfills unset rows (`completed` if `end_date < today`, else `planned`); migration #35 adds columns with `default 'planned'` and a check constraint. Rollback = revert migration/bump (existing rows are non-destructive).
- **Observability:** Debug-log lifecycle transitions (trip id, from → to) without personal data.

## Acceptance Criteria

All criteria must be objectively testable.

### Functional

- [ ] A trip created with no explicit status is `planned` (or date-derived when inside its dates).
- [ ] `startTrip` sets `status=active` and stamps `startedAt`; `endTrip` sets `status=completed` and stamps `completedAt`; `cancelTrip` sets `status=cancelled`.
- [ ] `resolveTripStatus` returns the stored status for `active`/`completed`/`cancelled`, and date-derives `planned`→`active` when today is within the trip's dates.
- [ ] Home shows a Live hero when a trip is active, with no "Up Next" rail.
- [ ] Home shows a countdown hero + "Up Next" rail when the hero trip is planned and other planned trips exist.
- [ ] `completed` and `cancelled` trips never appear on Home.
- [ ] Trips dashboard tab bar separates `Upcoming & Active` from `Past Trips`; `completed`/`cancelled` appear only in Past Trips.
- [ ] Lifecycle nudge offers a one-click confirm; state never flips without user action.
- [ ] Loading, empty, offline, and "only ended trips" states are handled.

### Authorization and security

- [ ] Start/end/cancel are enforced by existing trip RLS (owner/editor).
- [ ] Unauthorized roles and crafted requests are rejected server-side.
- [ ] Enum values are validated on write; no unexpected values persist.
- [ ] No secrets or sensitive data exposed in code, logs, or responses.

### Reliability and offline behavior

- [ ] Status changes are local-first and appended to the outbox; durable across refresh.
- [ ] CAS/outbox reconciliation maps status fields via `tripToRow`/`rowToTrip`.
- [ ] Migration backfills existing Dexie and Supabase rows without data loss.

### Accessibility and UX

- [ ] Segmented tab control is keyboard and touch accessible with visible focus.
- [ ] Status badges announce their meaning to screen readers (not color alone).
- [ ] Contrast, focus, and reduced-motion requirements are met.
- [ ] Responsive behavior verified on supported viewports.

### Verification

- [ ] Unit tests for `resolveTripStatus`, `pickPrimaryTrips`, repository lifecycle verbs, and mapper round-trip.
- [ ] Component tests for hero states, "Up Next" rail, and the segmented tab bar.
- [ ] Typecheck, lint, and production build pass.
- [ ] QA Agent report attached (as applicable).

## Implementation Plan

1. Domain types + `resolveTripStatus` + tests.
2. Dexie v32 upgrade and Supabase migration #35.
3. Mappers (`tripToRow` / `rowToTrip`).
4. Repository lifecycle verbs + tests.
5. `home-trips` / `use-home-data` selection logic + tests.
6. Home hero states and "Up Next" rail.
7. Trips dashboard segmented tabs.
8. Lifecycle nudge + workspace control.
9. Full verification (tests, lint, typecheck, build).

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Home shows actionable active/planned trip | Single nearest trip | Always actionable (Live or countdown) | Manual / e2e | Abimael Garcia |
| Ended trips reachable | Mixed in "recent" | Behind "Past Trips" tab | Manual / e2e | Abimael Garcia |
| Lifecycle changes durable offline | n/a | No loss on refresh | Repository tests | Abimael Garcia |

## Risks and Open Questions

- **Risk:** Sync conflict when two editors change status concurrently — mitigated by existing CAS on `updated_at`; last-write-wins per the current sync design.
- **Question:** Should starting a trip also implicitly "fill" dates when absent? Deferred — out of scope; dates remain optional.
