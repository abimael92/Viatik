"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  PiggyBank,
  ReceiptText,
  Scale,
  Target,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import type { Activity, Expense, ExpenseShare, Trip, TripBudget, TripMember, UserWallet } from "@/features/domain/entities";
import { decimalFromMinorUnits, formatMinorUnits, getCurrencyExponent, parseMinorUnits, type MinorUnits } from "@/features/domain/money";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { tripBudgetRepository, userWalletRepository } from "@/features/finance/data/dexie-finance-repository";
import {
  getDailyPacing,
  getGroupTotalSpent,
  getPersonalLeftover,
  getPersonalPlanned,
  getPersonalTotalSpent,
  getPlannedTotal,
  getTrueLeftover,
  type AggregateExpense,
  type DailyPacing,
} from "@/features/finance/lib/finance-aggregators";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

export function FinanceDashboard({
  tripId,
  userId,
  trip,
  days,
  canEdit,
}: {
  tripId: string;
  userId: string;
  trip: Trip;
  days: string[];
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"personal" | "group">("personal");
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [sharesByExpense, setSharesByExpense] = useState<Record<string, ExpenseShare[]>>({});
  const [activities, setActivities] = useState<Activity[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [wallets, setWallets] = useState<UserWallet[]>([]);
  const [budget, setBudget] = useState<TripBudget | undefined>(undefined);

  useEffect(() => expenseRepository.watchByTrip(tripId, setExpenses), [tripId]);
  useEffect(() => activityRepository.watchByTrip(tripId, setActivities), [tripId]);
  useEffect(() => collaborationRepository.watchMembers(tripId, setMembers), [tripId]);
  useEffect(() => userWalletRepository.watchByTrip(tripId, setWallets), [tripId]);
  useEffect(() => tripBudgetRepository.watchByTrip(tripId, setBudget), [tripId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      (expenses ?? []).map(async (expense) => [expense.id, await expenseRepository.listSharesByExpense(expense.id)] as const)
    )
      .then((pairs) => {
        if (!cancelled) setSharesByExpense(Object.fromEntries(pairs));
      })
      .catch(() => {
        if (!cancelled) setSharesByExpense({});
      });
    return () => {
      cancelled = true;
    };
  }, [expenses]);

  const aggregateExpenses: AggregateExpense[] = useMemo(
    () =>
      (expenses ?? [])
        .filter((expense) => expense.deletedAt === null)
        .map((expense) => ({
          amountMinor: expense.amountMinor,
          currency: expense.currency,
          exchangeRateToBase: expense.exchangeRateToBase,
          paidBy: expense.paidBy,
          date: expense.date,
          shares: (sharesByExpense[expense.id] ?? []).map((share) => ({ userId: share.userId, shareAmountMinor: share.shareAmountMinor })),
        })),
    [expenses, sharesByExpense]
  );

  const baseCurrency = trip.baseCurrency;
  const today = new Date().toISOString().slice(0, 10);
  const dayCount = days.length || 1;
  // The unified budget's optional daily target takes precedence over the total
  // derived per-day pace (total ÷ trip days).
  const dayBudget = budget?.dailyTargetMinor ?? (budget?.totalBudgetMinor != null ? budget.totalBudgetMinor / BigInt(dayCount) : 0n);
  const memberCount = members.length || 1;

  const groupTotal = useMemo(() => getGroupTotalSpent(aggregateExpenses, baseCurrency), [aggregateExpenses, baseCurrency]);
  const plannedTotal = useMemo(() => getPlannedTotal(activities, today), [activities, today]);
  const personalSpent = useMemo(() => getPersonalTotalSpent(aggregateExpenses, userId, baseCurrency), [aggregateExpenses, userId, baseCurrency]);
  const personalPlanned = useMemo(() => getPersonalPlanned(activities, today, memberCount), [activities, today, memberCount]);
  const wallet = wallets.find((w) => w.userId === userId);
  const leftover = wallet ? getPersonalLeftover(wallet, personalSpent) : null;
  const trueLeftover = wallet ? getTrueLeftover(wallet, personalSpent, personalPlanned) : null;

  const pacing = useMemo(
    () => days.map((date) => getDailyPacing(date, aggregateExpenses, dayBudget, null, baseCurrency)),
    [days, aggregateExpenses, dayBudget, baseCurrency]
  );

  const spentDays = pacing.filter((p) => p.spent > 0n).length;
  const totalBudget = budget?.totalBudgetMinor ?? null;

  return (
    <section className="space-y-6" aria-labelledby="finance-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="finance-heading" className="text-2xl font-bold">{t("common.finance")}</h2>
          <p className="text-muted-foreground">{t("common.financeDescription")}</p>
        </div>
        <div className="flex rounded-full border border-border bg-muted p-1" role="tablist" aria-label={t("common.financeView")}>
          {(["personal", "group"] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {key === "personal" ? t("common.myFinances") : t("common.groupFinances")}
            </button>
          ))}
        </div>
      </div>

      {view === "personal" ? (
        <PersonalView
          tripId={tripId}
          userId={userId}
          wallet={wallet}
          baseCurrency={baseCurrency}
          personalSpent={personalSpent}
          personalPlanned={personalPlanned}
          leftover={leftover}
          trueLeftover={trueLeftover}
          canEdit={canEdit}
        />
      ) : (
        <GroupView
          baseCurrency={baseCurrency}
          groupTotal={groupTotal}
          plannedTotal={plannedTotal}
          totalBudget={totalBudget}
          pacing={pacing}
          spentDays={spentDays}
          tripDays={days.length}
        />
      )}

      {expenses === null && <div className="h-32 animate-pulse rounded-2xl bg-muted" />}
    </section>
  );
}

