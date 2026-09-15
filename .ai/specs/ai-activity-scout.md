# Feature Specification: AI Activity Scout

**Project:** Viatik
**Owner:** Abimael Garcia
**Status:** In Progress
**Created:** 2026-09-06
**Updated:** 2026-09-06
**Related work:** Supersedes `ai-trip-builder.md` enhance/create modal flows

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md) before completing this template. The framework entry point is [`../llms.txt`](../llms.txt). Record resulting bug invariants in [`../specs/bug-ledger.md`](../specs/bug-ledger.md), and use [`bug-report.md`](./bug-report.md) for defects discovered during delivery.

## What & Why

### What

Replace Viatik's rigid "AI Trip Builder" modal (which generated whole multi-day
itineraries/budgets/packing lists from a single prompt) with an interactive
**AI Activity Scout** — a slide-over drawer inside a trip workspace that
suggests individual, curated activities the traveler can drop directly into a
specific day of their existing itinerary.

The scout returns a feed of **modular activity suggestion cards**, each carrying
rich metadata: a title, category badge, description, estimated duration, a
time-of-day recommendation, and transit/logistics notes. From a card the user
can pick any day of their trip and add that activity to the itinerary in one tap.

The core is a pure, dependency-injected engine
(`features/ai/lib/ai-scout-generator.ts`) that:
- generates deterministic, destination-aware suggestions **offline** (no API key
  required), matching Viatik's offline-first behavior, and
- optionally calls a **configurable LLM endpoint** when `AI_SCOUT_ENDPOINT` is
  set, validating the model's response against a stable domain contract and
  falling back to the offline heuristic on any failure.

### Why

Trips usually start with a concrete itinerary already in place. The old "generate
my whole trip" modal was high-friction and context-free — it blindly produced a
generic template with no awareness of what the traveler had already planned.
Travelers more often want to *augment* a plan ("what are the hidden spots near
the center?", "best food for a rainy day?"). The scout turns that into a
low-friction, reviewable feed that writes straight into the existing itinerary
without disturbing the traveler's schedule.

### Users and scenarios

- **Primary user:** Anyone inside an existing trip who wants suggestions to add
  to their itinerary.
- **Scenario 1 (suggest):** Given I am in a trip workspace, when I open the AI
  Scout and type or tap a preset query (e.g. "Local Food Gems"), then I see a
  feed of suggestion cards with duration, time-of-day, and transit tips.
- **Scenario 2 (add to day):** Given a suggestion card, when I pick a day and
  confirm, then the activity is added to that day's itinerary at the suggested
  time and category.
- **Offline or degraded-network behavior:** Suggestions are generated locally by
  the heuristic engine; adding uses the Dexie-backed activity repository. The
  LLM path is optional and falls back offline automatically.

## In Scope

- AI scout domain contract types under `features/ai/domain/` (suggestion
  metadata: title, category, description, duration, time-of-day, transit note,
  location, optional estimated cost).
- Pure scout engine with a destination-aware offline heuristic, a validator for
  untrusted LLM output, and an optional HTTP `ScoutProvider`, plus unit tests.
- Interactive slide-over drawer UI with preset chips, a free-text prompt, loading
  states, a suggestion card feed, and a per-card day picker ("+ Add to Day").
- Integration into the trip workspace header (replaces the old "AI Assistant"
  enhance modal).
- Removal of the old AI Trip Builder from the Trips page create flow (the scout
  augments existing trips; manual trip creation remains).
- Optional `AI_SCOUT_ENDPOINT` / `AI_SCOUT_API_KEY` server env wiring (no new
  vendor SDK).
- Validation at the boundary: lengths capped, amounts parsed with the strict
  money module, content rendered as text (React escapes by default).

## Out of Scope

- Generating whole trips/budgets/packing lists from a prompt (removed capability).
- A specific LLM vendor SDK or hosted model selection. The endpoint is
  configurable and generic.
- Cloud/outbox changes: writing an activity goes through the existing
  `ActivityRepository`, so sync and feed bookkeeping are inherited.
- Schema/migration changes: no new Dexie tables or Supabase migrations.

## Constraints and Design

- **Architecture boundaries:** `features/ai/domain` (types), `features/ai/lib`
  (pure engine + validator + provider), `features/ai/components` (scout drawer),
  `app/actions/ai-scout.ts` (optional server-side LLM call). The engine depends
  only on domain types, the money module, and injected abstractions.
- **Data ownership:** Writing an activity goes through the existing
  `ActivityRepository` (Dexie + outbox + feed). No direct Dexie access from
  `features/ai`.
- **Security requirements:** Untrusted prompt and LLM output are validated and
  length-capped by `validateScoutResult`; amounts use the strict money module;
  no `dangerouslySetInnerHTML`; the optional API key lives in server env only
  (`env.mjs`) and is never logged or sent to the client; the server action treats
  input as untrusted and constrains its return value to the shape the UI renders.
- **Compatibility:** Same browsers/tooling as the rest of the app (Next 16,
  React 19, TypeScript 5). Animations use `motion/react` (already a dependency).
- **SOLID/design decisions:** The engine is a pure module (offline generator +
  validator + HTTP provider) with a dependency-inverted applier. The drawer is a
  thin client component that calls the engine/repositories. The optional LLM path
  is behind a `ScoutProvider` interface so the heuristic is the default and the
  remote call is swappable.
- **Migration/rollback plan:** None — additive code; the old modal/generator are
  removed only after confirming they are no longer referenced.
- **Observability:** Uses the existing `logger` for provider failures (no PII, no
  secrets).

The Architect Agent must review this section before implementation. Link any decision record here: `None`.

## Acceptance Criteria

All criteria must be objectively testable.

### Functional

- [ ] A prompt or preset produces a structured list of suggestion cards with
      title, category, description, duration, time-of-day, and transit note.
- [ ] Suggestions are destination-aware (different pools for Kyoto vs. Rome vs.
      a generic city), deterministic offline.
- [ ] "+ Add to Day" writes a valid `Activity` to the selected day at the
      recommended time/category/location without disturbing existing activities.
- [ ] Malformed/oversized input is normalized or rejected with a clear error,
      never persisted as bad data.
- [ ] Loading, empty, offline, and provider-failure states are handled in the UI.

### Authorization and security

- [ ] Adding an activity is gated by the trip's edit role (reuses existing
      `canEdit` in the workspace); the drawer is hidden for view-only members.
