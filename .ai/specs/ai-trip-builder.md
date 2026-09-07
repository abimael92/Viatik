# Feature Specification: AI Trip Builder & Assistant

**Project:** Viatik
**Status:** Superseded
**Created:** 2026-09-06
**Updated:** 2026-09-06
**Related work:** Replaced by `ai-activity-scout.md`

> **Superseded.** The AI Trip Builder modal (create flow on the Trips page and
> enhance flow in the trip workspace) has been replaced by the AI Activity
> Scout drawer. See [`ai-activity-scout.md`](./ai-activity-scout.md). The pure
> validation/parsing patterns below remain useful reference for how the codebase
> validates untrusted "AI output" against a domain contract.

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md) before completing this template.

## What & Why

### What

A natural-language trip assistant that transforms a prompt such as *"3 days in
Rome on a $1,000 budget"* into structured, multi-day itineraries, a budget, and
a packing list. The generated plan is previewed in a modal and then injected
directly into Viatik's local (Dexie) database as valid `Trip`, `Activity`,
`Expense`, and `PackingItem` records, ready to sync to Supabase.

The core is a **pure parsing & ingestion engine** (`features/ai/lib/ai-generator.ts`)
that:
- validates arbitrary "AI output" JSON against a stable domain contract
  (`features/ai/domain/ai-types.ts`),
- falls back to an offline, rule-based natural-language parser when no remote
  AI backend is configured (Viatik is offline-first),
- and maps the validated payload into repository inputs, keeping the module
  side-effect free and dependency-injected so it is unit-testable.

### Why

Trips start with a rough idea ("a long weekend somewhere warm"). Asking users to
hand-build a trip, per-day itinerary, budget, and packing checklist is the
highest-friction part of planning. The assistant turns a single sentence into a
reviewable draft that can be applied in one click — while remaining fully
offline-capable and consistent with the existing domain model.

### Users and scenarios

- **Primary user:** Anyone creating a new trip or enhancing an existing trip.
- **Scenario 1 (create):** Given I am on the Trips page, when I open the AI
  assistant, type a prompt, and click "Apply to Trip", then a new Trip with
  activities, budget expenses, and a packing list is created locally and I am
  taken to it.
- **Scenario 2 (enhance):** Given I am inside an existing trip's workspace,
  when I open the AI assistant, describe an itinerary, and click "Apply", then
  activities, budget expenses, and packing suggestions are added to that trip.
- **Offline or degraded-network behavior:** Generation uses only local rules;
  applying writes to Dexie. No network is required.

## In Scope

- AI domain contract types under `features/ai/domain/`.
- Pure parsing & ingestion engine with schema validation and offline fallback
  parsing, plus unit tests.
- Interactive assistant modal with preset chips, loading states, a preview, and
  a one-click "Apply to Trip" action.
- Integration into the trip creation flow (Trips page) and the trip workspace
  header (existing trips).
- Budget line items become `Expense` records; per-activity planned costs become
  `Activity.estimatedCostMinor`; overall budget maps to `Trip.totalBudgetMinor`.
- Input validation at the parser boundary (amounts, currencies, dates).

## Out of Scope

- A live remote LLM integration / API key wiring. The engine exposes a
  validation contract and a rule-based generator; a real model provider can be
  plugged in later by producing a valid `AiItineraryPayload`.
- Cloud/outbox changes: applying writes through existing repositories, so sync
  is inherited.
- Schema/migration changes: no new Dexie tables or Supabase migrations.

## Constraints and Design

- **Architecture boundaries:** `features/ai/domain` (types), `features/ai/lib`
  (pure engine + builders), `features/ai/components` (modal). The engine depends
  only on domain types, the money module, and injected repositories.
- **Data ownership:** Writes go through the existing Dexie-backed repositories
  (`tripRepository`, `activityRepository`, `expenseRepository`,
  `packingRepository`), which own outbox/feed bookkeeping. No direct Dexie
  access from `features/ai`.
- **Security requirements:** All untrusted prompt/output text is validated and
  length-capped; amounts are parsed with the strict money module; no secrets;
  content is rendered as text (React escapes by default), no `dangerouslySetInnerHTML`.
- **Compatibility:** Same browsers/tooling as the rest of the app (Next 16,
  React 19, TypeScript 5).
- **SOLID/design decisions:** The generator is a pure module (validators,
  parsers, builders) with a dependency-injected applier. Repository interfaces
  are picked (`Pick<...>`) so the applier is testable with fakes. The modal is a
  thin client component that calls the engine and repositories.
- **Migration/rollback plan:** None — additive code only.
- **Observability:** Uses the existing `logger` for apply results; no PII logged.

## Acceptance Criteria

### Functional

- [x] A prompt produces a structured, valid payload (destination, dates, days,
      activities, budget, packing).
- [x] "Apply to Trip" (create) persists a new `Trip`, its `Activity` rows,
      budget `Expense` rows, and `PackingItem` suggestions.
- [x] "Apply" (enhance) adds activities/expenses/packing to an existing trip
      and fills trip dates/budget when provided.
- [x] Invalid amounts/currencies produce a clear error rather than bad data.
- [x] Loading, empty, offline, and failure states are handled in the modal.

### Authorization and security

- [x] Only the signed-in user id is used as owner/`createdBy`; server RLS is
      inherited from existing repositories.
- [x] Untrusted prompt/output is validated and length-capped; no raw HTML.
- [x] No secrets or sensitive data in code, logs, or responses.

### Reliability and offline behavior

- [x] Generation is deterministic and offline (no network dependency).
- [x] Applying uses the repositories' transactions (outbox + feed) unchanged.
- [x] Refresh/restart does not lose durable writes (Dexie is the source of truth).

### Accessibility and UX

- [x] The dialog is keyboard/touch reachable with labelled controls and
      `aria-live` status regions.
- [x] Buttons meet touch-target sizing; focus-visible rings are present.
- [x] Reduced-motion and responsive behavior match existing components.

### Verification

- [x] Unit tests added for the parser, validator, builders, and applier.
- [x] Typecheck, lint, and the unit test suite pass.
- [x] QA/security review is documented in the completion notes.

## Implementation Plan

1. Define domain types in `features/ai/domain/ai-types.ts`.
2. Implement the pure engine (`ai-generator.ts`): validators, fallback parser,
   builders, applier.
3. Write unit tests (`ai-generator.test.ts`).
4. Build the assistant modal (`ai-trip-modal.tsx`).
5. Wire the modal into the Trips page creation flow and the trip workspace.
6. Run typecheck, lint, and tests.

## Risks and Open Questions

- **Risk:** Generated budget expenses are indistinguishable from actual spent
  expenses. Mitigation: they are estimates the user can edit/delete; the spec
  records this as intended V1 behavior with a V2 "planned" flag as follow-up.
- **Question:** Whether a remote LLM should eventually replace the rule-based
  parser. Decision: yes, behind the same `AiItineraryPayload` contract (follow-up).

## Completion Notes

- **Verification commands:** `pnpm typecheck`, `pnpm test`, `pnpm lint`.
- **Verification results:** See session report.
- **Bug-ledger updates:** Not applicable (no confirmed bugs).
- **Follow-up work:** Optional remote LLM provider behind the payload contract;
  optional `isPlanned` flag on expenses.