function PersonalView({
  tripId,
  userId,
  wallet,
  baseCurrency,
  personalSpent,
  personalPlanned,
  leftover,
  trueLeftover,
  canEdit,
}: {
  tripId: string;
  userId: string;
  wallet: UserWallet | undefined;
  baseCurrency: string;
  personalSpent: MinorUnits;
  personalPlanned: MinorUnits;
  leftover: MinorUnits | null;
  trueLeftover: MinorUnits | null;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data = new FormData(event.currentTarget);
      const startingBalanceMinor = parseMinorUnits(String(data.get("startingBalance")), baseCurrency);
      if (wallet) {
        await userWalletRepository.update(wallet.id, { startingBalanceMinor });
      } else {
        await userWalletRepository.upsert({ id: crypto.randomUUID(), tripId, userId, startingBalanceMinor, currency: baseCurrency });
      }
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.unableSaveWallet"));
    } finally {
      setSaving(false);
    }
  }

  const walletAmount = wallet?.startingBalanceMinor ?? 0n;
  const walletCurrency = wallet?.currency ?? baseCurrency;
  const hasWallet = wallet !== undefined;
  const tl = trueLeftover;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground sm:col-span-2 xl:col-span-4">
        <p className="font-semibold text-foreground">What you see here</p>
        <p className="mt-1">
          <span className="font-medium text-foreground">Starting balance</span> is the cash you set aside for this trip.{" "}
          <span className="font-medium text-foreground">Actuals (settled)</span> is your share of expenses already recorded.{" "}
          <span className="font-medium text-foreground">Planned (estimates)</span> is your equal share of upcoming itinerary costs.{" "}
          <span className="font-medium text-foreground">True Leftover</span> = starting balance − actuals − planned — the honest amount you can still spend.
        </p>
      </div>
      <div className="rounded-2xl border bg-card p-5 xl:col-span-2 xl:row-span-2 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"><PiggyBank className="size-5 text-primary" /> True Leftover</span>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", tl != null && tl >= 0n ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
            {tl != null ? (tl >= 0n ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />) : null}
            {tl == null ? t("common.noWallet") : tl >= 0n ? t("common.safe") : t("common.over")}
          </span>
        </div>
        <div className="my-6">
          <p className="font-mono text-4xl font-bold tabular-nums tracking-tight">
            {tl != null ? formatMinorUnits(tl < 0n ? -tl : tl, walletCurrency) : "—"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {tl == null
              ? t("common.setStartingBalance")
              : tl >= 0n
                ? t("common.remainingAfter")
                : t("common.exceededBudget")}
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <BreakdownRow label={t("common.startingBalance")} value={formatMinorUnits(walletAmount, walletCurrency)} />
          <BreakdownRow label={t("common.actualsSettled")} value={`− ${formatMinorUnits(personalSpent, baseCurrency)}`} accent="text-destructive" />
          <BreakdownRow label={t("common.plannedEstimates")} value={`− ${formatMinorUnits(personalPlanned, baseCurrency)}`} accent="text-destructive" />
        </div>
      </div>

      <FinanceCard icon={Wallet} label={t("common.wallet")} accent>
        <p className="font-mono text-2xl font-bold tabular-nums">{formatMinorUnits(walletAmount, walletCurrency)}</p>
        <p className="text-xs text-muted-foreground">{walletCurrency} starting balance</p>
        {canEdit && (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing((v) => !v)}>
            {hasWallet ? t("common.editBalance") : t("common.setBalance")}
          </Button>
        )}
      </FinanceCard>

      <FinanceCard icon={ReceiptText} label={t("common.actualsSpent")}>
        <p className="font-mono text-2xl font-bold tabular-nums">{formatMinorUnits(personalSpent, baseCurrency)}</p>
        <p className="text-xs text-muted-foreground">Your share of settled expenses</p>
      </FinanceCard>

      <FinanceCard icon={Target} label={t("common.plannedEstimates")}>
        <p className="font-mono text-2xl font-bold tabular-nums">{formatMinorUnits(personalPlanned, baseCurrency)}</p>
        <p className="text-xs text-muted-foreground">Your equal share of upcoming estimates</p>
      </FinanceCard>

      <FinanceCard icon={Scale} label={t("common.leftoverActuals")}>
        <p className={cn("font-mono text-2xl font-bold tabular-nums", leftover != null && leftover < 0n ? "text-destructive" : "")}>
          {leftover != null ? formatMinorUnits(leftover < 0n ? -leftover : leftover, walletCurrency) : "—"}
        </p>
        <p className="text-xs text-muted-foreground">Starting balance minus actuals</p>
      </FinanceCard>

      {editing && (
        <form onSubmit={handleSave} className="rounded-2xl border bg-card p-5 xl:col-span-2">
          <Label htmlFor="startingBalance">Starting balance ({walletCurrency})</Label>
          <div className="mt-2 flex gap-2">
            <Input
              id="startingBalance"
              name="startingBalance"
              type="number"
              min={getCurrencyExponent(walletCurrency) === 0 ? "0" : "0.00"}
              step={getCurrencyExponent(walletCurrency) === 0 ? "1" : `0.${"0".repeat(getCurrencyExponent(walletCurrency) - 1)}1`}
              defaultValue={hasWallet ? decimalFromMinorUnits(walletAmount, walletCurrency) : ""}
              required
            />
            <Button type="submit" disabled={saving}>{saving ? t("settings.saving") : t("common.save")}</Button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        </form>
      )}
    </div>
  );
}

