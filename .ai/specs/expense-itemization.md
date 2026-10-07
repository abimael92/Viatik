# Feature Specification: Itemized Receipt Expenses

**Project:** Viatik  
**Owner:** Viatik Product  
**Status:** Ready for QA  
**Created:** 2026-10-07  
**Updated:** 2026-10-07  
**Related work:** Expense create/edit flow, expense split and settlement ledger

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md) before completing this template. The framework entry point is [`../llms.txt`](../llms.txt). Record resulting bug invariants in [`../specs/bug-ledger.md`](../specs/bug-ledger.md), and use [`bug-report.md`](./bug-report.md) for defects discovered during delivery.

## What & Why

### What

Allow a traveler to record one receipt (for example, a restaurant or store purchase) as one expense with multiple priced item rows. Each row can be assigned to one or more trip travelers, using an equal split by default or exact amounts when needed. Tax, tip, and other receipt-wide charges are entered as ordinary rows. Keep the current simple one-amount expense flow available.

The receipt heading remains the expense description. The expense total is the sum of its item rows, while its existing `ExpenseShare` records are the aggregated per-traveler totals derived from row allocations.

### Why

A single receipt can contain items for different travelers at different prices. Splitting the entire receipt equally does not show what each person actually ordered or bought and can assign the wrong amount to each traveler.

### Users and scenarios

- **Primary user:** A trip member recording a shared meal, store receipt, or other multi-item purchase.
- **Scenario 1:** Given one restaurant receipt with a burger, sandwich, and combo assigned to different travelers, when it is saved, then the expense total equals the sum of the rows and each traveler's share equals the cost assigned to them.
- **Scenario 2:** Given an item shared by two travelers, when the user selects an equal split, then the item is divided fairly in integer minor units; when exact split is selected, then entered shares must sum exactly to that item's cost.
- **Scenario 3:** Given receipt tax or tip, when the user adds it as a row and assigns it, then it is included in the receipt total and traveler shares like any other item.
- **Scenario 4:** Given a simple expense with no itemization, when it is saved, then the existing expense flow and its split behavior remain unchanged.
- **Offline or degraded-network behavior:** The complete receipt and its derived shares are saved to Dexie atomically and synchronized through the existing outbox. Item details remain available offline and survive refresh/restart.

## In Scope

- A simple/itemized choice in the expense form, retaining the existing simple entry flow.
- Add, edit, and remove receipt item rows with item description, amount, and traveler allocation.
- Equal and exact allocations per item; exact allocations must add up to the row amount.
- Manual tax/tip/fee rows.
- Automatic receipt total from line amounts and aggregated per-traveler `ExpenseShare` amounts.
- Viewing line descriptions, prices, and assignments in the expense details disclosure.
- Local-first persistence, outbox synchronization, validation, and migrations.

## Out of Scope

- Receipt photo uploads, OCR, or automatic item extraction.
- Automatic tax/tip allocation or tax-rate calculations.
- Inventory, item quantities, or catalog/product management.
- Different currencies within one receipt.
- Splitting one item by percentages or arbitrary weights; equal and exact allocation cover this feature.

## Constraints and Design

- **Architecture boundaries:** The expense form reads trip members and named travelers through current local repositories. It submits through the expense repository only. No UI component queries Supabase. Pure validation/allocation math belongs in the expense domain/lib layer.
- **Data ownership:** Dexie remains the local source of truth. Store ordered line items on the parent `Expense`; keep monetary amounts as `bigint` minor units. Derive existing `ExpenseShare` rows by summing every item's per-traveler allocations so current balance, budget, and settlement calculations continue to consume the established expense/share model.
- **Atomicity:** Create or update the parent expense, its item rows (on the parent record), derived shares, and all related outbox mutations in one Dexie transaction. A partially updated receipt must not be visible or syncable.
- **Sync representation:** Use a strictly additive `line_items` JSONB column on `expenses`, encoded with monetary minor-unit values as decimal strings at the Supabase mapper boundary. Existing expense version/actor metadata and compare-and-swap behavior remain authoritative; no new remote table is needed. Legacy expense rows map to no item rows and remain unchanged.
- **Security requirements:** Validate non-empty item descriptions, positive row amounts, unique participant identities per row, allowed trip traveler/member identities, and exact allocation totals at the repository boundary. Existing editor/member policies and sync identity checks remain in effect. Render descriptions as text; do not log item details or amounts.
- **Compatibility:** Existing simple expenses and old clients must remain readable. The new optional field defaults to an empty array; itemized saves require the new client/schema version. A stale client must not erase existing itemization when editing a remote expense it cannot represent.
- **SOLID/design decisions:** Keep item-split arithmetic pure and separately tested. Keep persistence and outbox responsibilities in the expense repository. Keep the UI responsible for authoring, not deriving canonical share totals.
- **Migration/rollback plan:** Supabase migration 79 adds an additive `line_items` JSONB column with a `[]` default. Dexie v45 initializes legacy expenses with an empty item list in the same version that adds the device-only staged-photo store. Do not remove or rewrite legacy expense/share data. Use the existing `version` for optimistic concurrency.
- **Observability:** Log only expense/trip identifiers on failure or sync; never log descriptions, item assignments, or monetary values.

