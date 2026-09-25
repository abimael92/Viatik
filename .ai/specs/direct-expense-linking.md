# Feature Specification: Direct Expense Linking

**Project:** Viatik  
**Owner:** Viatik Product  
**Status:** Complete  
**Created:** 2026-09-24  
**Updated:** 2026-09-24  
**Related work:** [activity-checklists.md](./activity-checklists.md), Home live timeline, Expense create flow

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md) before completing this template. The framework entry point is [`../llms.txt`](../llms.txt). Record resulting bug invariants in [`../specs/bug-ledger.md`](../specs/bug-ledger.md), and use [`bug-report.md`](./bug-report.md) for defects discovered during delivery.

## What & Why

### What

When an editor completes a purchase-oriented Must-do on Home, Viatik immediately persists the checklist change, then opens a prefilled expense sheet. Saving the expense attaches it to the parent Activity through the existing `Expense.activityId` field. Canceling the sheet leaves the Must-do completed.

### Why

Travelers already check off purchase tasks such as “Pagar estacionamiento” or “Comprar entradas” while standing in line. Forcing a trip-tab detour to log the cost breaks that moment. The handoff must stay a UI convenience so Activity JSONB and Expense rows never become dual sources of truth.

### Users and scenarios

- **Primary user:** A trip owner or editor using Home during an active trip.
- **Scenario 1:** Given a Must-do titled “Pagar estacionamiento”, when the editor checks it off, then the checklist saves locally and a prefilled expense sheet opens with that title, the Activity date, a mapped category, and `activityId`.
- **Scenario 2:** Given the expense sheet is open after a completed Must-do, when the editor cancels or dismisses it, then the Must-do stays completed and no compensating Activity write is queued.
- **Scenario 3:** Given a Must-do titled “Meet guide”, when any member checks it off, then only the checklist updates and no expense sheet opens.
- **Offline or degraded-network behavior:** Checklist and expense writes each go through their own Dexie transaction and outbox mutation. Both survive refresh. Sync replays them independently.

## In Scope

- Purchase-oriented title heuristic and Activity-category → spending-category mapping.
- Check-then-sheet handoff from Home Activity detail for owners/editors.
- Prefill of description, date, category, trip context, and `activityId` via React state only.
- Extracted reusable expense form sheet that writes `activityId` on create.
- Optional activity-scoped “costs on this stop” list from existing trip expense watches.
- Client-only outbox ranking so a pending Activity parent can replay before an Expense that references it.

## Out of Scope

- Any field on `ActivityChecklistItem` (`linkedExpenseId`, `isBillable`, etc.).
- Any new Expense column (`checklistItemId` or similar).
- Dexie schema version bumps or Supabase migrations.
- Unique-per-Must-do enforcement or durable badges on a specific checklist row.
- Rolling back a completed Must-do when the expense sheet closes.
- Receipt scan / OCR.

## Constraints and Design

- **Architecture boundaries:** Home timeline owns the handoff. `activityRepository.updateChecklist` owns the Must-do write. `expenseRepository.create` owns the expense write. UI never queries Supabase domain tables.
- **Data ownership:** Dexie is the local source of truth. The only persistent relationship is `Expense.activityId`. Must-do title is ephemeral form input.
- **Security requirements:** Expense insert remains editor-gated by existing RLS. Viewers may complete Must-dos but never see the sheet. Untrusted titles are trimmed, length-limited, and rendered as text.
- **Compatibility:** Next.js 16 App Router, React 19, TypeScript strict, existing Dexie/outbox/CAS paths.
- **SOLID/design decisions:** Keep checklist and expense writes as separate repository methods. Share one expense form between Home and the Money tab. Pure helpers own heuristic and category mapping.
- **Migration/rollback plan:** None. No schema change. Feature is removable by deleting the handoff UI.
- **Observability:** Do not log Must-do titles or expense amounts. Existing repository debug logs may identify activity and expense IDs only.

The Architect Agent must review this section before implementation. Link any decision record here: `None`.

## Acceptance Criteria

All criteria must be objectively testable.

### Functional

- [x] Completing a purchase-oriented Must-do as an editor opens a prefilled expense sheet with the Must-do title, Activity `dayDate`, mapped category, and parent `activityId`.
- [x] Completing a non-purchase Must-do does not open the sheet.
- [x] Canceling or dismissing the sheet leaves the Must-do completed and does not call `updateChecklist` again.
- [x] Saving the expense creates a local expense with `activityId` set and does not patch checklist JSON.
- [x] A failed checklist write rolls back the checkbox and never opens the sheet.

### Authorization and security

- [x] Owners and editors can receive the handoff.
- [x] Viewers can complete Must-dos but never see the expense sheet.
- [x] Expense create remains editor-gated server-side by existing policies.
- [x] Untrusted title/description input is validated and rendered as text.

### Reliability and offline behavior

- [x] Checklist update and expense create are independent Dexie transactions and outbox mutations.
- [x] Refresh after a completed Must-do (with or without a saved expense) keeps the checklist state.
- [x] Expense retries do not mutate the Activity checklist.
- [x] Optional sync ranking keeps a pending Activity parent ahead of an Expense that references it; shares still follow the expense.

### Accessibility and UX

- [x] Nested sheet is keyboard-dismissible and returns focus to the Must-do row.
- [x] Success and failure are announced with toast / `aria-live` copy.
- [x] Touch targets meet 44×44 and reduced-motion dialog conventions.

### Verification

- [x] Unit tests for heuristic and category mapping
- [x] UI tests for handoff, cancel-does-not-revert, viewer gate, and `activityId` on create
- [x] Sync ranking test when ranking is implemented
- [x] Typecheck, lint, and relevant tests pass

## Implementation Plan

1. Red tests for mapping helpers and Home handoff.
2. Pure helpers, extracted expense sheet, Home wiring.
3. Optional outbox ranking (no schema).
4. i18n and accessibility.
5. Green verification.
6. QA review of cancel, offline, and permission cases.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Editor purchase Must-do → expense sheet | 0 | Sheet opens with correct prefill | Vitest Home + checklist tests | Product |
| Cancel does not revert checklist | Untested | 100% of cancel cases | Vitest | Product |
| Schema changes | N/A | Zero Dexie/Supabase schema diffs | Diff review | Engineering |

## Risks and Open Questions

- **Risk:** Nested dialogs on mobile. Mitigation: keep Activity modal mounted; sheet dismiss returns focus to the Must-do row.
- **Risk:** Keyword heuristic misses some purchases. Mitigation: only auto-open on confident titles; non-matches stay silent rather than nag.
- **Question:** None remaining after architecture approval.

## Completion Notes

- **Verification commands:** `pnpm exec vitest run` on mapping, Home HUD, expense sheet/panel, sync-engine, and i18n tests; `pnpm typecheck`; ESLint on changed files
- **Verification results:** HUD now opens `ExpenseFormSheet` only after a successful Dexie checklist write, and only when `canManageExpenses` and `isPurchaseOrientedMustDo` are both true. Cancel clears `expenseIntent` only.
- **Bug-ledger updates:** Not applicable
- **Follow-up work:** Live Home browser QA of the nested sheet after an authenticated session is available.
