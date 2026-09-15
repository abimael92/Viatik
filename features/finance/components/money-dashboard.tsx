"use client";

import {
  ArrowLeftRight,
  BedDouble,
  Car,
  Check,
  CircleDollarSign,
  Download,
  Landmark,
  Pencil,
  Plus,
  ShoppingBag,
  Ticket,
  UtensilsCrossed,
  UserRound,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SPENDING_CATEGORIES,
  SPENDING_CATEGORY_KEYS,
  SPENDING_CATEGORY_LABELS,
  type SpendingCategory,
} from "@/features/domain/categories";
import type { Trip, TripBudget, Expense } from "@/features/domain/entities";
import {
  decimalFromMinorUnits,
  formatMinorUnits,
  parseMinorUnits,
  type MinorUnits,
} from "@/features/domain/money";
import { ExpensePanel } from "@/features/expenses/components/expense-panel";
import { SettlementView } from "@/features/expenses/components/settlement-view";
import { useSettlement } from "@/features/expenses/lib/use-settlement";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { downloadExpensesCsv } from "@/features/expenses/lib/export-csv";
import { CurrencyConverter } from "@/features/finance/components/currency-converter";
import { TipSplitCalculator } from "@/features/finance/components/tip-calculator";
import { currencyRateRepository } from "@/features/finance/data/dexie-currency-rate-repository";
import { tripBudgetRepository } from "@/features/finance/data/dexie-finance-repository";
import { budgetUserCurrency, convertBudget, minorToInput, recommendedDailyBudget } from "@/features/finance/lib/budget-currency";
import { getBudgetUsage } from "@/features/finance/lib/finance-aggregators";
import {
  formatAmount,
  getTipCustoms,
  lookupRate,
  parseAmount,
} from "@/features/finance/lib/currency-converter";
import { useTripSpending } from "@/features/finance/lib/use-trip-spending";
import type { CurrencyCode } from "@/features/finance/domain/currency-types";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<SpendingCategory, typeof Wallet> = {
  transport: Car,
  stay: BedDouble,
  food: UtensilsCrossed,
  activities: Ticket,
  shopping: ShoppingBag,
  personal: UserRound,
};

type BudgetTone = "ok" | "warn" | "danger" | "muted";

/** Map a budget-usage ratio onto the progress-bar color state. */
function usageTone(usage: number | null): BudgetTone {
  if (usage === null) return "muted";
  if (usage >= 1) return "danger";
  if (usage >= 0.8) return "warn";
  return "ok";
}

const TONE_BAR: Record<BudgetTone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  danger: "bg-destructive",
  muted: "bg-muted",
};

const TONE_TEXT: Record<BudgetTone, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  danger: "text-destructive",
  muted: "text-muted-foreground",
};

const DAY_MS = 86_400_000;

/** Whole trip-day index for `today` relative to `start` (1-based, clamped ≥ 0). */
function dayNumber(start: string | null, today: string): number {
  if (!start) return 0;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(todayMs)) return 0;
  const diff = Math.floor((todayMs - startMs) / DAY_MS);
  return Math.max(0, diff) + 1;
}

interface PacingAlert {
  tone: "info" | "warn" | "danger";
  message: string;
}

/**
 * Budget tab of the money hub: total budget progress, inline configuration,
 * pacing alerts, plus the expense list and settlement. Currency + category
 * envelopes live on the Finance tab (`FinanceView`).
 *
 * Every total is derived from Dexie `liveQuery` subscriptions (via
 * `useTripSpending`), so it updates reactively and works fully offline.
 */
