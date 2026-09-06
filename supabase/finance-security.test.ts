import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const budgetMigration = readFileSync(join(process.cwd(), "supabase/migrations/00000000000029_finance_budgets.sql"), "utf8");
const casMigration = readFileSync(join(process.cwd(), "supabase/migrations/00000000000030_finance_cas.sql"), "utf8");
const plannedMigration = readFileSync(join(process.cwd(), "supabase/migrations/00000000000031_finance_planned_estimates.sql"), "utf8");

describe("finance budgets migration (Phase 2A)", () => {
  it("adds trip-level budget and expense metadata columns", () => {
    expect(budgetMigration).toContain("add column total_budget");
    expect(budgetMigration).toContain("add column expense_date");
    expect(budgetMigration).toContain("add column exchange_rate_to_base");
    expect(budgetMigration).toContain("add column category_id");
    expect(budgetMigration).toContain("alter type public.expense_split_type add value 'shares'");
  });

  it("creates the wallet and daily override tables with updated_at triggers", () => {
    expect(budgetMigration).toContain("create table public.user_wallets");
    expect(budgetMigration).toContain("create table public.daily_budget_overrides");
    expect(budgetMigration).toContain("create trigger set_user_wallets_updated_at");
    expect(budgetMigration).toContain("create trigger set_daily_budget_overrides_updated_at");
  });

  it("scopes wallet access to the wallet owner only", () => {
    expect(budgetMigration).toMatch(/create policy "user_wallets_select_owner"/);
    expect(budgetMigration).toMatch(/using \(user_id = auth\.uid\(\)\)/);
    expect(budgetMigration).toMatch(/create policy "user_wallets_insert_owner"/);
    expect(budgetMigration).toMatch(/create policy "user_wallets_update_owner"/);
    expect(budgetMigration).toMatch(/create policy "user_wallets_delete_owner"/);
  });

  it("scopes daily budget overrides to trip members (select) and editors (write)", () => {
    expect(budgetMigration).toMatch(/create policy "daily_budget_overrides_select_members".*using \(public\.is_trip_member\(trip_id\)\)/s);
    expect(budgetMigration).toMatch(/create policy "daily_budget_overrides_insert_editors"/);
    expect(budgetMigration).toMatch(/create policy "daily_budget_overrides_update_editors"/);
    expect(budgetMigration).toMatch(/create policy "daily_budget_overrides_delete_editors"/);
  });

  it("validates wallet owners are active trip members", () => {
    expect(budgetMigration).toContain("create or replace function public.validate_wallet_membership()");
    expect(budgetMigration).toContain("public.is_active_trip_member(new.trip_id, new.user_id)");
    expect(budgetMigration).toContain("create trigger validate_wallet_membership");
  });
});

describe("finance CAS migration (Phase 2A)", () => {
  it("registers user_wallets and daily_budget_overrides in sync_cas_upsert", () => {
    expect(casMigration).toMatch(/when 'userWallet' then 'user_wallets'/);
    expect(casMigration).toMatch(/when 'dailyBudgetOverride' then 'daily_budget_overrides'/);
    expect(casMigration).toMatch(/update public\.user_wallets t set trip_id=\(p\.r\)\.trip_id, user_id=\(p\.r\)\.user_id, starting_balance=\(p\.r\)\.starting_balance, currency=\(p\.r\)\.currency/);
    expect(casMigration).toMatch(/update public\.daily_budget_overrides t set trip_id=\(p\.r\)\.trip_id, date=\(p\.r\)\.date, custom_budget_amount=\(p\.r\)\.custom_budget_amount/);
  });

  it("registers user_wallets and daily_budget_overrides in sync_cas_delete", () => {
    expect(casMigration).toMatch(/when 'userWallet' then 'user_wallets' when 'user_wallets' then 'user_wallets'/);
    expect(casMigration).toMatch(/when 'dailyBudgetOverride' then 'daily_budget_overrides' when 'daily_budget_overrides' then 'daily_budget_overrides'/);
    expect(casMigration).toMatch(/delete from public\.user_wallets where id=p_id and updated_at=p_base_updated_at/);
    expect(casMigration).toMatch(/delete from public\.daily_budget_overrides where id=p_id and updated_at=p_base_updated_at/);
  });

  it("extends the expenses CAS branch with the new columns", () => {
    expect(casMigration).toMatch(/update public\.expenses t set .*exchange_rate_to_base=\(p\.r\)\.exchange_rate_to_base/);
    expect(casMigration).toMatch(/update public\.expenses t set .*category_id=\(p\.r\)\.category_id/);
    expect(casMigration).toMatch(/update public\.expenses t set .*expense_date=\(p\.r\)\.expense_date/);
  });

  it("extends the expense_shares CAS branch with per-share split_type", () => {
    expect(casMigration).toMatch(/update public\.expense_shares t set expense_id=\(p\.r\)\.expense_id, user_id=\(p\.r\)\.user_id, share_amount=\(p\.r\)\.share_amount, share_percentage=\(p\.r\)\.share_percentage, split_type=\(p\.r\)\.split_type/);
  });
});

describe("finance planned-estimates migration (Phase 2B)", () => {
  it("adds an estimated cost column to activities", () => {
    expect(plannedMigration).toContain("alter table public.activities add column estimated_cost numeric(12, 2)");
  });

  it("includes estimated_cost in the activities CAS update branch", () => {
    expect(plannedMigration).toMatch(/update public\.activities t set .*estimated_cost=\(p\.r\)\.estimated_cost/);
  });

  it("still registers the finance entities in the recreated CAS function", () => {
    expect(plannedMigration).toMatch(/when 'userWallet' then 'user_wallets'/);
    expect(plannedMigration).toMatch(/when 'dailyBudgetOverride' then 'daily_budget_overrides'/);
  });
});
