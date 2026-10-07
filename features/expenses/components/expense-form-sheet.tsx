"use client";

import { localizeThrownError } from "@/lib/i18n/localize-error";
import { validatePositiveAmount } from "@/lib/validation/common";

import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentProps, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { fetchExchangeRate } from "@/app/actions/exchange-rates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import {
  contactRepository,
  tripTravelerRepository,
} from "@/features/contacts/data/dexie-contact-repository";
import type {
  Expense,
  ExpenseLineItem,
  ExpenseSplitType,
  ProfileSummary,
  TripMember,
  TripTraveler,
} from "@/features/domain/entities";
import {
  SPENDING_CATEGORIES,
  SPENDING_CATEGORY_LABELS,
  SPENDING_CATEGORY_KEYS,
  SPENDING_SUBCATEGORY_LABELS,
  type SpendingCategory,
  type SpendingSubcategory,
} from "@/features/domain/categories";
import {
  decimalFromMinorUnits,
  formatMinorUnits,
  getCurrencyExponent,
  parseMinorUnits,
  toBaseMinorUnits,
} from "@/features/domain/money";
import {
  resolveExchangeRate,
  type ResolvedExchangeRate,
} from "@/features/finance/lib/exchange-rate-service";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { calculateSplit } from "@/features/expenses/lib/expense-calculator";
import { allocateExpenseItem, summarizeExpenseLineItems } from "@/features/expenses/lib/expense-items";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

type ExpenseEntryMode = "simple" | "itemized";

type ExpenseLineItemDraft = {
  id: string;
  description: string;
  amountInput: string;
  splitType: "equal" | "exact";
  participants: string[];
  exactInputs: Record<string, string>;
};

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "MXN"] as const;

function emptyLineItemDraft(userId: string, id = crypto.randomUUID()): ExpenseLineItemDraft {
  return {
    id,
    description: "",
    amountInput: "",
    splitType: "equal",
    participants: [userId],
    exactInputs: {},
  };
}

function lineItemToDraft(item: ExpenseLineItem, currency: string): ExpenseLineItemDraft {
  return {
    id: item.id,
    description: item.description,
    amountInput: decimalFromMinorUnits(item.amountMinor, currency),
    splitType: item.splitType,
    participants: item.allocations.map((allocation) => allocation.userId),
    exactInputs: Object.fromEntries(
      item.allocations.map((allocation) => [
        allocation.userId,
        decimalFromMinorUnits(allocation.shareAmountMinor, currency),
      ]),
    ),
  };
}

function totalLineItemAmounts(items: ExpenseLineItemDraft[], currency: string): bigint | null {
  try {
    return items.reduce(
      (total, item) => total + (item.amountInput.trim() ? parseMinorUnits(item.amountInput, currency) : 0n),
      0n,
    );
  } catch {
    return null;
  }
}

export type ExpenseFormInitialData = {
  activityId?: string | null;
  description?: string;
  date?: string;
  category?: SpendingCategory | null;
};