function GroupView({
  baseCurrency,
  groupTotal,
  plannedTotal,
  totalBudget,
  pacing,
  spentDays,
  tripDays,
}: {
  baseCurrency: string;
  groupTotal: MinorUnits;
  plannedTotal: MinorUnits;
  totalBudget: MinorUnits | null;
  pacing: DailyPacing[];
  spentDays: number;
  tripDays: number;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);

  const budgetUsed = totalBudget != null && totalBudget > 0n ? Math.round(Number((groupTotal * 1000n) / totalBudget)) / 10 : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border bg-card p-5 xl:col-span-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"><CircleDollarSign className="size-5 text-primary" /> Group total spent</span>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums">{formatMinorUnits(groupTotal, baseCurrency)}</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", budgetUsed != null && budgetUsed > 100 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, budgetUsed ?? 0)}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">{totalBudget != null ? t("common.percentBudget", { percent: budgetUsed ?? 0 }) : t("common.noBudget")}</span>
          </div>
        </div>

        <FinanceCard icon={Target} label={t("common.plannedEstimates")}>
          <p className="font-mono text-2xl font-bold tabular-nums">{formatMinorUnits(plannedTotal, baseCurrency)}</p>
          <p className="text-xs text-muted-foreground">Upcoming itinerary costs</p>
        </FinanceCard>

        <FinanceCard icon={CalendarDays} label={t("common.daysActive")}>
          <p className="font-mono text-2xl font-bold tabular-nums">{spentDays}<span className="text-base font-normal text-muted-foreground"> / {tripDays}</span></p>
          <p className="text-xs text-muted-foreground">Days with recorded expenses</p>
        </FinanceCard>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b p-4">
          <h3 className="font-semibold">Daily pacing</h3>
          <p className="text-sm text-muted-foreground">Tap a day to see its spent/budget breakdown.</p>
        </div>
        <div className="divide-y">
          {pacing.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Set trip dates to see daily pacing.</div>}
          {pacing.map((p) => {
            const open = expanded === p.date;
            return (
              <PacingRow
                key={p.date}
                pacing={p}
                open={open}
                onToggle={() => setExpanded(open ? null : p.date)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PacingRow({
  pacing,
  open,
  onToggle,
}: {
  pacing: DailyPacing;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const statusStyles: Record<DailyPacing["status"], string> = {
    under: "bg-success/10 text-success",
    over: "bg-destructive/10 text-destructive",
    at: "bg-muted text-muted-foreground",
  };
  const statusLabel: Record<DailyPacing["status"], string> = { under: t("common.under"), over: t("common.over"), at: t("common.onBudget") };

  return (
    <div>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="size-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{formatDate(pacing.date)}</span>
          <span className="block text-xs text-muted-foreground">
            {formatMinorUnits(pacing.spent, pacing.currency)} spent of {formatMinorUnits(pacing.budget, pacing.currency)}
          </span>
        </span>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", statusStyles[pacing.status])}>{statusLabel[pacing.status]}</span>
        <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t px-4 py-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <MiniStat label={t("common.spent")} value={formatMinorUnits(pacing.spent, pacing.currency)} />
            <MiniStat label={t("common.budget")} value={formatMinorUnits(pacing.budget, pacing.currency)} />
            <MiniStat label={t("common.remaining")} value={formatMinorUnits(pacing.remaining, pacing.currency)} />
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function FinanceCard({ icon: Icon, label, children, accent }: { icon: typeof Wallet; label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Icon className={cn("size-5", accent ? "text-primary" : "text-muted-foreground")} /> {label}
      </span>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function BreakdownRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t pt-2 first:border-t-0 first:pt-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono tabular-nums", accent)}>{value}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Compact summary strip for the trip Overview. Keeps the dashboard's live
// queries but renders a minimal, at-a-glance snapshot. Group data only.
// ---------------------------------------------------------------------------

export function FinanceSummaryStrip({ tripId, userId, baseCurrency }: { tripId: string; userId: string; baseCurrency: string }) {
  const { t } = useI18n();
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [sharesByExpense, setSharesByExpense] = useState<Record<string, ExpenseShare[]>>({});
  const [wallets, setWallets] = useState<UserWallet[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);

  useEffect(() => expenseRepository.watchByTrip(tripId, setExpenses), [tripId]);
  useEffect(() => userWalletRepository.watchByTrip(tripId, setWallets), [tripId]);
  useEffect(() => activityRepository.watchByTrip(tripId, setActivities), [tripId]);
  useEffect(() => collaborationRepository.watchMembers(tripId, setMembers), [tripId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all((expenses ?? []).map(async (e) => [e.id, await expenseRepository.listSharesByExpense(e.id)] as const))
      .then((pairs) => !cancelled && setSharesByExpense(Object.fromEntries(pairs)))
      .catch(() => !cancelled && setSharesByExpense({}));
    return () => { cancelled = true; };
  }, [expenses]);

  const aggregateExpenses: AggregateExpense[] = useMemo(
    () =>
      (expenses ?? [])
        .filter((e) => e.deletedAt === null)
        .map((e) => ({
          amountMinor: e.amountMinor,
          currency: e.currency,
          exchangeRateToBase: e.exchangeRateToBase,
          paidBy: e.paidBy,
          date: e.date,
          shares: (sharesByExpense[e.id] ?? []).map((s) => ({ userId: s.userId, shareAmountMinor: s.shareAmountMinor })),
        })),
    [expenses, sharesByExpense]
  );

  const memberCount = members.length || 1;
  const groupTotal = useMemo(() => getGroupTotalSpent(aggregateExpenses, baseCurrency), [aggregateExpenses, baseCurrency]);
  const personalSpent = useMemo(() => getPersonalTotalSpent(aggregateExpenses, userId, baseCurrency), [aggregateExpenses, userId, baseCurrency]);
  const personalPlanned = useMemo(() => getPersonalPlanned(activities, new Date().toISOString().slice(0, 10), memberCount), [activities, memberCount]);
  const wallet = wallets.find((w) => w.userId === userId);
  const trueLeftover = wallet ? getTrueLeftover(wallet, personalSpent, personalPlanned) : null;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <MiniTile label={t("common.groupSpent")} value={formatMinorUnits(groupTotal, baseCurrency)} icon={CircleDollarSign} />
      <MiniTile label={t("common.trueLeftover")} value={trueLeftover != null ? formatMinorUnits(trueLeftover < 0n ? -trueLeftover : trueLeftover, wallet?.currency ?? baseCurrency) : "—"} icon={PiggyBank} tone={trueLeftover != null && trueLeftover < 0n ? "danger" : trueLeftover != null ? "good" : "muted"} />
      <MiniTile label={t("common.plannedUpcoming")} value={formatMinorUnits(personalPlanned, baseCurrency)} icon={Target} />
    </div>
  );
}

function MiniTile({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Wallet; tone?: "good" | "danger" | "muted" }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className={cn("truncate font-mono text-sm font-semibold tabular-nums", tone === "danger" ? "text-destructive" : tone === "good" ? "text-success" : "")}>{value}</p>
      </div>
    </div>
  );
}
