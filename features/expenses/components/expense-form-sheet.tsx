"use client";

import { localizeThrownError } from "@/lib/i18n/localize-error";

import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentProps, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
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
import { calculateSplit } from "@/features/expenses/lib/expense-calculator";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "MXN"] as const;

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
  const [saving, setSaving] = useState(false);
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

  const isForeign = expenseCurrency !== currency;
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
  const step =
    getCurrencyExponent(expenseCurrency) === 0
      ? "1"
      : `0.${"0".repeat(getCurrencyExponent(expenseCurrency) - 1)}1`;
  const effectiveSplit = splitEnabled;
  const effectiveParticipants = effectiveSplit ? participants : [userId];
  const effectiveMode = effectiveSplit ? mode : "equal";
  const effectivePaidBy = effectiveSplit ? paidBy : userId;
  const defaultDate = expense?.date ?? initialData?.date ?? new Date().toISOString().slice(0, 10);

  function nameFor(id: string): string {
    if (id === userId) return t("common.you");
    return travelerByKey.get(id)?.displayName ?? names.get(id) ?? id;
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
    const date = String(data.get("date") || defaultDate);
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
        const updated = await expenseRepository.update(expense.id, {
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
        onSaved?.(updated);
      } else {
        const created = await expenseRepository.create({
          id: crypto.randomUUID(),
          tripId,
          activityId: initialData?.activityId ?? null,
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
        onSaved?.(created);
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
            label={t("common.description")}
            name="description"
            defaultValue={expense?.description ?? initialData?.description}
            required
          />
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
          />
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
          <Field label={t("copy.date")} name="date" type="date" defaultValue={defaultDate} required />
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

          {!splitEnabled && (
            <p className="text-sm text-muted-foreground">{t("copy.recordedOwn")}</p>
          )}

          {splitEnabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="paidBy">{t("copy.paidBy")}</Label>
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
              <fieldset className="space-y-3">
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
              </fieldset>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
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
  ...props
}: ComponentProps<typeof Input> & { label: string; name: string }) {
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
