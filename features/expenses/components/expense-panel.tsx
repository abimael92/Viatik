"use client";

import {
  BedDouble,
  Car,
  Pencil,
  Plus,
  ReceiptText,
  ShoppingBag,
  Ticket,
  Trash2,
  UtensilsCrossed,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Heading } from "@/components/ui/heading";
import { useToast } from "@/components/ui/toast";
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
  ExpenseShare,
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
import { lookupRate } from "@/features/finance/lib/currency-converter";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { calculateBalances, calculateSplit } from "@/features/expenses/lib/expense-calculator";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "MXN"] as const;

const CATEGORY_ICONS: Record<SpendingCategory, typeof ReceiptText> = {
  transport: Car,
  stay: BedDouble,
  food: UtensilsCrossed,
  activities: Ticket,
  shopping: ShoppingBag,
  personal: UserRound,
};

function formatMoney(amount: bigint, currency: string): string {
  return `${formatMinorUnits(amount, currency)} ${currency.toUpperCase()}`;
}

function splitLabel(splitType: ExpenseSplitType): string {
  return splitType === "equal"
    ? "Equal split"
    : splitType === "exact"
      ? "Custom split"
      : `${splitType[0].toUpperCase()}${splitType.slice(1)} split`;
}

function getConvertedExpenseAmount(expense: Expense, baseCurrency: string): bigint | null {
  if (expense.currency === baseCurrency) return expense.amountMinor;
  if (expense.exchangeRateToBase == null) return null;
  try {
    return toBaseMinorUnits(
      expense.amountMinor,
      expense.currency,
      expense.exchangeRateToBase,
      baseCurrency
    );
  } catch {
    return null;
  }
}

function formatExpenseSummary(expense: Expense, baseCurrency: string): string {
  const converted = getConvertedExpenseAmount(expense, baseCurrency);
  return converted !== null && expense.currency !== baseCurrency
    ? `≈ ${formatMoney(converted, baseCurrency)}`
    : formatMoney(expense.amountMinor, expense.currency);
}

