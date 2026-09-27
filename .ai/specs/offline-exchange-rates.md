# Feature Specification: Offline Exchange Rate Cache

**Project:** Viatik  
**Owner:** Viatik Engineering  
**Status:** Ready for QA  
**Created:** 2026-09-27  
**Updated:** 2026-09-27  
**Related work:** Expense form, offline currency converter, immutable settlement ledger

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md) before completing this template. The framework entry point is [`../llms.txt`](../llms.txt). Record resulting bug invariants in [`../specs/bug-ledger.md`](../specs/bug-ledger.md), and use [`bug-report.md`](./bug-report.md) for defects discovered during delivery.

## What & Why

### What

When a traveler logs an expense in a currency other than the trip’s base currency, Viatik locks the conversion rate onto that expense before the Dexie write. The rate comes from a live fetch when the network succeeds, otherwise from the local `currencyRates` cache, otherwise from the built-in default table. The expense sheet tells the traveler, without blocking the save, when the locked rate was not a fresh live quote.

### Why

Pairwise balances already convert each expense with the `exchangeRateToBase` stored on that row. Today the expense form fills that field from a hardcoded table and ignores both the local cache and any live quote. A later reconnect must not change money that was already logged. The field test needs a cached rate that is visible at the moment of entry and then frozen.

### Users and scenarios

- **Primary user:** A trip member logging a shared expense with little or no connectivity.
- **Scenario 1:** Given the device can reach the rate service, when they save a peso expense on a USD trip, then `exchangeRateToBase` is the rate just fetched and no cached-rate warning is shown.
- **Scenario 2:** Given a cached or built-in rate and a failed fetch, when they save, then that rate is locked onto the new expense and a non-blocking warning explains it.
- **Scenario 3:** Given an existing expense with a locked rate, when they edit it without changing currency, then the original rate is saved again.
- **Offline or degraded-network behavior:** A failed fetch uses the last live or manual cache row. If that row is missing, the built-in table is used. The expense still saves. Settlements stay in the trip base currency.

## In Scope

- Dexie schema v38 backfills `currencyRates.source` as `default` | `live` | `manual`.
- `ExchangeRateService.resolveExchangeRate` with hierarchy: live fetch, then cache, then built-in default.
- Manual converter rates (`source: "manual"`) are never overwritten by a live refresh.
- `ExpenseFormSheet` resolves the rate before `expenseRepository.create` / `update` and passes `exchangeRateToBase`.
- Inline `role="status"` warning and an info toast when the locked rate’s source is `cache` or `default`.
- English and Spanish copy.

## Out of Scope

- A new Dexie table or any Supabase migration.
- Changes to the outbox, sync engine, sync mappers, `useTripBalances`, `trip-balances`, or `settlement` math.
- An exchange-rate field on `ExpenseSettlement`. Settlements remain in the trip base currency.
- Rewriting `exchangeRateToBase` on reconnect or on edit when the currency is unchanged.
- Changing `toBaseMinorUnits` rounding.
- Putting the warning on the sync status pill.

## Constraints and Design

- **Architecture boundaries:** `features/finance/lib/exchange-rate-service.ts` orchestrates. `DexieCurrencyRateRepository` is the only writer to `currencyRates`. `app/actions/exchange-rates.ts` performs the Frankfurter fetch. The expense form imports that server action and passes it in. The service does not import the outbox.
- **Data ownership:** Dexie `currencyRates` is a Level C device cache (no version, no actors, no outbox). The immutable snapshot is the existing `Expense.exchangeRateToBase`, already mapped to `expenses.exchange_rate_to_base`.
- **Cache hierarchy:**
  1. Same currency: the form stores `null` and does not call the service.
  2. Edit with the same currency and a stored rate: keep that rate. Do not fetch.
  3. Otherwise resolve `expense currency → trip base currency`:
     - `manual` row: return it as source `cache` and skip the fetch.
     - Successful fetch of a positive finite rate: write `source: "live"` (overwrite `live` and `default` only) and return source `live`.
     - Fetch failure or a non-positive result, with an existing `live` or `manual` row: return source `cache`.
     - Otherwise return `lookupRate` as source `default` and do not write a row.
