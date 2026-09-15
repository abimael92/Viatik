# Feature Specification: Weather-Triggered Itinerary Rescheduler

**Project:** Viatik
**Status:** In Progress
**Created:** 2026-09-06
**Related work:** None

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md) before completing this template.

## What & Why

### What

A weather-aware itinerary layer that cross-references Viatik's cached daily
weather forecast against scheduled itinerary activities, detects
outdoor-impacted plans at risk from rain, wind, and extreme temperatures, and
offers one-tap resolution: reschedule the activity to a clear day/slot, or swap
it for an indoor alternative.

The core is a **pure conflict detection engine** (`features/weather/lib/weather-conflict.ts`)
plus a **pure rescheduling/swap module** (`features/weather/lib/rescheduler.ts`),
surfaced through a warning banner and a resolution modal
(`features/weather/components/weather-conflict-banner.tsx`).

### Why

A plan built for a sunny afternoon fails when rain rolls in. Rather than making
users hunt for weather per day and manually re-plan, the assistant flags the
specific affected activities and lets the user fix them in one tap — offline,
from the already-cached forecast.

### Users and scenarios

- **Primary user:** A trip owner/editor building an itinerary.
- **Scenario 1:** Given an outdoor activity (e.g. "Hiking in the mountains")
  scheduled on a day forecast to be heavy rain, when I open the weather banner,
  I can reschedule it to a clear day or swap it for an indoor alternative in one
  tap.
- **Scenario 2:** Given an indoor activity (e.g. "Museum") on a rainy day, no
  conflict is shown (indoor plans are safe).
- **Offline or degraded-network behavior:** Detection runs on the cached Dexie
  forecast; rescheduling/swaps write through the existing activity repository
  (local-first), so no network is required.

## In Scope

- Conflict domain types under `features/weather/domain/weather-conflict-types.ts`.
- Pure activity-sensitivity classification and hazard detection engine, with
  unit tests.
- Pure rescheduling + indoor-swap suggestion logic and a dependency-injected
  transactional applier, with unit tests.
- Warning badges on impacted itinerary cards (board + calendar) and a resolution
  modal with one-tap actions.
- A summary banner in the trip overview.
- Reuses existing weather warnings thresholds and the activity repository.

## Out of Scope

- Hourly forecast ingestion (Viatik caches daily Open-Meteo forecasts). The
  detection contract accepts a per-day condition and a time-slot dimension, so
  an hourly provider can be added later without changing the rules.
- Cloud/outbox changes: writes go through the existing repository.
- Automatic (unprompted) rescheduling — the user always reviews and confirms.

## Constraints and Design

- **Architecture boundaries:** `features/weather/domain/weather-conflict-types.ts`
  (types), `features/weather/lib/weather-conflict.ts` + `rescheduler.ts` (pure
  logic), `features/weather/components/weather-conflict-banner.tsx` (UI). The
  libs depend only on domain types and injected repository interfaces.
- **Data ownership:** Writes go through `activityRepository` (move/update), which
  owns outbox/feed bookkeeping. No direct Dexie access from the new modules.
- **Security requirements:** No secrets; activity text is rendered as text
  (React escapes); no `dangerouslySetInnerHTML`; actions are gated behind trip
  edit permission.
- **Compatibility:** Same browsers/tooling as the rest of the app.
- **SOLID/design decisions:** Detection and suggestions are pure, deterministic
  functions; the applier is dependency-injected so it is testable with fakes.
  Rules live in small, explicit tables (sensitivity keywords, hazard→sensitivity
  mapping, severity bands, indoor-swap catalog).
- **Migration/rollback plan:** None — additive code only.
- **Observability:** Uses the existing `logger`; no PII logged.

## Acceptance Criteria

### Functional

- [x] Outdoor activities on hazardous days produce a conflict with a severity
      and reason.
- [x] Indoor activities never produce a weather conflict.
- [x] A resolution modal offers reschedule (to a clear day) and indoor-swap
      actions; applying persists via the activity repository.
- [x] Impacted itinerary cards show a warning badge.
- [x] Loading, empty, and failure states are handled.

### Authorization and security

- [x] Only editors/owners can apply changes (gated in the workspace).
- [x] Untrusted activity text is classified by keyword rules only; output is
      text-rendered.

### Reliability and offline behavior

- [x] Detection is deterministic and offline (cached forecast).
- [x] Applying uses the repository's existing local transactions.

### Accessibility and UX

- [x] The dialog is keyboard/touch reachable with labelled controls and
      `aria-live` status regions.
- [x] Badges carry accessible labels; severity is also conveyed by text.

### Verification

- [x] Unit tests for the detection engine and rescheduler.
- [x] Typecheck, lint, and the unit test suite pass.
- [x] Production build passes.

## Implementation Plan

1. Define conflict domain types.
2. Implement the detection engine (`weather-conflict.ts`) + tests.
3. Implement the rescheduler (`rescheduler.ts`) + tests.
4. Build the banner + resolution modal.
5. Wire conflicts into the trip overview and itinerary views.
6. Run typecheck, lint, tests, and build.

## Risks and Open Questions

- **Risk:** Category strings are free-form. Mitigation: keyword-based
  classification with explicit outdoor/indoor tables and a conservative
  "neutral" default (only heavy rain affects neutral).
- **Question:** Whether rescheduling should allow intra-day time shifts once
  hourly data exists. Decision: yes — the target type already carries
  `startTime`; the current daily provider keeps the same time on a clear day.

## Completion Notes

- **Verification commands:** `pnpm typecheck`, `pnpm test`, `pnpm lint`,
  `pnpm build`.
- **Verification results:** See session report.
- **Bug-ledger updates:** Not applicable (no confirmed bugs).
- **Follow-up work:** Hourly forecast ingestion; optional bulk "reschedule all"
  action.