export function ExpenseFormSheet({
  open,
  expense,
  tripId,
  userId,
  currency,
  locationCurrency,
  defaultCurrency,
  initialData,
  onClose,
  onError,
  onSaved,
}: {
  open: boolean;
  expense?: Expense;
  tripId: string;
  userId: string;
  currency: string;
  locationCurrency?: string;
  defaultCurrency?: string;
  initialData?: ExpenseFormInitialData;
  onClose: () => void;
  onError: (message: string) => void;
  onSaved?: (expense: Expense) => void;
}) {
  const localProfile = useLocalProfile(userId);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [travelers, setTravelers] = useState<TripTraveler[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);

  useEffect(() => {
    if (!open) return;
    return collaborationRepository.watchMembers(tripId, setMembers);
  }, [open, tripId]);
  useEffect(() => {
    if (!open) return;
    return tripTravelerRepository.watch(tripId, setTravelers);
  }, [open, tripId]);
  useEffect(() => {
    if (!open) return;
    const memberIds = [
      ...new Set(members.map((member) => member.userId).filter((id): id is string => Boolean(id))),
    ];
    if (memberIds.length === 0) return;
    let cancelled = false;
    void collaborationRepository
      .listProfiles(memberIds)
      .then((nextProfiles) => {
        if (!cancelled) setProfiles(nextProfiles);
      })
      .catch(() => {
        if (!cancelled) setProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, members]);

  const names = useMemo(() => {
    const next = new Map(
      profiles.map((profile) => [profile.id, profile.fullName?.trim() || "Traveler"]),
    );
    if (localProfile) next.set(userId, localProfile.fullName?.trim() || "Traveler");
    return next;
  }, [localProfile, profiles, userId]);

  return (
    <ExpenseFormBody
      open={open}
      expense={expense}
      tripId={tripId}
      userId={userId}
      currency={currency}
      locationCurrency={locationCurrency}
      defaultCurrency={defaultCurrency}
      members={members}
      travelers={travelers}
      names={names}
      initialData={initialData}
      onClose={onClose}
      onError={onError}
      onSaved={onSaved}
    />
  );
}

function ExpenseFormBody({
  open,
  expense,
  tripId,
  userId,
  currency,
  locationCurrency,
  defaultCurrency,
  members,
  travelers,
  names,
  initialData,
  onClose,
  onError,
  onSaved,
}: {
  open: boolean;
  expense?: Expense;
  tripId: string;
  userId: string;
  currency: string;
  locationCurrency?: string;
  defaultCurrency?: string;
  members: TripMember[];
  travelers: TripTraveler[];
  names: Map<string, string>;
  initialData?: ExpenseFormInitialData;
  onClose: () => void;
  onError: (message: string) => void;
  onSaved?: (expense: Expense) => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [resolvedRate, setResolvedRate] = useState<{
    from: string;
    to: string;
    rate: ResolvedExchangeRate;
  } | null>(null);
  const [mode, setMode] = useState<ExpenseSplitType>(expense?.splitType ?? "equal");
  const [participantSelection, setParticipants] = useState<string[] | null>(null);
  const [extraPeople, setExtraPeople] = useState<string[]>([]);
  const [addedTravelers, setAddedTravelers] = useState<TripTraveler[]>([]);
  const [quickAddName, setQuickAddName] = useState("");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [shareInputs, setShareInputs] = useState<Map<string, string>>(new Map());
  const [shareCounts, setShareCounts] = useState<Record<string, string>>({});
  const fallbackCurrency: string =
    defaultCurrency ??
    ((CURRENCIES as readonly string[]).includes(locationCurrency ?? "")
      ? (locationCurrency ?? currency)
      : currency);
  const [expenseCurrency, setExpenseCurrency] = useState(expense?.currency ?? fallbackCurrency);
  const [selectedCategory, setSelectedCategory] = useState<SpendingCategory | null>(
    expense?.category ?? initialData?.category ?? null,
  );
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? userId);
  const [amountInput, setAmountInput] = useState(
    expense ? decimalFromMinorUnits(expense.amountMinor, expense.currency) : "",
  );
  const [entryMode, setEntryMode] = useState<ExpenseEntryMode>(
    expense?.lineItems?.length ? "itemized" : "simple",
  );
  const [lineItemDrafts, setLineItemDrafts] = useState<ExpenseLineItemDraft[]>(() =>
    expense?.lineItems?.length
      ? expense.lineItems.map((item) => lineItemToDraft(item, expense.currency))
      : [emptyLineItemDraft(userId, "new-item-1")],
  );

  const isForeign = expenseCurrency !== currency;
  const historicalRate =
    expense != null && expense.currency === expenseCurrency ? expense.exchangeRateToBase : null;
  const keepsHistoricalRate = historicalRate != null;

  useEffect(() => {
    if (!open || !isForeign || keepsHistoricalRate) return;
    let cancelled = false;
    const from = expenseCurrency;
    const to = currency;
    void resolveExchangeRate(from, to, { fetchRate: fetchExchangeRate })
      .then((resolved) => {
        if (!cancelled && resolved) setResolvedRate({ from, to, rate: resolved });
      })
      .catch(() => {
        if (!cancelled) setResolvedRate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isForeign, keepsHistoricalRate, expenseCurrency, currency]);

  const activeResolved =
    resolvedRate && resolvedRate.from === expenseCurrency && resolvedRate.to === currency
      ? resolvedRate.rate
      : null;
  const exchangeRateToBase = isForeign ? (historicalRate ?? activeResolved?.rate ?? null) : null;
  const rateNotice =
    isForeign && historicalRate == null && activeResolved && activeResolved.source !== "live"
      ? activeResolved
      : null;

  const parsedAmount = useMemo(() => {
    if (!amountInput.trim()) return null;
    try {
      return parseMinorUnits(amountInput, expenseCurrency);
    } catch {
      return null;
    }
  }, [amountInput, expenseCurrency]);
  const itemizedTotalMinor = totalLineItemAmounts(lineItemDrafts, expenseCurrency);
  const conversionAmountMinor = entryMode === "itemized" ? itemizedTotalMinor : parsedAmount;

  const convertedAmount = useMemo(() => {
    if (conversionAmountMinor === null || exchangeRateToBase === null) return null;
    try {
      return toBaseMinorUnits(conversionAmountMinor, expenseCurrency, exchangeRateToBase, currency);
    } catch {
      return null;
    }
  }, [conversionAmountMinor, exchangeRateToBase, expenseCurrency, currency]);

  const allTravelers = useMemo(
    () =>
      Array.from(
        new Map([...travelers, ...addedTravelers].map((traveler) => [traveler.id, traveler])).values(),
      ),
    [addedTravelers, travelers],
  );
  const travelerByKey = useMemo(
    () => new Map(allTravelers.map((traveler) => [`traveler:${traveler.id}`, traveler])),
    [allTravelers],
  );
  const savedTravelerKeys = allTravelers.map((traveler) => `traveler:${traveler.id}`);
  const participants = Array.from(
    new Set([
      ...(participantSelection ?? [...members.map((member) => member.userId), ...savedTravelerKeys]),
      ...extraPeople,
    ]),
  );
  const itemParticipants = Array.from(new Set([userId, ...participants]));
  const step =
    getCurrencyExponent(expenseCurrency) === 0
      ? "1"
      : `0.${"0".repeat(getCurrencyExponent(expenseCurrency) - 1)}1`;
  const effectiveSplit = splitEnabled;
  const effectiveParticipants = effectiveSplit ? participants : [userId];
  const effectiveMode = effectiveSplit ? mode : "equal";
  const effectivePaidBy = entryMode === "itemized" || effectiveSplit ? paidBy : userId;
  const defaultDate = expense?.date ?? initialData?.date ?? new Date().toISOString().slice(0, 10);

  function nameFor(id: string): string {
    if (id === userId) return t("common.you");
    return travelerByKey.get(id)?.displayName ?? names.get(id) ?? id;
  }

  function updateLineItem(id: string, patch: Partial<ExpenseLineItemDraft>) {
    setLineItemDrafts((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function addExtraPerson() {
    const name = quickAddName.trim();
    if (!name) return;
    const existing = travelers.find(
      (traveler) => traveler.displayName.trim().toLowerCase() === name.toLowerCase(),
    );
    try {
      const traveler =
        existing ??
        (await (async () => {
          const contact = await contactRepository.create({
            id: crypto.randomUUID(),
            ownerId: userId,
            fullName: name,
          });
          return tripTravelerRepository.attach({
            id: crypto.randomUUID(),
            tripId,
            contact,
            createdBy: userId,
          });
        })());
      const key = `traveler:${traveler.id}`;
      setAddedTravelers((current) =>
        current.some((item) => item.id === traveler.id) ? current : [...current, traveler],
      );
      if (!participants.includes(key)) setExtraPeople((people) => [...people, key]);
      if (paidBy.trim().toLowerCase() === name.toLowerCase()) setPaidBy(key);
      setQuickAddName("");
    } catch (cause) {
      onError(localizeThrownError(cause, t, "Unable to save traveler."));
    }
  }

  function removeExtraPerson(name: string) {
    setExtraPeople((people) => people.filter((person) => person !== name));
    setShareInputs((map) => {
      const next = new Map(map);
      next.delete(name);
      return next;
    });
    setShareCounts((counts) => {
      const next = { ...counts };
      delete next[name];
      return next;
    });
  }

  function renderShareInput(id: string, disabled: boolean) {
    const shareValue = shareInputs.get(id) ?? "";
    if (mode === "exact") {
      return (
        <>
          <input
            name={`share-${id}`}
            type="number"
            min="0"
            step={step}
            value={shareValue}
            onChange={(event) =>
              setShareInputs((current) => new Map(current).set(id, event.target.value))
            }
            className="h-9 w-24 rounded-md border bg-background px-2 text-right text-sm"
            disabled={disabled}
            aria-label={`Share amount for ${nameFor(id)}`}
          />
          <span className="text-sm text-muted-foreground">{expenseCurrency}</span>
        </>
      );
    }
    if (mode === "percentage") {
      return (
        <>
          <input
            name={`share-${id}`}
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={shareValue}
            onChange={(event) =>
              setShareInputs((current) => new Map(current).set(id, event.target.value))
            }
            className="h-9 w-24 rounded-md border bg-background px-2 text-right text-sm"
            disabled={disabled}
            aria-label={`Share percent for ${nameFor(id)}`}
          />
          <span className="text-sm text-muted-foreground">%</span>
        </>
      );
    }
    if (mode === "shares") {
      return (
        <>
          <input
            name={`shares-${id}`}
            type="number"
            min="1"
            step="1"
            value={shareCounts[id] ?? "1"}
            onChange={(event) =>
              setShareCounts((current) => ({ ...current, [id]: event.target.value }))
            }
            className="h-9 w-20 rounded-md border bg-background px-2 text-right text-sm"
            disabled={disabled}
            aria-label={`Share count for ${nameFor(id)}`}
          />
          <span className="text-sm text-muted-foreground">shares</span>
        </>
      );
    }
    return null;
  }

  useEffect(() => {
    if (!expense) return;
    expenseRepository
      .listSharesByExpense(expense.id)
      .then((shares) => {
        const map = new Map<string, string>();
        for (const share of shares) {
          if (mode === "exact") {
            map.set(share.userId, decimalFromMinorUnits(share.shareAmountMinor, currency));
          } else if (mode === "percentage") {
            map.set(share.userId, String(share.sharePercentage ?? 0));
          }
        }
        setShareInputs(map);
      })
      .catch(() => setShareInputs(new Map()));
  }, [currency, expense, mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amountIssue = entryMode === "simple" ? validatePositiveAmount(String(data.get("amount") ?? "")) : null;
    const nextAmountError = amountIssue ? t(amountIssue.key, amountIssue.variables) : null;
    const nextParticipantError =
      entryMode === "simple" && splitEnabled && !effectiveParticipants.length
        ? t("errors.participantRequired")
        : null;
    setAmountError(nextAmountError);
    setParticipantError(nextParticipantError);
    setItemError(null);
    if (nextAmountError || nextParticipantError) return;
    setSaving(true);
    const description = String(data.get("description"));
    const rawCategory = String(data.get("category") || "");
    const rawSubcategory = String(data.get("subcategory") || "");
    const category = (
      SPENDING_CATEGORY_KEYS.includes(rawCategory as SpendingCategory) ? rawCategory : null
    ) as SpendingCategory | null;
    const subcategory = (
      category && (SPENDING_CATEGORIES[category] as readonly string[]).includes(rawSubcategory)
        ? rawSubcategory
        : null
    ) as SpendingSubcategory | null;
    const date = String(data.get("date") || defaultDate);
    try {
      let amountMinor: bigint;
      let lineItems: ExpenseLineItem[] = [];
      let shares: ReturnType<typeof calculateSplit>["shares"];
      let splitType: ExpenseSplitType;
      if (entryMode === "itemized") {
        try {
          lineItems = lineItemDrafts.map((item) =>
            allocateExpenseItem({
              id: item.id,
              description: item.description,
              amountMinor: parseMinorUnits(item.amountInput, expenseCurrency),
              participants: item.participants,
              mode: item.splitType,
              exactMinor:
                item.splitType === "exact"
                  ? Object.fromEntries(
                      item.participants.map((participantId) => [
                        participantId,
                        parseMinorUnits(item.exactInputs[participantId] ?? "", expenseCurrency),
                      ]),
                    )
                  : undefined,
            }),
          );
          const summary = summarizeExpenseLineItems(lineItems);
          amountMinor = summary.amountMinor;
          shares = summary.shares;
          splitType = "exact";
        } catch (cause) {
          setItemError(localizeThrownError(cause, t, t("copy.itemAllocationError")));
          return;
        }
      } else {
        amountMinor = parseMinorUnits(String(data.get("amount")), expenseCurrency);
        if (amountMinor <= 0n) {
          setAmountError(t("errors.positiveAmount"));
          return;
        }
        const exactMinor =
          effectiveMode === "exact"
            ? Object.fromEntries(
                effectiveParticipants.map((id) => [
                  id,
                  parseMinorUnits(String(data.get(`share-${id}`)), expenseCurrency),
                ]),
              )
            : undefined;
        const percentages =
          effectiveMode === "percentage"
            ? Object.fromEntries(
                effectiveParticipants.map((id) => [id, Number(data.get(`share-${id}`))]),
              )
            : undefined;
        const shareCountsInput =
          effectiveMode === "shares"
            ? Object.fromEntries(
                effectiveParticipants.map((id) => [id, Number(shareCounts[id] ?? 1)]),
              )
            : undefined;
        shares = calculateSplit({
          totalMinor: amountMinor,
          payerId: effectivePaidBy,
          participants: effectiveParticipants,
          mode: effectiveMode,
          exactMinor,
          percentages,
          shares: shareCountsInput,
        }).shares;
        splitType = effectiveMode;
      }
      const expensePatch = {
        description,
        amountMinor,
        lineItems,
        currency: expenseCurrency,
        exchangeRateToBase,
        paidBy: effectivePaidBy,
        paidByTravelerId: effectivePaidBy.startsWith("traveler:")
          ? effectivePaidBy.slice("traveler:".length)
          : null,
        splitType,
        category,
        subcategory,
        date,
      };
      if (expense) {
        const updated = await expenseRepository.update(expense.id, expensePatch, shares);
        onSaved?.(updated);
      } else {
        const created = await expenseRepository.create({
          id: crypto.randomUUID(),
          tripId,
          activityId: initialData?.activityId ?? null,
          ...expensePatch,
          createdBy: userId,
          shares,
        });
        onSaved?.(created);
      }
      if (rateNotice && exchangeRateToBase != null) {
        toast({
          title: t("copy.cachedRateApplied", { rate: formatRate(exchangeRateToBase) }),
          variant: "info",
        });
      }
      onClose();
    } catch (cause) {
      onError(localizeThrownError(cause, t, "Unable to save expense."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[90dvh] overflow-y-auto",
          "top-auto bottom-0 translate-y-0 rounded-b-none sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-2xl",
        )}
      >
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : t("common.addExpense")}</DialogTitle>
          <DialogDescription>{t("copy.choosePayer")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field
            label={entryMode === "itemized" ? t("copy.receiptDescription") : t("common.description")}
            name="description"
            defaultValue={expense?.description ?? initialData?.description}
            required
          />
          <div className="space-y-2">
            <Label htmlFor="expense-entry-mode">{t("copy.expenseEntryType")}</Label>
            <select
              id="expense-entry-mode"
              value={entryMode}
              onChange={(event) => {
                const next = event.target.value as ExpenseEntryMode;
                setEntryMode(next);
                if (next === "itemized") setSplitEnabled(false);
                setItemError(null);
              }}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="simple">{t("copy.singleAmount")}</option>
              <option value="itemized">{t("copy.itemizedReceipt")}</option>
            </select>
          </div>
          {entryMode === "simple" && (
            <Field
              label={`${t("common.amount")} (${expenseCurrency})`}
              name="amount"
              type="number"
              min={
                getCurrencyExponent(expenseCurrency) === 0
                  ? "1"
                  : `0.${"0".repeat(getCurrencyExponent(expenseCurrency) - 1)}1`
              }
              step={
                getCurrencyExponent(expenseCurrency) === 0
                  ? "1"
                  : `0.${"0".repeat(getCurrencyExponent(expenseCurrency) - 1)}1`
              }
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              required
              error={amountError}
            />
          )}
          <div className="space-y-2">
            <Label htmlFor="expenseCurrency">{t("common.currency")}</Label>
            <select
              id="expenseCurrency"
              name="expenseCurrency"
              value={expenseCurrency}
              onChange={(event) => setExpenseCurrency(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {expenseCurrency && !(CURRENCIES as readonly string[]).includes(expenseCurrency) && (
                <option value={expenseCurrency}>{expenseCurrency}</option>
              )}
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            {isForeign && (
              <div className="rounded-lg border bg-muted p-3 text-sm">
                <Label className="text-muted-foreground">{t("copy.exchangeRate")}</Label>
                <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                  1 {expenseCurrency} ={" "}
                  {exchangeRateToBase != null ? formatRate(exchangeRateToBase) : "—"} {currency}
                </p>
                {convertedAmount !== null && conversionAmountMinor !== null ? (
                  <p className="mt-1 text-xs font-semibold text-foreground">
                    {formatMinorUnits(conversionAmountMinor, expenseCurrency)} ≈{" "}
                    {formatMinorUnits(convertedAmount, currency)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    That&rsquo;s how much {expenseCurrency} equals in {currency}.
                  </p>
                )}
                {rateNotice && (
                  <p role="status" aria-live="polite" className="mt-2 text-xs text-foreground">
                    {rateNotice.source === "default"
                      ? t("copy.defaultRateWarning")
                      : t("copy.cachedRateWarning", { date: rateNotice.fetchedAt.slice(0, 10) })}
                  </p>
                )}
              </div>
            )}
          </div>
          <Field label={t("copy.date")} name="date" type="date" defaultValue={defaultDate} required />
          {entryMode === "itemized" && (
            <section className="space-y-3" aria-labelledby="expense-items-heading">
              <h3 id="expense-items-heading" className="text-sm font-semibold">
                {t("copy.receiptItems")}
              </h3>
              {lineItemDrafts.map((item, index) => (
                <fieldset key={item.id} className="space-y-3 rounded-xl border bg-muted/20 p-3">
                  <legend className="text-sm font-medium">{t("copy.itemDescription")} {index + 1}</legend>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${t("copy.removeReceiptItem")} ${index + 1}`}
                      disabled={lineItemDrafts.length <= 1}
                      onClick={() => setLineItemDrafts((current) => current.filter((row) => row.id !== item.id))}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </div>
                  <Field
                    label={t("copy.itemDescription")}
                    name={`item-${item.id}-description`}
                    value={item.description}
                    onChange={(event) => updateLineItem(item.id, { description: event.target.value })}
                    maxLength={200}
                    required
                    aria-invalid={Boolean(itemError)}
                    aria-describedby={itemError ? "expense-items-error" : undefined}
                  />
                  <Field
                    label={`${t("common.amount")} (${expenseCurrency})`}
                    name={`item-${item.id}-amount`}
                    type="number"
                    min={step}
                    step={step}
                    value={item.amountInput}
                    onChange={(event) => updateLineItem(item.id, { amountInput: event.target.value })}
                    required
                    aria-invalid={Boolean(itemError)}
                    aria-describedby={itemError ? "expense-items-error" : undefined}
                  />
                  <fieldset
                    className="space-y-2"
                    aria-describedby={itemError ? "expense-items-error" : undefined}
                  >
                    <legend className="text-sm font-medium">{t("copy.assignItemTo")}</legend>
                    {itemParticipants.map((participantId) => {
                      const selected = item.participants.includes(participantId);
                      return (
                        <label key={participantId} className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {
                              const nextParticipants = selected
                                ? item.participants.filter((id) => id !== participantId)
                                : [...item.participants, participantId];
                              updateLineItem(item.id, {
                                participants: nextParticipants,
                                exactInputs: Object.fromEntries(
                                  Object.entries(item.exactInputs).filter(([id]) => nextParticipants.includes(id)),
                                ),
                              });
                            }}
                            aria-label={`${t("copy.assignItemTo")} ${nameFor(participantId)}`}
                            className="size-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          />
                          <span className="text-sm">{nameFor(participantId)}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                  {item.participants.length > 1 && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor={`item-${item.id}-split`}>{t("copy.splitItem")}</Label>
                        <select
                          id={`item-${item.id}-split`}
                          value={item.splitType}
                          onChange={(event) =>
                            updateLineItem(item.id, { splitType: event.target.value as "equal" | "exact" })
                          }
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="equal">{t("copy.equal")}</option>
                          <option value="exact">{t("copy.exact")}</option>
                        </select>
                      </div>
                      {item.splitType === "exact" && item.participants.map((participantId) => (
                        <Field
                          key={participantId}
                          label={`${t("copy.exact")} · ${nameFor(participantId)} (${expenseCurrency})`}
                          name={`item-${item.id}-share-${participantId}`}
                          type="number"
                          min="0"
                          step={step}
                          value={item.exactInputs[participantId] ?? ""}
                          required
                          onChange={(event) =>
                            updateLineItem(item.id, {
                              exactInputs: { ...item.exactInputs, [participantId]: event.target.value },
                            })
                          }
                          aria-invalid={Boolean(itemError)}
                          aria-describedby={itemError ? "expense-items-error" : undefined}
                        />
                      ))}
                    </>
                  )}
                </fieldset>
              ))}
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setLineItemDrafts((current) => [...current, emptyLineItemDraft(userId)])}
              >
                <Plus className="size-4" aria-hidden /> {t("copy.addReceiptItem")}
              </Button>
              <div className="flex items-center justify-between border-t pt-3 text-sm" aria-live="polite">
                <span className="font-semibold">{t("copy.receiptTotal")}</span>
                <span className="font-mono font-semibold tabular-nums">
                  {itemizedTotalMinor === null ? "—" : `${formatMinorUnits(itemizedTotalMinor, expenseCurrency)} ${expenseCurrency}`}
                </span>
              </div>
              {itemError && (
                <p id="expense-items-error" role="alert" className="text-sm text-destructive">
                  {itemError}
                </p>
              )}
              <div className="flex items-center gap-2 rounded-lg border border-dashed p-2.5">
                <Input
                  aria-label={t("copy.placeholderPerson")}
                  value={quickAddName}
                  onChange={(event) => setQuickAddName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addExtraPerson();
                    }
                  }}
                  placeholder={t("copy.placeholderPerson")}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={addExtraPerson}
                  disabled={!quickAddName.trim()}
                >
                  <Plus className="size-4" aria-hidden /> {t("common.add")}
                </Button>
              </div>
            </section>
          )}
          <div className="space-y-2">
            <Label htmlFor="category">{t("common.category")}</Label>
            <select
              id="category"
              name="category"
              value={selectedCategory ?? ""}
              onChange={(event) =>
                setSelectedCategory((event.target.value as SpendingCategory) || null)
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">{t("common.none")}</option>
              {SPENDING_CATEGORY_KEYS.map((category) => (
                <option key={category} value={category}>
                  {SPENDING_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </div>
          {selectedCategory && (
            <div className="space-y-2">
              <Label htmlFor="subcategory">{t("copy.subcategory")}</Label>
              <select
                id="subcategory"
                name="subcategory"
                defaultValue={expense?.subcategory ?? ""}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">{t("common.none")}</option>
                {SPENDING_CATEGORIES[selectedCategory].map((subcategory) => (
                  <option key={subcategory} value={subcategory}>
                    {SPENDING_SUBCATEGORY_LABELS[subcategory]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {entryMode === "simple" && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
              <label htmlFor="splitEnabled" className="text-sm font-semibold">
                {t("copy.splitThisExpense")}
              </label>
              <input
                id="splitEnabled"
                type="checkbox"
                checked={splitEnabled}
                onChange={(event) => setSplitEnabled(event.target.checked)}
                className="size-4"
              />
            </div>
          )}

          {entryMode === "simple" && !splitEnabled && (
            <p className="text-sm text-muted-foreground">{t("copy.recordedOwn")}</p>
          )}

          {(splitEnabled || entryMode === "itemized") && (
            <div className="space-y-2">
              <Label htmlFor="paidBy">{t("copy.paidBy")}</Label>
              <select
                id="paidBy"
                name="paidBy"
                value={paidBy}
                onChange={(event) => setPaidBy(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {!members.some((member) => member.userId === userId) && (
                  <option value={userId}>{nameFor(userId)}</option>
                )}
                {members.map((member) => (
                  <option key={member.id} value={member.userId}>
                    {nameFor(member.userId)}
                  </option>
                ))}
                {allTravelers.map((traveler) => {
                  const key = `traveler:${traveler.id}`;
                  return (
                    <option key={key} value={key}>
                      {traveler.displayName}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          {splitEnabled && entryMode === "simple" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="splitType">{t("copy.splitMethod")}</Label>
                <select
                  id="splitType"
                  value={mode}
                  onChange={(event) => {
                    const next = event.target.value as ExpenseSplitType;
                    setMode(next);
                    if (next === "shares")
                      setShareCounts(Object.fromEntries(participants.map((id) => [id, "1"])));
                  }}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="equal">{t("copy.equal")}</option>
                  <option value="exact">{t("copy.exact")}</option>
                  <option value="percentage">{t("copy.percentage")}</option>
                  <option value="shares">{t("copy.shares")}</option>
                </select>
              </div>
              <fieldset
                className="space-y-3"
                aria-invalid={Boolean(participantError)}
                aria-describedby={participantError ? "expense-participants-error" : undefined}
              >
                <legend className="text-sm font-semibold">{t("copy.participants")}</legend>
                {members.map((member) => {
                  const selected = participants.includes(member.userId);
                  return (
                    <div key={member.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setParticipants((current) =>
                            selected
                              ? (current ?? participants).filter((id) => id !== member.userId)
                              : [...(current ?? participants), member.userId],
                          )
                        }
                        aria-label={`Include ${nameFor(member.userId)}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {nameFor(member.userId)}
                      </span>
                      {selected && renderShareInput(member.userId, false)}
                    </div>
                  );
                })}

                {allTravelers.map((traveler) => {
                  const key = `traveler:${traveler.id}`;
                  const selected = participants.includes(key);
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/20"
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setParticipants((current) =>
                            selected
                              ? (current ?? participants).filter((id) => id !== key)
                              : [...(current ?? participants), key],
                          )
                        }
                        aria-label={`Include ${traveler.displayName}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {traveler.displayName}
                      </span>
                      {selected && renderShareInput(key, false)}
                    </div>
                  );
                })}

                {extraPeople
                  .filter((key) => !travelerByKey.has(key))
                  .map((key) => (
                    <div
                      key={key}
                      className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {nameFor(key)}
                      </span>
                      {renderShareInput(key, false)}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${nameFor(key)}`}
                        onClick={() => removeExtraPerson(key)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}

                <div className="flex items-center gap-2 rounded-lg border border-dashed p-2.5">
                  <Input
                    value={quickAddName}
                    onChange={(event) => setQuickAddName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addExtraPerson();
                      }
                    }}
                    placeholder={t("copy.placeholderPerson")}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addExtraPerson}
                    disabled={!quickAddName.trim()}
                  >
                    <Plus className="size-4" /> {t("common.add")}
                  </Button>
                </div>
                {members.length <= 1 && (
                  <p className="text-xs text-muted-foreground">{t("copy.noOtherTravelers")}</p>
                )}
                {participantError ? (
                  <p id="expense-participants-error" role="alert" className="text-xs text-destructive">
                    {participantError}
                  </p>
                ) : null}
              </fieldset>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={saving || (isForeign && exchangeRateToBase == null)}>
              {saving ? t("settings.saving") : t("copy.saveExpense")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  name,
  error,
  ...props
}: ComponentProps<typeof Input> & { label: string; name: string; error?: string | null }) {
  const errorId = error ? `expense-${name}-error` : undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={`expense-${name}`}>{label}</Label>
      <Input
        id={`expense-${name}`}
        name={name}
        {...props}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function formatRate(rate: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(rate);
}
