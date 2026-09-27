-- Freeze the exchange rate on a settlement the same way expenses already do.
-- Null means the repayment was logged in the trip base currency.
-- The compare-and-swap insert uses jsonb_populate_record, so this column is
-- stored on insert without rewriting the settlement update list. Updates do
-- not clear it, so a later sync cannot rewrite historical ledger math.

alter table public.expense_settlements
  add column if not exists exchange_rate_to_base numeric;

alter table public.expense_settlements
  drop constraint if exists expense_settlements_exchange_rate_chk;

alter table public.expense_settlements
  add constraint expense_settlements_exchange_rate_chk check (
    exchange_rate_to_base is null or exchange_rate_to_base > 0
  );