- [ ] Untrusted prompt and LLM output are validated and length-capped; no raw HTML.
- [ ] The API key is server-side only and is never logged or returned to the client.
- [ ] No secrets or sensitive data in code, logs, or responses.

### Reliability and offline behavior

- [ ] Generation works fully offline via the heuristic (no network dependency).
- [ ] The LLM path, when configured, falls back to the heuristic on any failure.
- [ ] Writes use the repository's transaction (outbox + feed) unchanged; refresh
      does not lose durable writes.

### Accessibility and UX

- [ ] The drawer is keyboard/touch reachable with labelled controls and
      `aria-live` status regions.
- [ ] Buttons meet touch-target sizing; focus-visible rings are present.
- [ ] The drawer animates with `prefers-reduced-motion` respected and is
      responsive on supported viewports.

### Verification

- [ ] Unit tests added for the offline generator, validator, and provider
      fallback.
- [ ] Typecheck, lint, and the unit test suite pass.
- [ ] QA/security review is documented in the completion notes.

## Implementation Plan

1. Red test: write `ai-scout-generator.test.ts` expressing the contract
   (destination awareness, metadata, validation, provider fallback).
2. Implement `features/ai/domain/ai-scout-types.ts` and
   `features/ai/lib/ai-scout-generator.ts` until green.
3. Add `AI_SCOUT_ENDPOINT`/`AI_SCOUT_API_KEY` to `env.mjs` and the optional
   `app/actions/ai-scout.ts` server action.
4. Build the drawer UI (`ai-scout-sidebar.tsx`).
5. Wire into `trip-workspace.tsx`; remove the old modal from `trip-workspace.tsx`
   and `trip-dashboard.tsx`; remove orphaned `ai-trip-modal`/`ai-generator`.
6. Run typecheck, lint, and tests; update this spec's completion notes.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Scout engagement (opens per trip) | 0 | > 0.5 | Client event log | abimael.garcia |
| Suggestion → added-to-day conversion | 0 | > 20% | Activity feed counts | abimael.garcia |
| Offline availability | N/A | 100% | No network path on the default engine | abimael.garcia |

## Risks and Open Questions

- **Risk:** Removing the whole-trip generator drops a "planning from scratch"
  capability. Mitigation: manual "Create trip" remains; the scout covers the more
  common "augment a plan" path. Documented as an intentional product decision.
- **Question:** Should the scout eventually support adding budget estimates or
  transit segments, not just activities? Decision: V1 is activity-only; follow-up.
- **Question:** The configurable LLM endpoint is provider-agnostic. A future
  decision could pin a specific vendor (e.g. OpenAI-compatible chat) behind the
  same `ScoutProvider` interface.

## Completion Notes

- **Verification commands:** `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`.
- **Verification results:**
  - `pnpm typecheck` — PASS (exit 0).
  - `pnpm test` — PASS, 595 tests across 80 files (21 new AI scout engine tests).
  - `pnpm lint` — PASS, 0 errors / 0 warnings.
  - `pnpm build` — PASS, production build compiles and prerenders all 17 routes.
- **Bug-ledger updates:** `Not applicable` (no confirmed bugs).
- **Follow-up work:** Optional budget/transit suggestions; optional pinned LLM
  vendor behind the `ScoutProvider` interface.
