-- Immutable settlement ledger: the insert is the repayment. Date records when
-- money changed hands without mutating Expense / ExpenseShare rows.

alter table public.expense_settlements
  add column if not exists date date not null default (timezone('utc', now()))::date;

alter table public.expense_settlements
  drop constraint if exists expense_settlements_date_iso_chk;

-- Keep the column a calendar date; the client stores yyyy-mm-dd.
alter table public.expense_settlements
  add constraint expense_settlements_date_present_chk
  check (date is not null);