The Architect Agent must review this section before implementation. Link any decision record here: `None`.

## Acceptance Criteria

All criteria must be objectively testable.

### Functional

- [ ] The user can choose simple or itemized entry; simple expense creation still behaves as before.
- [ ] One itemized receipt retains a receipt/store heading and supports at least one and multiple item rows.
- [ ] Each row supports one traveler or multiple travelers, with equal or exact allocation.
- [ ] Equal row allocations sum exactly to the row amount, including currencies with zero or more decimal places.
- [ ] Exact row allocations are rejected accessibly unless all shares are valid non-negative amounts summing exactly to the row total.
- [ ] Receipt total is the sum of item rows; it cannot be independently edited in itemized mode.
- [ ] The saved parent `ExpenseShare` totals equal the sum of each traveler's allocations across all rows and sum to the receipt total.
- [ ] Tax, tip, and fee rows can be entered and assigned like other rows.
- [ ] Item descriptions, row costs, and assigned travelers are visible when viewing an itemized expense and restored when editing it.
- [ ] Removing a row updates the displayed total and derived shares; the last required row cannot leave a saveable zero-total receipt.

### Authorization and security

- [ ] Only users allowed by existing expense editor permissions can create or edit itemized receipts.
- [ ] Invalid identities, malformed or oversized line-item collections, and inconsistent totals are rejected at the repository/domain boundary.
- [ ] No remote domain-table queries are added to the UI; untrusted descriptions are rendered as text.
- [ ] No secrets, item details, or amounts are exposed through logs.

### Reliability and offline behavior

- [ ] Expense item rows, the parent expense, derived shares, and their outbox mutations commit or roll back together.
- [ ] Remote round-trip preserves row ordering, identifiers, descriptions, minor-unit amounts, and allocations.
- [ ] Existing expenses without line items still load, edit, sync, and calculate balances as before.
- [ ] Refresh/restart preserves itemized receipts and computed balances.
- [ ] Concurrent edits follow existing expense compare-and-swap conflict handling and cannot silently drop line rows.

### Accessibility and UX

- [ ] Add/remove-row actions are keyboard operable, have accessible names, and meet the 44×44 touch target convention.
- [ ] Amount and allocation validation is associated with its field/row and announced accessibly.
- [ ] Receipt rows remain usable on mobile; the item list uses progressive disclosure in the expense details view.
- [ ] UI interaction tests cover adding/removing rows, choosing travelers, equal/exact allocation, validation, and save.

### Verification

- [ ] Pure tests cover item validation, equal minor-unit distribution, exact sums, and aggregation into parent shares.
- [ ] Repository tests cover atomic local writes, rollback, and outbox payloads.
- [ ] Mapper and migration tests cover legacy and itemized expense round-trips.
- [ ] Expense form and panel rendering/interaction tests cover the acceptance behavior.
- [ ] Relevant `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.
- [ ] Coverage for changed/critical code is at least 90% or an exception is documented.
- [ ] QA review covers offline persistence, mobile/accessibility, and existing simple-expense regressions.
- [ ] Security review confirms authorization boundaries and repository validation.

## Implementation Plan

1. Add failing tests for line allocations, receipt totals, and aggregate shares.
2. Add the itemized domain shape and pure allocation/validation functions.
3. Extend the expense repository so create/update atomically persists parent, line items, aggregate shares, and outbox mutations.
4. Add additive Supabase/Dexie migrations and mapper round-trip coverage.
5. Add simple/itemized form UI and itemized expense detail display with accessible mobile interactions.
6. Run targeted tests, related tests, lint, typecheck, and build; complete QA/security review.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Itemized receipt traveler totals match their assigned rows | Not available | 100% | Pure allocation and repository tests | Engineering |
| Simple expense regression tests pass | Existing behavior | 100% | Expense form/repository regression tests | Engineering |
| Itemized saves that persist locally but omit row/share outbox data | Not available | 0 | Atomic repository tests | Engineering |

## Risks and Open Questions

- **Risk:** Older app clients may update an expense without understanding `line_items`. Mitigation: additive schema and explicit stale-client compatibility testing; do not silently clear itemization.
- **Risk:** Large untrusted line-item arrays can increase sync payload size. Mitigation: enforce a conservative maximum row count and bounded field lengths at the domain/repository boundary.
- **Question:** None after product clarification: receipts stay one expense, item rows can be shared, shared rows support equal or exact splits, receipt extras are manual rows, and simple expenses remain supported.

## Completion Notes

- **Verification commands:** `pnpm test -- --maxWorkers=4 --minWorkers=1`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, focused expense/media migration tests, and `git diff --check`.
- **Verification results:** Full test suite passed (200 files, 1,274 tests); lint, typecheck, build, and diff checks passed. Focused itemization and combined Dexie v45 migration tests passed. `supabase migration up --local` applied migrations 63–80, including 79/80; `supabase db lint --local --fail-on error` passed. It reported warnings in existing decision and RSVP functions, not the new migrations.
- **Bug-ledger updates:** Not applicable; this is a new feature.
- **Follow-up work:** Independent QA/mobile review, security review, and changed-code coverage reporting. Receipt photo/OCR remains out of scope.
