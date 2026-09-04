# Feature Specification: Integer Minor-Unit Money Domain

**Project:** Viatik  
**Owner:** Viatik Engineering  
**Status:** In Progress  
**Created:** 2026-09-03  
**Updated:** 2026-09-03  
**Related work:** Release A2.0/A2.1

## What & Why

Viatik will represent monetary amounts in its domain as integer `bigint` minor units with explicit currency codes and exponents. This removes floating-point multiplication and safe-integer limits from expense parsing, splitting, balances, persistence, and synchronization boundaries.

## In Scope

- Infrastructure-independent `MinorUnits` and `CurrencyCode` domain types.
- Explicit supported-currency exponent lookup for USD, EUR, GBP, CAD, MXN, and JPY.
- Exact decimal-string parsing and formatting without floating-point monetary arithmetic.
- `Expense`, `ExpenseShare`, and `ExpenseSettlement` field names that explicitly identify minor units.
- Expense repository contracts, Dexie implementation, calculators, UI consumers, Supabase mappers, outbox payloads, and tests updated to the new domain shape.

## Out of Scope

- Supabase schema or SQL migration changes.
- Backfilling existing production Supabase records.
- Contact or account-linking changes.
- Exchange rates and cross-currency aggregation.
- Currencies other than the explicitly configured initial set.

## Constraints and Design

- **Architecture:** Money types and rules live in the domain and have no Dexie, Supabase, React, or browser dependencies.
- **Data ownership:** Dexie remains the local domain source of truth. Supabase remains a remote synchronization target.
- **Representation:** All domain amounts are `bigint`; UI values are decimal strings; remote numeric values cross the mapper boundary as base-10 strings. Persisted input is capped at `9,999,999,999` minor units to fit the current `numeric(12,2)` remote columns under the existing integral-minor-unit contract.
- **Currency:** `CurrencyCode` is a normalized string type. Only configured currency codes have an exponent.
- **Parsing:** Inputs must be canonical decimal strings, non-negative unless explicitly allowed, and contain no more fractional digits than the currency exponent.
- **Formatting:** Formatting must not convert the complete amount to `number`. Locale grouping may be applied through `Intl.NumberFormat` using supported bigint integer parts.
- **Compatibility:** Current remote columns retain the application's existing integer-minor-unit semantics for A2.1 even though their SQL type is `numeric(12,2)`. Mappers accept only integral remote values and reject ambiguous fractional rows. SQL column changes and audited data backfills are deferred to later A2 releases.
- **Rollback:** Revert the application/domain release before any schema migration. No remote schema rollback is needed in this release.

## Acceptance Criteria

- [ ] `MinorUnits` is defined as `bigint` and used by all expense monetary fields.
- [ ] Expense fields are named `amountMinor`, `shareAmountMinor`, and `amountMinor` for settlements.
- [ ] Parsing USD/EUR supports exactly up to two fractional digits without floating-point multiplication.
- [ ] Parsing JPY rejects fractional digits.
- [ ] Invalid, negative, exponent-overflow, and unsupported-currency inputs are rejected.
- [ ] Formatting supports values above `Number.MAX_SAFE_INTEGER`.
- [ ] Equal, exact, and percentage splits conserve every minor unit.
- [ ] Dexie repositories and outbox writes preserve bigint values.
- [ ] Supabase mappers serialize bigint amounts as decimal strings and deserialize with `BigInt`.
- [ ] No Supabase migrations or contact components are changed.
- [ ] Tests, typecheck, lint, and production build pass.

## Implementation Plan

1. Add failing money parsing, formatting, calculator, and mapper tests.
2. Add domain money types and exponent-aware utilities.
3. Rename entity and repository monetary fields.
4. Convert calculators to bigint arithmetic.
5. Update Dexie repositories, UI consumers, fixtures, outbox mappings, and remote mappers.
6. Run full verification and record residual compatibility risks.

## Risks and Open Questions

- Existing persisted IndexedDB values use legacy field names and numbers. Dexie upgrades safe integer records and rejects ambiguous fractional or unsafe values rather than silently rounding.
- Existing Supabase numeric columns may contain ambiguous legacy semantics. Production data must be audited before schema backfill.
- Percentage input remains a validated number in A2.1; monetary results use bigint and deterministic remainder assignment.

## Completion Notes

- **Verification commands:** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`
- **Verification results:** `pnpm test` passed (25 files, 123 tests); `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed on 2026-09-03.
- **Follow-up work:** Supabase dual-column migration and production audit/backfill.
