# Bug Report: Settlement insert trigger reads a missing status column

**Project:** Viatik  
**Reporter:** Viatik Product  
**Status:** Ready for QA  
**Date reported:** 2026-09-28  
**Priority:** P0  
**Related feature/spec:** [expense-settlement-ledger.md](./expense-settlement-ledger.md), [voting-notification-center.md](./voting-notification-center.md)

## Observed Problem

Inserting a row into `public.expense_settlements` raises `record "new" has no field "status"`. The insert is aborted, so a settlement that already exists in Dexie cannot sync during a field test.

## Expected Behavior

A settlement insert commits. After commit, one in-app notification is queued for `to_user_id` (the payee) with type `settlement_recorded`. The message is a JSON payment payload: payer id, payer display name or the `__payer__` sentinel, amount as a raw minor-unit integer, currency, and trip id. The client formats the amount. The payload does not include a phone number. Quiet hours still apply to the payee. A soft-deleted insert does not notify. The same payee, type, and settlement id does not create a second row.

`notification_deliveries`, phone verification, and the OpenWA sidecar are out of this fix.

## Impact

- **Users affected:** Every trip member whose settlement syncs to Postgres.
- **Severity:** Critical
- **Data/security impact:** The remote ledger row is rejected. No phone number is logged by this trigger.
- **Workaround:** None. The trigger runs on every insert.

## How to Reproduce

1. Apply migrations through `00000000000051_notification_quiet_hours.sql`.
2. Insert an `expense_settlements` row. The table has no `status` column.
3. Observe the trigger error and the rolled-back insert.

**Reproducibility:** Always  
**Minimal reproduction/test:** `supabase/settlement-notification-trigger.test.ts`

## Environment Details

- **Application version/commit:** Working tree, 2026-09-28
- **Network state:** Online sync of a local settlement
- **User role/account state:** Active trip member
- **Database/API version:** Postgres trigger `public.generate_settlement_notification`
- **Feature flags/configuration:** Phases 2–5 (E.164 opt-in, OpenWA, `notification_deliveries`) are frozen

## Investigation

### Root Cause

`public.expense_settlements` is an append-only repayment ledger (`supabase/migrations/00000000000008_collaboration_and_media.sql`). It has never had a `status` column.

`public.generate_settlement_notification`, last replaced in `supabase/migrations/00000000000051_notification_quiet_hours.sql`, still evaluates `new.status = 'pending'` before inserting a `settlement_pending` row for `from_user_id`. Postgres raises on the missing field and aborts the settlement insert.

### Contributing Factors

- The original notification migration copied the connection-request `status = 'pending'` guard onto a table that records a completed payment.
- The notice was addressed to the payer and worded as an unpaid debt.

### Security Assessment

The replacement stays a `security definer` trigger with `search_path = public`, same as the other notification generators. It inserts one owner-scoped `notifications` row for the payee. It reads `profiles.full_name` only. It does not read or store `profiles.phone`, and it does not write a delivery or webhook log.

## Fix Plan

1. Regression test for the replacement function contract.
2. Additive migration: enum value `settlement_recorded` and `create or replace` of the trigger function. The existing `AFTER INSERT` trigger stays attached.
3. In-app rendering of the payment payload so the new type does not crash the notification list.
4. Bug-ledger invariant.

## Acceptance Criteria for Resolution

- [ ] A settlement insert no longer references `new.status`.
- [ ] The notification user is `to_user_id` and the type is `settlement_recorded`.
- [ ] The message is the structured payment payload and contains no phone number.
- [ ] The migration does not create `notification_deliveries` or any sidecar object.
- [ ] A regression test covers the contract.
- [ ] The bug-ledger invariant is recorded.

## Verification Evidence

- `pnpm exec vitest run supabase/settlement-notification-trigger.test.ts features/notifications/lib/notification-message.test.ts` — 6 passed.
- `pnpm exec eslint` on the changed TypeScript files — passed.
- `pnpm typecheck` — passed.
- Linked database: migration 70 applied. `pg_get_functiondef('public.generate_settlement_notification()')` matches the payee payload and does not read a status field.
- Migrations 63–69 are still absent on the linked database. They were not pushed.

## QA Report

- Checks run: Vitest for the migration contract and payment-payload copy; ESLint on changed TypeScript; `pnpm typecheck`; remote function definition.
- Passed: all of the above.
- Failed: none.
- Coverage: migration contract and payload rendering are tested. The trigger was not executed with a live settlement insert, so quiet-hours and conflict behavior are covered by the function text and the deployed definition.
- Acceptance criteria status: met for Phase 1.
- Regression risks: a later `db push` must still apply migrations 63–69. The notification list now renders `settlement_recorded`; that screen was not opened in a signed-in browser.
- Recommended follow-up: apply migrations 63–69 with `supabase db push --linked --include-all` when those features are ready. A plain push now stops because 70 is already recorded after that gap. Phases 2–5 stay frozen.

## Follow-up: amount formatting (migration 71)

`expense_settlements.amount` stores minor units in a `numeric(12, 2)` column. Migration 70 passed it through `to_char(new.amount, 'FM9999999990.00')`, so a 5001 minor-unit payment ($50.01) was stored as `"5001.00"`. Migration 70 is already recorded on the linked database, so the fix is a new migration, `00000000000071_settlement_notification_minor_units.sql`. It:

- replaces the function so `amount` is `new.amount::bigint`, a JSON integer;
- rebuilds the payload of existing `settlement_recorded` rows from their settlement. The stored message is not cast, so a malformed row cannot abort the migration. The update bumps `updated_at`, and clients pull the corrected rows.

`parseSettlementRecordedPayload` now returns `amountMinor: bigint`. It accepts only a positive safe integer up to `MAX_MINOR_UNITS`. `notificationMessage` formats that value with `decimalFromMinorUnits`. A legacy string amount or an unsupported currency shows the fallback copy instead of a wrong number.

Verification: `pnpm exec vitest run supabase/settlement-notification-trigger.test.ts features/notifications` passed. Migration 71 has not been pushed to the linked database.

## Security Review

- **Scope reviewed:** `generate_settlement_notification` replacement and the notification payload rendered in the client.
- **Findings:** None. The payee already participates in the settlement, so payer name, amount, currency, and trip id are in scope for that notification. Phone numbers stay off the row.
- **Severity:** None.
- **Required remediation:** None.
- **Residual risk:** Quiet hours still use the database session clock, as the previous trigger did. Delivery webhooks are not part of this change.
- **Approval status:** Approved for Phase 1 only.

## QA Report

Pending test execution.