export function ExpensePanel({
  tripId,
  userId,
  currency,
  locationCurrency,
  defaultCurrency,
  canEdit = true,
  autoOpen = false,
  onAutoOpen,
  filter = null,
  embedded = false,
}: {
  tripId: string;
  userId: string;
  currency: string;
  /** The trip destination's local currency — default for new expenses. */
  locationCurrency?: string;
  /** Explicit default for a new expense, used by action intents that promise base currency. */
  defaultCurrency?: string;
  canEdit?: boolean;
  autoOpen?: boolean;
  onAutoOpen?: () => void;
  /** When set, only expenses in this category are shown in the feed. */
  filter?: SpendingCategory | null;
  /** Hide the component's own header + summary chrome (used inside the Budget hero). */
  embedded?: boolean;
}) {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [travelers, setTravelers] = useState<TripTraveler[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const localProfile = useLocalProfile(userId);
  const [dialog, setDialog] = useState<Expense | "new" | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);
  const { toast } = useToast();
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [sharesByExpense, setSharesByExpense] = useState<Record<string, ExpenseShare[]>>({});
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const autoOpenConsumed = useRef(false);

  useEffect(() => {
    if (!autoOpen) {
      autoOpenConsumed.current = false;
      return;
    }
    if (autoOpen && canEdit && dialog === null && !autoOpenConsumed.current) {
      autoOpenConsumed.current = true;
      setDialog("new");
      onAutoOpen?.();
    } else if (autoOpen && !canEdit) {
      onAutoOpen?.();
    }
  }, [autoOpen, canEdit, dialog, onAutoOpen]);

  useEffect(() => expenseRepository.watchByTrip(tripId, setExpenses), [tripId]);
  useEffect(() => collaborationRepository.watchMembers(tripId, setMembers), [tripId]);
  useEffect(() => tripTravelerRepository.watch(tripId, setTravelers), [tripId]);
  useEffect(() => {
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
  }, [members]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      (expenses ?? []).map(async (expense) => {
        const shares = await expenseRepository.listSharesByExpense(expense.id);
        return [
          expense.id,
          shares,
          { amountMinor: expense.amountMinor, paidBy: expense.paidBy, shares },
        ] as const;
      })
    ).then((items) => {
      if (cancelled) return;
      setSharesByExpense(Object.fromEntries(items.map(([id, shares]) => [id, shares])));
      setBalances(calculateBalances(items.map(([, , aggregate]) => aggregate)));
    });
    return () => {
      cancelled = true;
    };
  }, [expenses]);

  const total = useMemo(
    () => (expenses ?? []).reduce((sum, expense) => sum + expense.amountMinor, 0n),
    [expenses]
  );
  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles]
  );
  const names = useMemo(() => {
    const next = new Map(
      profiles.map((profile) => [profile.id, profile.fullName?.trim() || "Traveler"])
    );
    if (localProfile) next.set(userId, localProfile.fullName?.trim() || "Traveler");
    return next;
  }, [localProfile, profiles, userId]);
  const identityFor = (id: string) => {
    if (id === userId && localProfile) {
      return {
        name: localProfile.fullName?.trim() || "Traveler",
        avatarUrl: localProfile.avatarUrl,
        avatarSeed: localProfile.avatarSeed,
      };
    }
    const profile = profileById.get(id);
    return {
      name: profile?.fullName?.trim() || "Traveler",
      avatarUrl: profile?.avatarUrl ?? null,
      avatarSeed: profile?.avatarSeed ?? null,
    };
  };

  const visibleExpenses = useMemo(
    () => (expenses ?? []).filter((expense) => !filter || expense.category === filter),
    [expenses, filter]
  );

  const hasFilter = filter !== null;

  return (
    <section className="space-y-6" aria-labelledby="expenses-heading">
      {!embedded && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Heading level={2} id="expenses-heading" className="text-2xl font-bold">
              Expenses
            </Heading>
            <p className="text-muted-foreground">
              Track shared costs and settle balances together.
            </p>
          </div>
          {canEdit && (
            <Button variant="primary" onClick={() => setDialog("new")}>
              <Plus className="size-5" />
              Add expense
            </Button>
          )}
        </div>
      )}

      {!embedded && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Summary label="Trip total" value={formatMinorUnits(total, currency)} />
          <Summary
            label="Your balance"
            value={formatMinorUnits(balances[userId] ?? 0n, currency)}
            detail={(balances[userId] ?? 0n) >= 0n ? "You are owed" : "You owe"}
          />
        </div>
      )}

      {!embedded && Object.keys(balances).length > 1 && (
        <div className="rounded-2xl border bg-card p-5">
          <Heading level={3} className="text-base font-semibold">
            Settlement summary
          </Heading>
          <div className="mt-3 space-y-2">
            {Object.entries(balances).map(([memberId, balance]) => (
              <div key={memberId} className="flex justify-between text-sm">
                <span>{memberId === userId ? "You" : (names.get(memberId) ?? memberId)}</span>
                <span className={balance >= 0n ? "text-success" : "text-destructive"}>
                  {balance >= 0n ? "receives" : "owes"}{" "}
                  <span className="font-mono tracking-tight tabular-nums">
                    {formatMinorUnits(balance < 0n ? -balance : balance, currency)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {expenses === null ? (
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      ) : visibleExpenses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed bg-linear-to-b from-card to-muted/40 p-12 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
            <ReceiptText className="size-8" aria-hidden />
          </span>
          <Heading level={3} className="text-lg font-semibold">
            {hasFilter && (expenses ?? []).length > 0
              ? "Nothing in this category yet"
              : "No shared expenses yet"}
          </Heading>
          <p className="max-w-xs text-sm text-muted-foreground">
            {hasFilter && (expenses ?? []).length > 0
              ? `Add a ${SPENDING_CATEGORY_LABELS[filter].toLowerCase()} cost to start tracking it here.`
              : canEdit
                ? "Add the first shared cost to start tracking your trip spending."
                : "No shared costs have been added yet."}
          </p>
          {canEdit && !hasFilter && (
            <Button variant="primary" onClick={() => setDialog("new")} className="mt-2">
              <Plus className="size-5" />
              Add your first expense
            </Button>
          )}
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
          {visibleExpenses.map((expense) => {
            const expanded = expandedExpenseId === expense.id;
            const payer = identityFor(expense.paidBy);
            const CategoryIcon = expense.category ? CATEGORY_ICONS[expense.category] : ReceiptText;
            const shares = sharesByExpense[expense.id] ?? [];
            const convertedAmount = getConvertedExpenseAmount(expense, currency);
            return (
              <div key={expense.id} className="transition-colors hover:bg-muted/30">
                <div className="flex items-center gap-3 p-4">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-expanded={expanded}
                    onClick={() => setExpandedExpenseId(expanded ? null : expense.id)}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <CategoryIcon className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{expense.description}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {expense.category ? (
                          <span className="mr-1.5 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {SPENDING_CATEGORY_LABELS[expense.category]}
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1.5 align-middle">
                          <UserAvatar
                            seed={payer.avatarSeed}
                            src={payer.avatarUrl}
                            name={payer.name}
                            size="sm"
                            className="size-8"
                          />
                          Paid by {payer.name} · {splitLabel(expense.splitType)}
                        </span>
                      </p>
                    </div>
                    <strong className="shrink-0 font-mono tracking-tight tabular-nums">
                      {formatExpenseSummary(expense, currency)}
                    </strong>
                  </button>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${expense.description}`}
                        onClick={() => setDialog(expense)}
                      >
                        <Pencil className="size-5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${expense.description}`}
                        onClick={() => setDeleteExpense(expense)}
                      >
                        <Trash2 className="size-5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
                {expanded && (
                  <div className="border-t bg-muted/20 px-4 py-4 pl-16 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Split details</p>
                        <p className="font-medium">
                          {splitLabel(expense.splitType)} · {shares.length || 1} traveler
                          {shares.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Sync status</p>
                        <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          Saved locally
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Original amount</p>
                        <p className="font-mono font-semibold tabular-nums">
                          {formatMoney(expense.amountMinor, expense.currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Trip currency</p>
                        <p className="font-mono font-semibold tabular-nums">
                          {convertedAmount !== null
                            ? formatMoney(convertedAmount, currency)
                            : "Conversion unavailable"}
                        </p>
                      </div>
                    </div>
                    {shares.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs text-muted-foreground">Traveler shares</p>
                        {shares.map((share) => {
                          const person = identityFor(share.userId);
                          return (
                            <div key={share.id} className="flex items-center justify-between gap-3">
                              <span className="flex min-w-0 items-center gap-2">
                                <UserAvatar
                                  seed={person.avatarSeed}
                                  src={person.avatarUrl}
                                  name={person.name}
                                  size="sm"
                                  className="size-8"
                                />
                                {person.name}
                              </span>
                              <span className="font-mono tabular-nums">
                                {formatMoney(share.shareAmountMinor, expense.currency)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ExpenseDialog
        key={dialog === null ? "closed" : dialog === "new" ? "new" : dialog.id}
        open={dialog !== null}
        expense={dialog === "new" ? undefined : (dialog ?? undefined)}
        tripId={tripId}
        userId={userId}
        currency={currency}
        locationCurrency={locationCurrency}
        defaultCurrency={defaultCurrency}
        members={members}
        travelers={travelers}
        names={names}
        onClose={() => setDialog(null)}
        onError={(message) =>
          toast({ title: "Unable to save expense", description: message, variant: "error" })
        }
      />
      <ConfirmDialog
        open={deleteExpense !== null}
        onOpenChange={(open) => !open && setDeleteExpense(null)}
        title="Delete expense?"
        description={
          deleteExpense ? `Delete ${deleteExpense.description}? This cannot be undone.` : ""
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteExpense) return;
          const expense = deleteExpense;
          setDeleteExpense(null);
          void expenseRepository
            .remove(expense.id)
            .then(() => toast({ title: "Expense deleted", variant: "success" }))
            .catch(() => toast({ title: "Unable to delete expense", variant: "error" }));
        }}
      />
    </section>
  );
}

function ExpenseDialog({
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
  onClose,
  onError,
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
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<ExpenseSplitType>(expense?.splitType ?? "equal");
  const [participantSelection, setParticipants] = useState<string[] | null>(null);
  const [extraPeople, setExtraPeople] = useState<string[]>([]);
  const [addedTravelers, setAddedTravelers] = useState<TripTraveler[]>([]);
  const [quickAddName, setQuickAddName] = useState("");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [shareInputs, setShareInputs] = useState<Map<string, string>>(new Map());
  const [shareCounts, setShareCounts] = useState<Record<string, string>>({});
  // Default new expenses to the destination's local currency when it's supported.
  const fallbackCurrency: string =
    defaultCurrency ??
    ((CURRENCIES as readonly string[]).includes(locationCurrency ?? "")
      ? (locationCurrency ?? currency)
      : currency);
  const [expenseCurrency, setExpenseCurrency] = useState(expense?.currency ?? fallbackCurrency);
  const [selectedCategory, setSelectedCategory] = useState<SpendingCategory | null>(
    expense?.category ?? null
  );
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? userId);
  const [amountInput, setAmountInput] = useState(
    expense ? decimalFromMinorUnits(expense.amountMinor, expense.currency) : ""
  );

  const isForeign = expenseCurrency !== currency;

  // Read-only exchange rate: how much 1 expenseCurrency equals in the trip's
  // base currency. Auto-derived (stored rate for edits, else the offline default).
  const suggestedRate = useMemo(() => {
    if (!isForeign) return null;
    try {
      return lookupRate(expenseCurrency, currency);
    } catch {
      return null;
    }
  }, [isForeign, expenseCurrency, currency]);

  const exchangeRateToBase = isForeign ? (expense?.exchangeRateToBase ?? suggestedRate) : null;

  const parsedAmount = useMemo(() => {
    if (!amountInput.trim()) return null;
    try {
      return parseMinorUnits(amountInput, expenseCurrency);
    } catch {
      return null;
    }
  }, [amountInput, expenseCurrency]);

  // Live read-only conversion into the trip's base currency (e.g. "20 USD ≈ 344 MXN").
  const convertedAmount = useMemo(() => {
    if (parsedAmount === null || exchangeRateToBase === null) return null;
    try {
      return toBaseMinorUnits(parsedAmount, expenseCurrency, exchangeRateToBase, currency);
    } catch {
      return null;
    }
  }, [parsedAmount, exchangeRateToBase, expenseCurrency, currency]);

  const allTravelers = useMemo(
    () =>
      Array.from(
        new Map(
          [...travelers, ...addedTravelers].map((traveler) => [traveler.id, traveler])
        ).values()
      ),
    [addedTravelers, travelers]
  );
  const travelerByKey = useMemo(
    () => new Map(allTravelers.map((traveler) => [`traveler:${traveler.id}`, traveler])),
    [allTravelers]
  );
  const savedTravelerKeys = allTravelers.map((traveler) => `traveler:${traveler.id}`);
  const participants = Array.from(
    new Set([
      ...(participantSelection ?? [
        ...members.map((member) => member.userId),
        ...savedTravelerKeys,
      ]),
      ...extraPeople,
    ])
  );
  const step =
    getCurrencyExponent(expenseCurrency) === 0
      ? "1"
      : `0.${"0".repeat(getCurrencyExponent(expenseCurrency) - 1)}1`;

  /** Split target when the toggle is on; otherwise the cost is personal (just me). */
  const effectiveSplit = splitEnabled;
  const effectiveParticipants = effectiveSplit ? participants : [userId];
  const effectiveMode = effectiveSplit ? mode : "equal";
  const effectivePaidBy = effectiveSplit ? paidBy : userId;

  function nameFor(id: string): string {
    if (id === userId) return "You";
    return travelerByKey.get(id)?.displayName ?? names.get(id) ?? id;
  }

  async function addExtraPerson() {
    const name = quickAddName.trim();
    if (!name) return;
    const existing = travelers.find(
      (traveler) => traveler.displayName.trim().toLowerCase() === name.toLowerCase()
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
        current.some((item) => item.id === traveler.id) ? current : [...current, traveler]
      );
      if (!participants.includes(key)) setExtraPeople((people) => [...people, key]);
      if (paidBy.trim().toLowerCase() === name.toLowerCase()) setPaidBy(key);
      setQuickAddName("");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to save traveler.");
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const data = new FormData(event.currentTarget);
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
    const date = String(data.get("date") || new Date().toISOString().slice(0, 10));
    try {
      const amountMinor = parseMinorUnits(String(data.get("amount")), expenseCurrency);
      if (amountMinor <= 0n) throw new Error("Enter an amount greater than zero.");
      if (!effectiveParticipants.length) throw new Error("Select at least one participant.");
      const exactMinor =
        effectiveMode === "exact"
          ? Object.fromEntries(
              effectiveParticipants.map((id) => [
                id,
                parseMinorUnits(String(data.get(`share-${id}`)), expenseCurrency),
              ])
            )
          : undefined;
      const percentages =
        effectiveMode === "percentage"
          ? Object.fromEntries(
              effectiveParticipants.map((id) => [id, Number(data.get(`share-${id}`))])
            )
          : undefined;
      const shareCountsInput =
        effectiveMode === "shares"
          ? Object.fromEntries(
              effectiveParticipants.map((id) => [id, Number(shareCounts[id] ?? 1)])
            )
          : undefined;
      const shares = calculateSplit({
        totalMinor: amountMinor,
        payerId: effectivePaidBy,
        participants: effectiveParticipants,
        mode: effectiveMode,
        exactMinor,
        percentages,
        shares: shareCountsInput,
      }).shares;
      if (expense) {
        await expenseRepository.update(expense.id, {
          description,
          amountMinor,
          currency: expenseCurrency,
          exchangeRateToBase,
          paidBy: effectivePaidBy,
          paidByTravelerId: effectivePaidBy.startsWith("traveler:")
            ? effectivePaidBy.slice("traveler:".length)
            : null,
          splitType: effectiveMode,
          category,
          subcategory,
          date,
        });
        await expenseRepository.replaceShares(expense.id, shares);
      } else {
        await expenseRepository.create({
          id: crypto.randomUUID(),
          tripId,
          description,
          amountMinor,
          currency: expenseCurrency,
          exchangeRateToBase,
          paidBy: effectivePaidBy,
          paidByTravelerId: effectivePaidBy.startsWith("traveler:")
            ? effectivePaidBy.slice("traveler:".length)
            : null,
          splitType: effectiveMode,
          category,
          subcategory,
          date,
          createdBy: userId,
          shares,
        });
      }
      onClose();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to save expense.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Add expense"}</DialogTitle>
          <DialogDescription>Choose who paid and how travelers share this cost.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Description"
            name="description"
            defaultValue={expense?.description}
            required
          />
          <Field
            label={`Amount (${expenseCurrency})`}
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
          />
          <div className="space-y-2">
            <Label htmlFor="expenseCurrency">Currency</Label>
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
                <Label className="text-muted-foreground">Exchange rate</Label>
                <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                  1 {expenseCurrency} ={" "}
                  {exchangeRateToBase != null ? formatRate(exchangeRateToBase) : "—"} {currency}
                </p>
                {convertedAmount !== null && parsedAmount !== null ? (
                  <p className="mt-1 text-xs font-semibold text-foreground">
                    {formatMinorUnits(parsedAmount, expenseCurrency)} ≈{" "}
                    {formatMinorUnits(convertedAmount, currency)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    That&rsquo;s how much {expenseCurrency} equals in {currency}.
                  </p>
                )}
              </div>
            )}
          </div>
          <Field
            label="Date"
            name="date"
            type="date"
            defaultValue={expense ? expense.date : new Date().toISOString().slice(0, 10)}
            required
          />
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              name="category"
              value={selectedCategory ?? ""}
              onChange={(event) =>
                setSelectedCategory((event.target.value as SpendingCategory) || null)
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">None</option>
              {SPENDING_CATEGORY_KEYS.map((category) => (
                <option key={category} value={category}>
                  {SPENDING_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </div>
          {selectedCategory && (
            <div className="space-y-2">
              <Label htmlFor="subcategory">Subcategory</Label>
              <select
                id="subcategory"
                name="subcategory"
                defaultValue={expense?.subcategory ?? ""}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">None</option>
                {SPENDING_CATEGORIES[selectedCategory].map((subcategory) => (
                  <option key={subcategory} value={subcategory}>
                    {SPENDING_SUBCATEGORY_LABELS[subcategory]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
            <label htmlFor="splitEnabled" className="text-sm font-semibold">
              Split this expense
            </label>
            <input
              id="splitEnabled"
              type="checkbox"
              checked={splitEnabled}
              onChange={(event) => setSplitEnabled(event.target.checked)}
              className="size-4"
            />
          </div>

          {!splitEnabled && (
            <p className="text-sm text-muted-foreground">
              Recorded as your own expense — not split with anyone.
            </p>
          )}

          {splitEnabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="paidBy">Paid by</Label>
                <select
                  id="paidBy"
                  name="paidBy"
                  value={paidBy}
                  onChange={(event) => setPaidBy(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
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
              <div className="space-y-2">
                <Label htmlFor="splitType">Split method</Label>
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
                  <option value="equal">Equal</option>
                  <option value="exact">Exact</option>
                  <option value="percentage">Percentage</option>
                  <option value="shares">Shares</option>
                </select>
              </div>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Participants</legend>
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
                              : [...(current ?? participants), member.userId]
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
                              : [...(current ?? participants), key]
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
                    placeholder="Add a person, e.g. Mom"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addExtraPerson}
                    disabled={!quickAddName.trim()}
                  >
                    <Plus className="size-4" /> Add
                  </Button>
                </div>
                {members.length <= 1 && (
                  <p className="text-xs text-muted-foreground">
                    No other travelers yet — add anyone else (a friend, coworker, family…) to split
                    this cost.
                  </p>
                )}
              </fieldset>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : "Save expense"}
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
  ...props
}: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`expense-${name}`}>{label}</Label>
      <Input id={`expense-${name}`} name={name} {...props} />
    </div>
  );
}
function formatRate(rate: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(rate);
}

function Summary({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold font-mono tracking-tight tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