export function MoneyDashboard({
  tripId,
  userId,
  trip,
  days,
  canEdit,
  autoOpenExpense = false,
  autoOpenTools = false,
  onConsumeAutoOpenExpense,
}: {
  tripId: string;
  userId: string;
  trip: Trip;
  days: string[];
  canEdit: boolean;
  autoOpenExpense?: boolean;
  autoOpenTools?: boolean;
  onConsumeAutoOpenExpense?: () => void;
}) {
  const baseCurrency = trip.baseCurrency || "USD";
  // The trip's local/destination currency — used as the default for new expenses.
  const locationCurrency = useMemo(
    () => getTipCustoms(trip.destination).currencies[0] ?? baseCurrency,
    [trip.destination, baseCurrency]
  );

  const { budget, totalSpent } = useTripSpending(tripId, baseCurrency);
  const { balances } = useSettlement(tripId, baseCurrency);

  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(autoOpenTools);
  const [toolsTab, setToolsTab] = useState<"converter" | "tip">("converter");

  // Watch expenses for CSV export
  useEffect(() => expenseRepository.watchByTrip(tripId, setExpenses), [tripId]);

  // A budget of zero (or unset) means "no budget yet" — avoid treating a 0 cap
  // as a budget that is already exceeded.
  const totalBudget = budget?.totalBudgetMinor != null && budget.totalBudgetMinor > 0n ? budget.totalBudgetMinor : null;
  const dailyTarget = budget?.dailyTargetMinor != null && budget.dailyTargetMinor > 0n ? budget.dailyTargetMinor : null;
  const usage = useMemo(() => getBudgetUsage(totalSpent, totalBudget ?? 0n), [totalSpent, totalBudget]);
  const remaining = totalBudget !== null ? totalBudget - totalSpent : null;

  const pacingAlerts = useMemo<PacingAlert[]>(
    () => buildPacingAlerts(totalSpent, totalBudget, dailyTarget, trip.startDate, trip.endDate, baseCurrency),
    [totalSpent, totalBudget, dailyTarget, trip.startDate, trip.endDate, baseCurrency]
  );

  const budgetTone = usageTone(usage);
  const personalStanding = balances[userId] ?? 0n;

  return (
    <section className="space-y-6" aria-labelledby="budget-heading">
      <FinancialHero
        tripId={tripId}
        userId={userId}
        trip={trip}
        budget={budget}
        baseCurrency={baseCurrency}
        totalSpent={totalSpent}
        totalBudget={totalBudget}
        dailyTarget={dailyTarget}
        remaining={remaining}
        usage={usage}
        tone={budgetTone}
        pacingAlerts={pacingAlerts}
        days={days}
        canEdit={canEdit}
        personalStanding={personalStanding}
      />

      {/* Toolbar: money tools + primary action + export */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setToolsOpen(true)}>
            <Wrench className="size-4" />
            Money tools
          </Button>
          {expenses && expenses.length > 0 && (
            <Button
              variant="outline"
              onClick={() => downloadExpensesCsv(expenses.filter((e) => e.deletedAt === null))}
            >
              <Download className="size-4" />
              Export CSV
            </Button>
          )}
        </div>
        {canEdit && (
          <Button
            size="lg"
            variant="primary"
            className="gap-2 shadow-lg shadow-primary/25"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-5" />
            Add Expense
          </Button>
        )}
      </div>

      <section aria-labelledby="spending-feed-heading" className="space-y-3">
        <Heading level={3} id="spending-feed-heading" className="text-lg font-bold">
          Recent spending
        </Heading>
        <ExpensePanel
          tripId={tripId}
          userId={userId}
          currency={baseCurrency}
          locationCurrency={locationCurrency}
          canEdit={canEdit}
          embedded
          autoOpen={autoOpenExpense || addOpen}
          onAutoOpen={() => {
            setAddOpen(false);
            onConsumeAutoOpenExpense?.();
          }}
        />
      </section>

      <SettlementView tripId={tripId} userId={userId} currency={baseCurrency} />

      {/* Money tools modal */}
      <Dialog open={toolsOpen} onOpenChange={setToolsOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Money tools</DialogTitle>
            <DialogDescription>Convert currencies or split a tip.</DialogDescription>
          </DialogHeader>
          <div className="flex w-max rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setToolsTab("converter")}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
                toolsTab === "converter" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Currency converter
            </button>
            <button
              type="button"
              onClick={() => setToolsTab("tip")}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
                toolsTab === "tip" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Tip &amp; split calculator
            </button>
          </div>
          {toolsTab === "converter" ? <CurrencyConverter trip={trip} /> : <TipSplitCalculator trip={trip} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Financial hero: budget progress + quick stats + personal standing
// ---------------------------------------------------------------------------

function FinancialHero({
  tripId,
  userId,
  trip,
  budget,
  baseCurrency,
  totalSpent,
  totalBudget,
  dailyTarget,
  remaining,
  usage,
  tone,
  pacingAlerts,
  days,
  canEdit,
  personalStanding,
}: {
  tripId: string;
  userId: string;
  trip: Trip;
  budget: TripBudget | undefined;
  baseCurrency: string;
  totalSpent: MinorUnits;
  totalBudget: MinorUnits | null;
  dailyTarget: MinorUnits | null;
  remaining: MinorUnits | null;
  usage: number | null;
  tone: BudgetTone;
  pacingAlerts: PacingAlert[];
  days: string[];
  canEdit: boolean;
  personalStanding: MinorUnits;
}) {
  const [editing, setEditing] = useState(false);
  const [totalInput, setTotalInput] = useState("");
  const [dailyInput, setDailyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Swap the displayed "Trip spending" amount between the base and settings currency.
  const [swapped, setSwapped] = useState(false);

  // The budget is entered in the user's preferred currency (when supported and
  // different from the trip base), and stored converted into the base currency.
  const preferredCurrency = useLocalProfile(userId)?.preferredCurrency;
  const userCurrency = budgetUserCurrency(preferredCurrency, baseCurrency);
  const usesUserCurrency = userCurrency !== baseCurrency;

  // Small conversion toggle in the "Trip spending" header — shown when the
  // user's settings currency differs from the trip's location currency.
  const locationCurrency = useMemo(
    () => getTipCustoms(trip.destination).currencies[0] ?? baseCurrency,
    [trip.destination, baseCurrency]
  );
  const settingsCurrency = useLocalProfile(userId)?.preferredCurrency ?? null;
  const showConvertButton = settingsCurrency != null && settingsCurrency !== locationCurrency;
  // Currency the "Trip spending" amount is currently shown in (swappable).
  const displayCurrency = swapped && settingsCurrency ? settingsCurrency : baseCurrency;

  function beginEdit() {
    setTotalInput(
      totalBudget !== null
        ? minorToInput(convertBudget(totalBudget, baseCurrency, userCurrency), userCurrency)
        : ""
    );
    setDailyInput(dailyTarget !== null ? decimalFromMinorUnits(dailyTarget, baseCurrency) : "");
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const totalUser = totalInput.trim() ? parseAmount(totalInput, userCurrency) : 0n;
      const total = convertBudget(totalUser, userCurrency, baseCurrency);
      const daily = dailyInput.trim() ? parseMinorUnits(dailyInput, baseCurrency) : null;
      await tripBudgetRepository.upsert({
        id: budget?.id ?? crypto.randomUUID(),
        tripId,
        totalBudgetMinor: total,
        dailyTargetMinor: daily,
        categoryAllocations: budget?.categoryAllocations ?? [],
        createdBy: userId,
      });
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save budget.");
    } finally {
      setSaving(false);
    }
  }

  const pct = usage !== null ? Math.round(usage * 100) : null;
  const barWidth = pct !== null ? Math.min(100, pct) : 0;

  // Recommended daily pace: total budget spread across the trip days, leaving a
  // buffer so there's money left over at the end.
  const dayCount = days.length;
  const recommendedDaily = totalBudget !== null && dayCount > 0 ? recommendedDailyBudget(totalBudget, dayCount) : null;

  const standingDetail =
    personalStanding > 0n ? "You're owed" : personalStanding < 0n ? "You owe" : "Settled up";
  const standingTone: "ok" | "danger" | "muted" =
    personalStanding > 0n ? "ok" : personalStanding < 0n ? "danger" : "muted";

  return (
    <div className="relative overflow-hidden rounded-3xl border bg-linear-to-br from-primary/10 via-card to-card p-6 shadow-sm sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-viatik-magenta/10 blur-3xl"
      />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-muted-foreground">Trip spending</p>
            {showConvertButton && (
              <button
                type="button"
                aria-label="Swap currency"
                aria-pressed={swapped}
                onClick={() => setSwapped((value) => !value)}
                className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeftRight className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
          <p className="mt-1 font-mono text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
            {formatAmount(convertBudget(totalSpent, baseCurrency, displayCurrency), displayCurrency)}
            <span className="ml-2 text-sm font-medium text-muted-foreground">{displayCurrency}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalBudget !== null
              ? `of ${formatAmount(convertBudget(totalBudget, baseCurrency, displayCurrency), displayCurrency)} budget`
              : "(no budget set)"}
          </p>
        </div>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={beginEdit}>
            <Pencil className="size-4" /> Edit budget
          </Button>
        )}
      </div>

      <div className="relative mt-5 h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full transition-all", TONE_BAR[tone])} style={{ width: `${barWidth}%` }} />
      </div>
      <div className="relative mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>{pct !== null ? `${pct}% used` : "No budget set"}</span>
        {remaining !== null && (
          <span className={cn("font-semibold", TONE_TEXT[tone])}>
            {remaining >= 0n ? "Left: " : "Over: "}
            {formatMinorUnits(remaining < 0n ? -remaining : remaining, baseCurrency)}
          </span>
        )}
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <HeroStat
          label="Your standing"
          value={formatMinorUnits(personalStanding < 0n ? -personalStanding : personalStanding, baseCurrency)}
          detail={standingDetail}
          tone={standingTone}
        />
        <HeroStat
          label={dailyTarget !== null ? "Daily target" : "Trip days"}
          value={dailyTarget !== null ? `${formatMinorUnits(dailyTarget, baseCurrency)}/day` : String(dayCount)}
        />
      </div>

      {editing && (
        <div className="relative mt-5 space-y-3 rounded-2xl border bg-card/80 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="budget-total">Total trip budget ({userCurrency})</Label>
            <Input
              id="budget-total"
              inputMode="decimal"
              value={totalInput}
              onChange={(event) => setTotalInput(event.target.value)}
              placeholder="e.g. 2000.00"
            />
            {usesUserCurrency && totalInput.trim() && totalInput.trim() !== "." && (
              <BudgetConversion
                input={totalInput}
                from={userCurrency}
                to={baseCurrency}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget-daily">Daily spending target ({baseCurrency}) · optional</Label>
            <Input
              id="budget-daily"
              inputMode="decimal"
              value={dailyInput}
              onChange={(event) => setDailyInput(event.target.value)}
              placeholder="e.g. 150.00"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to pace spending from your total over the trip duration.
            </p>
            {recommendedDaily !== null ? (
              <p className="text-xs text-primary">
                Recommended: <span className="font-semibold">{formatMinorUnits(recommendedDaily, baseCurrency)}</span>/day
                {" "}— keeps ~10% of your {formatMinorUnits(totalBudget!, baseCurrency)} budget as a buffer over {dayCount} day{dayCount === 1 ? "" : "s"}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Set a total budget to see a recommended daily amount.
              </p>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving…" : "Save budget"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {pacingAlerts.length > 0 && (
        <ul className="relative mt-4 space-y-2">
          {pacingAlerts.map((alert, index) => (
            <li
              key={index}
              className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
                alert.tone === "danger" && "bg-destructive/10 text-destructive",
                alert.tone === "warn" && "bg-amber-500/10 text-amber-700",
                alert.tone === "info" && "bg-muted text-muted-foreground"
              )}
            >
              <CircleDollarSign className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{alert.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BudgetConversion({ input, from, to }: { input: string; from: string; to: string }) {
  const converted = useMemo(() => {
    try {
      return convertBudget(parseAmount(input, from), from, to);
    } catch {
      return null;
    }
  }, [input, from, to]);
  if (converted === null) return null;
  return (
    <p className="text-xs text-muted-foreground">
      ≈ {formatAmount(converted, to)} in {to}
    </p>
  );
}

function HeroStat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "ok" | "danger" | "muted";
}) {
  return (
    <div className="rounded-2xl border bg-card/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold tabular-nums">{value}</p>
      {detail && (
        <p
          className={cn(
            "text-xs",
            tone === "danger" ? "text-destructive" : tone === "ok" ? "text-success" : "text-muted-foreground"
          )}
        >
          {detail}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Currency & exchange-rate card
// ---------------------------------------------------------------------------

export function CurrencyCard({
  trip,
  baseCurrency,
}: {
  trip: Trip;
  baseCurrency: string;
}) {
  const customs = useMemo(() => getTipCustoms(trip.destination), [trip.destination]);
  const nativeCurrency = (customs.currencies[0] ?? baseCurrency).toUpperCase() as CurrencyCode;
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (nativeCurrency === baseCurrency.toUpperCase()) {
        if (!cancelled) setRate(1);
        return;
      }
      const cached = await currencyRateRepository.getRate(nativeCurrency, baseCurrency);
      if (cancelled) return;
      setRate(cached?.rate ?? (safeLookupRate(nativeCurrency, baseCurrency) ?? null));
    })();
    return () => {
      cancelled = true;
    };
  }, [nativeCurrency, baseCurrency]);

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Landmark className="size-5 text-primary" /> Trip currency &amp; rate
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-2xl" aria-hidden>
          {customs.flag}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {trip.destination ? `In ${trip.destination}` : customs.destination}
          </p>
          <p className="text-sm text-muted-foreground">
            {nativeCurrency === baseCurrency.toUpperCase() ? (
              "Local currency matches your home base"
            ) : (
              <>
                1 {nativeCurrency} <span className="text-muted-foreground">(local)</span> ={" "}
                <span className="font-mono font-semibold text-foreground tabular-nums">
                  {rate !== null ? formatRate(rate) : "—"}
                </span>{" "}
                {baseCurrency.toUpperCase()} <span className="text-muted-foreground">(your currency)</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="default">Tip in {trip.destination || customs.destination}: {customs.expectedTip}</Badge>
        <Badge variant={customs.serviceIncluded ? "success" : "muted"}>
          {customs.serviceIncluded ? "Service included" : "Service not included"}
        </Badge>
      </div>
      <p className="mt-3 text-sm text-card-foreground">{customs.tipGuide}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category envelopes (used on the Finance tab)
// ---------------------------------------------------------------------------

/** Grid of category envelope cards, self-contained via `useTripSpending`. */
export function CategoryEnvelopes({
  tripId,
  userId,
  baseCurrency,
  canEdit,
}: {
  tripId: string;
  userId: string;
  baseCurrency: string;
  canEdit: boolean;
}) {
  const { budget, categoryTotals, allocations } = useTripSpending(tripId, baseCurrency);

  return (
    <section aria-labelledby="envelopes-heading" className="space-y-3">
      <div>
        <Heading level={3} id="envelopes-heading" className="text-lg font-bold">
          Category envelopes
        </Heading>
        <p className="text-sm text-muted-foreground">
          How much you have spent in each category against its cap.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SPENDING_CATEGORY_KEYS.map((category) => (
          <CategoryEnvelope
            key={category}
            category={category}
            spent={categoryTotals.get(category) ?? 0n}
            allocated={allocations.get(category) ?? null}
            baseCurrency={baseCurrency}
            canEdit={canEdit}
            onSetCap={(amountMinor) => setCategoryCap(tripId, budget, category, amountMinor, userId)}
          />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Category envelope card
// ---------------------------------------------------------------------------

function CategoryEnvelope({
  category,
  spent,
  allocated,
  baseCurrency,
  canEdit,
  onSetCap,
}: {
  category: SpendingCategory;
  spent: MinorUnits;
  allocated: MinorUnits | null;
  baseCurrency: string;
  canEdit: boolean;
  onSetCap: (amountMinor: MinorUnits) => void;
}) {
  const Icon = CATEGORY_ICONS[category];
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const usage = getBudgetUsage(spent, allocated ?? 0n);
  const tone = usageTone(usage);
  const barWidth = usage !== null ? Math.min(100, Math.round(usage * 100)) : 0;

  function beginEdit() {
    setInput(allocated !== null ? decimalFromMinorUnits(allocated, baseCurrency) : "");
    setError(null);
    setEditing(true);
  }

  function handleSave() {
    try {
      onSetCap(input.trim() ? parseMinorUnits(input, baseCurrency) : 0n);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid amount.");
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold">{SPENDING_CATEGORY_LABELS[category]}</p>
            <p className="font-mono text-sm font-bold tabular-nums">
              {formatMinorUnits(spent, baseCurrency)}
              <span className="font-normal text-muted-foreground">
                {allocated !== null ? ` / ${formatMinorUnits(allocated, baseCurrency)}` : ""}
              </span>
            </p>
          </div>
        </div>
        {canEdit && !editing && (
          <Button variant="ghost" size="icon" aria-label={`Set ${SPENDING_CATEGORY_LABELS[category]} cap`} onClick={beginEdit}>
            <Pencil className="size-4" />
          </Button>
        )}
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full transition-all", TONE_BAR[tone])} style={{ width: `${barWidth}%` }} />
      </div>

      <p className={cn("mt-1.5 text-xs", allocated === null ? "text-muted-foreground" : TONE_TEXT[tone])}>
        {allocated === null
          ? "No cap set"
          : usage !== null && usage >= 1
            ? "Cap exceeded"
            : `${SPENDING_CATEGORIES[category].length} subcategories`}
      </p>

      {editing && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <div className="space-y-1">
            <Label htmlFor={`cap-${category}`}>Cap ({baseCurrency})</Label>
            <Input
              id={`cap-${category}`}
              inputMode="decimal"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="0.00"
            />
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={handleSave}><Check className="size-4" /> Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="size-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pacing alerts
// ---------------------------------------------------------------------------

function buildPacingAlerts(
  totalSpent: MinorUnits,
  totalBudget: MinorUnits | null,
  dailyTarget: MinorUnits | null,
  startDate: string | null,
  endDate: string | null,
  baseCurrency: string
): PacingAlert[] {
  const alerts: PacingAlert[] = [];

  if (totalBudget === null) {
    alerts.push({ tone: "warn", message: "No budget set — add a total trip budget to track planned versus spent." });
    return alerts;
  }

  const remaining = totalBudget - totalSpent;
  const usage = getBudgetUsage(totalSpent, totalBudget);

  if (remaining < 0n) {
    alerts.push({ tone: "danger", message: `You're over budget by ${formatMinorUnits(-remaining, baseCurrency)}.` });
  } else if (usage !== null && usage >= 0.8) {
    alerts.push({ tone: "warn", message: `Close to budget — ${formatMinorUnits(remaining, baseCurrency)} left.` });
  }

  if (dailyTarget !== null && startDate && endDate) {
    const today = new Date().toISOString().slice(0, 10);
    const totalDays = Math.max(1, dayNumber(startDate, endDate));
    const elapsedDays = Math.min(Math.max(0, dayNumber(startDate, today)), totalDays);
    if (elapsedDays >= 1) {
      const expected = dailyTarget * BigInt(elapsedDays);
      const diff = totalSpent - expected;
      if (diff > 0n) {
        alerts.push({
          tone: "warn",
          message: `Over daily pace by ${formatMinorUnits(diff, baseCurrency)} — expected ${formatMinorUnits(expected, baseCurrency)} by day ${elapsedDays}.`,
        });
      }
    }
  }

  return alerts;
}

/** Resolve a native→base rate, tolerating unknown currencies (returns null). */
function safeLookupRate(from: CurrencyCode, to: string): number | null {
  try {
    return lookupRate(from, to.toUpperCase() as CurrencyCode);
  } catch {
    return null;
  }
}

function formatRate(rate: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(rate);
}

/** Update a single category's allocation cap on the unified trip budget. */
async function setCategoryCap(
  tripId: string,
  budget: TripBudget | undefined,
  category: SpendingCategory,
  amountMinor: MinorUnits,
  userId: string
): Promise<void> {
  const next = [...(budget?.categoryAllocations ?? [])].filter((allocation) => allocation.category !== category);
  next.push({ category, allocationMinor: amountMinor, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (budget) {
    await tripBudgetRepository.update(budget.id, { categoryAllocations: next });
  } else {
    await tripBudgetRepository.upsert({
      id: crypto.randomUUID(),
      tripId,
      totalBudgetMinor: 0n,
      dailyTargetMinor: null,
      categoryAllocations: next,
      createdBy: userId,
    });
  }
}
