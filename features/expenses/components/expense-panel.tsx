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
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Heading } from "@/components/ui/heading";
import { useToast } from "@/components/ui/toast";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import type {
  Expense,
  ExpenseShare,
  ExpenseSplitType,
  ProfileSummary,
  TripMember,
} from "@/features/domain/entities";
import {
  SPENDING_CATEGORY_LABELS,
  type SpendingCategory,
} from "@/features/domain/categories";
import {
  formatMinorUnits,
  toBaseMinorUnits,
} from "@/features/domain/money";
import { ExpenseFormSheet } from "@/features/expenses/components/expense-form-sheet";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { calculateBalances } from "@/features/expenses/lib/expense-calculator";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";
import { useI18n } from "@/lib/i18n/i18n-provider";

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

function splitLabel(splitType: ExpenseSplitType, t: ReturnType<typeof useI18n>["t"]): string {
  return splitType === "equal"
    ? t("copy.equalSplit")
    : splitType === "exact"
      ? t("copy.customSplit")
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
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const localProfile = useLocalProfile(userId);
  const [dialog, setDialog] = useState<Expense | "new" | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);
  const { toast } = useToast();
  const { t } = useI18n();
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
              {t("copy.expenses")}
            </Heading>
            <p className="text-muted-foreground">
              {t("copy.trackSharedCosts")}
            </p>
          </div>
          {canEdit && (
            <Button variant="primary" onClick={() => setDialog("new")}>
              <Plus className="size-5" />
              {t("common.addExpense")}
            </Button>
          )}
        </div>
      )}

      {!embedded && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Summary label={t("copy.tripTotal")} value={formatMinorUnits(total, currency)} />
          <Summary
            label={t("copy.yourBalance")}
            value={formatMinorUnits(balances[userId] ?? 0n, currency)}
            detail={(balances[userId] ?? 0n) >= 0n ? t("copy.youAreOwed") : t("copy.youOwe")}
          />
        </div>
      )}

      {!embedded && Object.keys(balances).length > 1 && (
        <div className="rounded-2xl border bg-card p-5">
          <Heading level={3} className="text-base font-semibold">
            {t("copy.settlementSummary")}
          </Heading>
          <div className="mt-3 space-y-2">
            {Object.entries(balances).map(([memberId, balance]) => (
              <div key={memberId} className="flex justify-between text-sm">
                <span>{memberId === userId ? t("common.you") : (names.get(memberId) ?? memberId)}</span>
                <span className={balance >= 0n ? "text-success" : "text-destructive"}>
                  {balance >= 0n ? "receives" : t("copy.owes")}{" "}
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
              {t("copy.addFirstExpense")}
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
                          {t("copy.paidBy")} {payer.name} · {splitLabel(expense.splitType, t)}
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
                        aria-label={`${t("common.edit")} ${expense.description}`}
                        onClick={() => setDialog(expense)}
                      >
                        <Pencil className="size-5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t("copy.delete")} ${expense.description}`}
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
                        <p className="text-xs text-muted-foreground">{t("copy.splitDetails")}</p>
                        <p className="font-medium">
                          {splitLabel(expense.splitType, t)} · {shares.length || 1} traveler
                          {shares.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("copy.syncStatus")}</p>
                        <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          {t("copy.savedLocally")}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("copy.originalAmount")}</p>
                        <p className="font-mono font-semibold tabular-nums">
                          {formatMoney(expense.amountMinor, expense.currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("common.tripCurrency")}</p>
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

      <ExpenseFormSheet
        key={dialog === null ? "closed" : dialog === "new" ? "new" : dialog.id}
        open={dialog !== null}
        expense={dialog === "new" ? undefined : (dialog ?? undefined)}
        tripId={tripId}
        userId={userId}
        currency={currency}
        locationCurrency={locationCurrency}
        defaultCurrency={defaultCurrency}
        onClose={() => setDialog(null)}
        onError={(message) =>
          toast({ title: t("copy.unableSaveExpense"), description: message, variant: "error" })
        }
      />
      <ConfirmDialog
        open={deleteExpense !== null}
        onOpenChange={(open) => !open && setDeleteExpense(null)}
        title={t("copy.deleteExpense")}
        description={
          deleteExpense ? `Delete ${deleteExpense.description}? This cannot be undone.` : ""
        }
        confirmLabel={t("copy.delete")}
        onConfirm={() => {
          if (!deleteExpense) return;
          const expense = deleteExpense;
          setDeleteExpense(null);
          void expenseRepository
            .remove(expense.id)
            .then(() => toast({ title: t("errors.expenseDeleted"), variant: "success" }))
            .catch(() => toast({ title: t("copy.unableDeleteExpense"), variant: "error" }));
        }}
      />
    </section>
  );
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
