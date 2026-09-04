"use client";

import { Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
import type {
  Expense,
  ExpenseSplitType,
  ProfileSummary,
  TripMember,
} from "@/features/domain/entities";
import { decimalFromMinorUnits, formatMinorUnits, getCurrencyExponent, parseMinorUnits } from "@/features/domain/money";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { calculateBalances, calculateSplit } from "@/features/expenses/lib/expense-calculator";

export function ExpensePanel({
  tripId,
  userId,
  currency,
  canEdit = true,
  autoOpen = false,
  onAutoOpen,
}: {
  tripId: string;
  userId: string;
  currency: string;
  canEdit?: boolean;
  autoOpen?: boolean;
  onAutoOpen?: () => void;
}) {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [profiles] = useState<ProfileSummary[]>([]);
  const [dialog, setDialog] = useState<Expense | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
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
    let cancelled = false;
    Promise.all(
      (expenses ?? []).map(async (expense) => ({
        amountMinor: expense.amountMinor,
        paidBy: expense.paidBy,
        shares: await expenseRepository.listSharesByExpense(expense.id),
      }))
    ).then((items) => {
      if (!cancelled) setBalances(calculateBalances(items));
    });
    return () => {
      cancelled = true;
    };
  }, [expenses]);

  const total = useMemo(
    () => (expenses ?? []).reduce((sum, expense) => sum + expense.amountMinor, 0n),
    [expenses]
  );
  const names = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.fullName ?? "Traveler"])),
    [profiles]
  );

  return (
    <section className="space-y-6" aria-labelledby="expenses-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="expenses-heading" className="text-2xl font-bold">
            Expenses
          </h2>
          <p className="text-muted-foreground">Track shared costs and settle balances together.</p>
        </div>
        {canEdit && (
          <Button onClick={() => setDialog("new")}>
            <Plus className="size-4" />
            Add expense
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Summary label="Trip total" value={formatMinorUnits(total, currency)} />
        <Summary
          label="Your balance"
          value={formatMinorUnits(balances[userId] ?? 0n, currency)}
          detail={(balances[userId] ?? 0n) >= 0n ? "You are owed" : "You owe"}
        />
      </div>

      {Object.keys(balances).length > 1 && (
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="font-semibold">Settlement summary</h3>
          <div className="mt-3 space-y-2">
            {Object.entries(balances).map(([memberId, balance]) => (
              <div key={memberId} className="flex justify-between text-sm">
                <span>{memberId === userId ? "You" : (names.get(memberId) ?? memberId)}</span>
                <span className={balance >= 0n ? "text-success" : "text-destructive"}>
                  {balance >= 0n ? "receives" : "owes"} {formatMinorUnits(balance < 0n ? -balance : balance, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {expenses === null ? (
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      ) : expenses.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <ReceiptText className="mx-auto size-8 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">No expenses yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {canEdit ? "Add the first shared cost." : "No shared costs have been added yet."}
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-2xl border bg-card">
          {expenses.map((expense) => (
            <div key={expense.id} className="flex items-center gap-3 p-4">
              <div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                <ReceiptText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{expense.description}</p>
                <p className="text-xs text-muted-foreground">
                  Paid by{" "}
                  {expense.paidBy === userId ? "you" : (names.get(expense.paidBy) ?? "traveler")} ·{" "}
                  {expense.splitType} split
                </p>
              </div>
              <strong>{formatMinorUnits(expense.amountMinor, expense.currency)}</strong>
              {canEdit && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${expense.description}`}
                    onClick={() => setDialog(expense)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${expense.description}`}
                    onClick={() => {
                      if (window.confirm(`Delete ${expense.description}?`))
                        void expenseRepository
                          .remove(expense.id)
                          .catch(() => setError("Unable to delete expense."));
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <ExpenseDialog
        key={dialog === null ? "closed" : dialog === "new" ? "new" : dialog.id}
        open={dialog !== null}
        expense={dialog === "new" ? undefined : (dialog ?? undefined)}
        tripId={tripId}
        userId={userId}
        currency={currency}
        members={members}
        names={names}
        onClose={() => setDialog(null)}
        onError={setError}
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
  members,
  names,
  onClose,
  onError,
}: {
  open: boolean;
  expense?: Expense;
  tripId: string;
  userId: string;
  currency: string;
  members: TripMember[];
  names: Map<string, string>;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<ExpenseSplitType>(expense?.splitType ?? "equal");
  const [participantSelection, setParticipants] = useState<string[] | null>(null);
  const participants = participantSelection ?? members.map((member) => member.userId);
  const [shareInputs, setShareInputs] = useState<Map<string, string>>(new Map());

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
    const paidBy = String(data.get("paidBy"));
    try {
      const amountMinor = parseMinorUnits(String(data.get("amount")), currency);
      if (amountMinor <= 0n) throw new Error("Enter an amount greater than zero.");
      if (!participants.length) throw new Error("Select at least one participant.");
      const exactMinor =
        mode === "exact"
          ? Object.fromEntries(
              participants.map((id) => [id, parseMinorUnits(String(data.get(`share-${id}`)), currency)])
            )
          : undefined;
      const percentages =
        mode === "percentage"
          ? Object.fromEntries(participants.map((id) => [id, Number(data.get(`share-${id}`))]))
          : undefined;
      const shares = calculateSplit({
        totalMinor: amountMinor,
        payerId: paidBy,
        participants,
        mode,
        exactMinor,
        percentages,
      }).shares;
      if (expense) {
        await expenseRepository.update(expense.id, {
          description,
          amountMinor,
          paidBy,
          splitType: mode,
        });
        await expenseRepository.replaceShares(expense.id, shares);
      } else {
        await expenseRepository.create({
          id: crypto.randomUUID(),
          tripId,
          description,
          amountMinor,
          currency,
          paidBy,
          splitType: mode,
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
            label={`Amount (${currency})`}
            name="amount"
            type="number"
            min={getCurrencyExponent(currency) === 0 ? "1" : `0.${"0".repeat(getCurrencyExponent(currency) - 1)}1`}
            step={getCurrencyExponent(currency) === 0 ? "1" : `0.${"0".repeat(getCurrencyExponent(currency) - 1)}1`}
            defaultValue={expense ? decimalFromMinorUnits(expense.amountMinor, expense.currency) : ""}
            required
          />
          <div className="space-y-2">
            <Label htmlFor="paidBy">Paid by</Label>
            <select
              id="paidBy"
              name="paidBy"
              defaultValue={expense?.paidBy ?? userId}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {members.map((member) => (
                <option key={member.id} value={member.userId}>
                  {member.userId === userId ? "You" : (names.get(member.userId) ?? member.userId)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="splitType">Split method</Label>
            <select
              id="splitType"
              value={mode}
              onChange={(event) => setMode(event.target.value as ExpenseSplitType)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="equal">Equal</option>
              <option value="exact">Exact</option>
              <option value="percentage">Percentage</option>
            </select>
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Participants</legend>
            {members.map((member) => {
              const selected = participants.includes(member.userId);
              const shareValue = shareInputs.get(member.userId) ?? "";
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
                    aria-label={`Include ${names.get(member.userId) ?? member.userId}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {member.userId === userId ? "You" : (names.get(member.userId) ?? member.userId)}
                  </span>
                  {mode === "exact" && (
                    <input
                      name={`share-${member.userId}`}
                      type="number"
                      min="0"
                      step={getCurrencyExponent(currency) === 0 ? "1" : `0.${"0".repeat(getCurrencyExponent(currency) - 1)}1`}
                      value={shareValue}
                      onChange={(event) =>
                        setShareInputs((current) =>
                          new Map(current).set(member.userId, event.target.value)
                        )
                      }
                      className="h-9 w-24 rounded-md border bg-background px-2 text-right text-sm"
                      disabled={!selected}
                    />
                  )}
                  {mode === "percentage" && (
                    <input
                      name={`share-${member.userId}`}
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={shareValue}
                      onChange={(event) =>
                        setShareInputs((current) =>
                          new Map(current).set(member.userId, event.target.value)
                        )
                      }
                      className="h-9 w-24 rounded-md border bg-background px-2 text-right text-sm"
                      disabled={!selected}
                    />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {mode === "exact" ? currency : "%"}
                  </span>
                </div>
              );
            })}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
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
function Summary({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
