# Feature Specification: Expense Splitting & Settlement Ledger

**Project:** Viatik  
**Owner:** Viatik Product  
**Status:** Complete  
**Created:** 2026-09-24  
**Updated:** 2026-09-24  
**Related work:** Finance dashboard, Expense create flow, Shared trip feed

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md) before completing this template. The framework entry point is [`../llms.txt`](../llms.txt). Record resulting bug invariants in [`../specs/bug-ledger.md`](../specs/bug-ledger.md), and use [`bug-report.md`](./bug-report.md) for defects discovered during delivery.

## What & Why

### What

Trip balances are derived at read time from immutable `Expense` / `ExpenseShare` rows plus independent `ExpenseSettlement` repayments. Logging a repayment never mutates a past expense. The Finance tab shows pairwise net debts and a Settle Up sheet that appends a settlement through Dexie and the outbox.

### Why

Mutating `ExpenseShare.settledAt` to “check off” a debt creates write conflicts in the offline outbox and a dual source of truth. An append-only ledger keeps CAS per entity and lets any member record that money changed hands.

### Users and scenarios

- **Primary user:** A trip member reviewing who owes whom on the Finance tab.
- **Scenario 1:** Given a $100 expense split 50/50, when the group opens Balances, then one pairwise debt of $50 is shown with Settle Up.
- **Scenario 2:** Given that $50 debt, when either party logs a $50 settlement, then the UI net becomes $0 and the original expense rows are unchanged.
- **Offline or degraded-network behavior:** The settlement is written to Dexie and queued as its own outbox entity (`settlement`), independent of expense/share mutations.

## In Scope

- `date` on the existing `ExpenseSettlement` ledger row (`fromUserId` = payer, `toUserId` = receiver).
- Pure net/pairwise math that subtracts settlements from expense-derived debts.
- `useTripBalances` selector and Settle Up sheet on the Finance balances surface.
- Local feed item: “{payer} paid {amount} to {receiver}.”
- Dexie v37 + Supabase `date` column. No new table.

## Out of Scope

- Mutating `Expense` or `ExpenseShare` to mark a split settled.
- Settlements between non-profile traveler keys (remote FKs require member UUIDs).
- Multi-currency FX on the settlement itself (amount is stored in the trip base currency).
- Editing or deleting historical settlements in this delivery.

## Constraints and Design

- **Architecture boundaries:** UI reads Dexie only. `settlementRepository.create` owns the write. Expense repositories are not called.
- **Data ownership:** Dexie is SoT. Remote table remains `expense_settlements`. Amounts are `bigint` minor units.
- **Security requirements:** Insert is member-gated (`created_by = auth.uid()`, both parties active members). Client checks are UX only.
- **Compatibility:** Next.js 16, React 19, existing outbox entity type `settlement`.
- **SOLID/design decisions:** Pure math is isolated from React and Dexie. Settlement writes are a dedicated repository.
- **Migration/rollback plan:** Additive `date` column with default. Dexie backfills `date` from `createdAt`.
- **Observability:** Log settlement and trip IDs only, never amounts in analytics.

The Architect Agent must review this section before implementation. Link any decision record here: `None`.

## Acceptance Criteria

All criteria must be objectively testable.

### Functional

- [x] A $100 expense split 50/50 produces a $50 pairwise debt.
- [x] A $50 settlement between those two people updates the net to $0.
- [x] Creating a settlement does not change `Expense` or `ExpenseShare` rows.
- [x] Settle Up opens prefilled with payer, receiver, and exact net.

### Authorization and security

- [x] Either trip member can log the settlement; `createdBy` is the actor.
- [x] Remote insert still requires membership and `created_by = auth.uid()`.
- [x] Amounts are parsed as minor units; invalid amounts are rejected.

### Reliability and offline behavior

- [x] Settlement create uses its own Dexie transaction and `settlement` outbox mutation.
- [x] Expense and settlement queues stay independent.
- [x] Refresh keeps both the expense and the settlement.

### Accessibility and UX

- [x] Settle Up is a keyboard-dismissible sheet with a 44×44 primary action.
- [x] Success and failure use toast copy.

### Verification

- [x] Unit tests for ledger math and feed summary
- [x] UI test for Settle Up on a pairwise debt
- [x] Typecheck and lint on changed files

## Implementation Plan

1. Red tests for pairwise netting and settlement apply.
2. Date field, repository, hook, sheet.
3. Feed + i18n.
4. Green verification.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Expense split then settlement nets to zero | Untested | 100% of fixture cases | Vitest | Product |
| Expense rows mutated on settle | Possible via settleShare | Zero | Repository test | Engineering |

## Risks and Open Questions

- **Risk:** Pairwise nets can differ from the old greedy transfer plan. Mitigation: show pairwise debts as the actionable list; standing still uses group nets after settlements.
- **Question:** None.

## Completion Notes

- **Verification commands:** Targeted Vitest (ledger math, settlement UI, feed, mappers, money migration), `pnpm typecheck`, ESLint on changed files
- **Verification results:** Remote pulls now emit `logged_settlement` for collaborator inserts. `settleShare` is removed so share `settledAt` is no longer a repayment write path.
- **Bug-ledger updates:** Settlement dual-source invariant recorded.
- **Follow-up work:** Live Finance and Home browser QA after an authenticated session is available. Hosted project `spcpdbxripukvqrnsuim` now has migration 62 (`expense_settlements.date`).
