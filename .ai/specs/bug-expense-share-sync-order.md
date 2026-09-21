# Bug Report: Expense shares replayed before their parent expense

**Project:** Viatik  
**Reporter:** User  
**Status:** Resolved  
**Date reported:** 2026-09-21  
**Priority:** P1  
**Related feature/spec:** Offline expense synchronization

## Observed Problem

The sync engine repeatedly failed to replay an `expenseShare` insert with `Expense does not exist` when its parent expense was not yet present remotely.

## Expected Behavior

Expense mutations must be replayed before dependent expense-share mutations. If a stale share remains after its parent is missing remotely, the local parent must be requeued and the share retried without permanently consuming its retry budget.

## Root Cause

The outbox was processed by creation timestamp only. Existing or legacy queues could contain an expense-share mutation before the parent expense mutation, and a missing parent was treated as a generic retry failure.

## Fix

- Sort pending mutations so expenses replay before expense shares.
- When the remote rejects a share because its expense is missing, requeue the local parent expense through the transactional outbox and reset the share retry state.
- Add regression coverage for dependency ordering.

## Verification

`pnpm exec vitest run lib/sync/sync-engine.test.ts features/expenses/data/dexie-expense-repository.test.ts features/expenses/components/expense-panel.test.tsx`; `pnpm lint`; `pnpm typecheck`; `pnpm build`; `git diff --check` — all passed.