- **`navigator.onLine`:** Not a gate. The service tries the fetch and falls back when it fails.
- **Security requirements:** The server action accepts only configured 3-letter currency codes and requests `https://api.frankfurter.app`. No API key. No amounts or user ids are logged.
- **Compatibility:** Next.js 16 client form, Dexie upgrade v38, existing minor-unit conversion.
- **SOLID/design decisions:** Resolution is a pure orchestration function over a repository and an injected fetcher. The form owns when a historical rate is reused. Netting keeps reading the stored snapshot.
- **Migration/rollback plan:** v38 only backfills `source` on `currencyRates`. Rollback is shipping the previous client; existing expense rows are unchanged. No remote rollback.
- **Observability:** Debug log of the currency pair and source. Do not log amounts.

The Architect Agent must review this section before implementation. Link any decision record here: Approved in the 2026-09-27 exchange-rate design review. No separate ADR.

## Acceptance Criteria

All criteria must be objectively testable.

### Functional

- [x] A successful fetch writes the pair to `currencyRates` with `source: "live"` and the form stores that rate on create.
- [x] A failed fetch with a prior live or manual row returns source `cache` and does not change that row.
- [x] A failed fetch with no live or manual row returns `lookupRate` as source `default`.
- [x] A manual row is not replaced by a later successful fetch.
- [x] Editing an expense without changing its currency submits the original `exchangeRateToBase`.

### Authorization and security

- [x] The rate action is a public FX quote with a fixed host and an allow-listed currency code.
- [x] Unrecognized codes return null and the form falls back; they are not interpolated into a URL.
- [x] Logs omit amounts and personal data.

### Reliability and offline behavior

- [x] The expense save does not wait on a successful network. Cache and default still lock a rate.
- [x] The outbox, sync mappers, and settlement repositories are unchanged.
- [x] Reconnecting does not update `exchangeRateToBase` on expenses already stored.
- [x] Save stays disabled for a foreign currency until a rate has been resolved, so a null rate is not written.

### Accessibility and UX

- [x] The warning is text inside the existing rate card, with `role="status"` and `aria-live="polite"`.
- [x] Live rates show the numeric rate and no cached-rate warning.
- [x] Cache and default rates show a sentence that includes the rate outcome (cached date, or built-in) and do not rely on color alone.
- [x] An info toast confirms a cache or default lock after a successful create. It is not the only explanation. Focus is not moved.
- [x] Copy exists in English and Spanish.

### Verification

- [x] Unit tests for `ExchangeRateService` and `ExpenseFormSheet`
- [x] Dexie v38 backfill covered
- [x] Targeted typecheck and lint
- [ ] Coverage for the new service is at least 90%
- [ ] QA and security notes recorded below after the run

## Implementation Plan

1. Red tests for fetch → Dexie, cache fallback, default fallback, form lock, warning, and historical edit.
2. Dexie v38 `source` backfill and repository `saveLiveRate`.
3. `ExchangeRateService` and the Frankfurter server action.
4. Expense form warning, toast, and historical-rate guard.
5. Green verification.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Foreign expense locks a resolved rate | Hardcoded table only | 100% of service cases | Vitest | Engineering |
| Edit rewrites a stored rate | Prevented by the form fallback | Still prevented when a live quote exists | Form test | Engineering |
| Outbox or netting files changed | 0 | 0 | Diff review | Engineering |

## Risks and Open Questions

- **Risk:** Resolving the rate inside `DexieExpenseRepository.create` or the outbox transaction can fail the whole save or disagree with the rate the sheet showed. Mitigation: resolve in the form and pass the number through the existing field.
- **Risk:** A new remote column would require a CAS function change. Mitigation: no Supabase change.
- **Risk:** Treating a settlement in a foreign currency as a base-currency row drops it from pairwise netting. Mitigation: settlements stay in the trip currency.
- **Risk:** `navigator.onLine` is often false while the server is reachable. Mitigation: try the fetch; fall back on failure.
- **Question:** None. Scope locked 2026-09-27.

## Completion Notes

- **Verification commands:** `pnpm exec vitest run features/finance/lib/exchange-rate-service.test.ts features/expenses/components/expense-form-sheet.test.tsx lib/db/currency-rate-migration.test.ts features/finance/data/dexie-currency-rate-repository.test.ts lib/db/money-migration.test.ts`; `pnpm exec eslint` on the changed files; `pnpm exec tsc --noEmit`
- **Verification results:** 2026-09-27: 5 files, 17 tests passed. ESLint on the changed files passed. `tsc --noEmit` passed. Signed-in browser pass of the expense sheet was not run.
- **Bug-ledger updates:** Not applicable. No defect invariant; this is a new feature with the snapshot rule recorded here.
- **Follow-up work:** Optional converter refresh through the same service. Foreign-currency settlements remain deferred. Coverage percentage for the new service was not measured.
