"use client";

import { useState, type FormEvent } from "react";

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
import { settlementRepository } from "@/features/expenses/data/dexie-settlement-repository";
import type { PairwiseDebt } from "@/features/expenses/lib/trip-balances";
import { decimalFromMinorUnits, formatMinorUnits, getCurrencyExponent, parseMinorUnits } from "@/features/domain/money";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

export function SettleUpSheet({
  open,
  tripId,
  userId,
  debt,
  payerName,
  receiverName,
  onClose,
  onError,
  onSaved,
}: {
  open: boolean;
  tripId: string;
  userId: string;
  debt: PairwiseDebt | null;
  payerName: string;
  receiverName: string;
  onClose: () => void;
  onError: (message: string) => void;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const currency = debt?.currency ?? "USD";
  const defaultAmount = debt ? decimalFromMinorUnits(debt.amountMinor, currency) : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!debt) return;
    setSaving(true);
    const data = new FormData(event.currentTarget);
    try {
      const amountMinor = parseMinorUnits(String(data.get("amount") || defaultAmount), currency);
      if (amountMinor <= 0n) throw new Error("Enter an amount greater than zero.");
      if (amountMinor > debt.amountMinor) {
        throw new Error(`That is more than the remaining ${formatMinorUnits(debt.amountMinor, currency)} ${currency}.`);
      }
      await settlementRepository.create({
        id: crypto.randomUUID(),
        tripId,
        fromUserId: debt.payerId,
        toUserId: debt.receiverId,
        amountMinor,
        currency,
        date: String(data.get("date") || new Date().toISOString().slice(0, 10)),
        createdBy: userId,
        receiverName,
      });
      onSaved?.();
      onClose();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to save settlement.");
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
          <DialogTitle>{t("copy.settleDebt")}</DialogTitle>
          <DialogDescription>
            {payerName} {t("copy.owes")} {receiverName}{" "}
            {debt ? `${formatMinorUnits(debt.amountMinor, currency)} ${currency}` : ""}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settlement-amount">{t("copy.settleAmount")}</Label>
            <Input
              id="settlement-amount"
              name="amount"
              type="number"
              min={getCurrencyExponent(currency) === 0 ? "1" : `0.${"0".repeat(Math.max(getCurrencyExponent(currency) - 1, 0))}1`}
              step={getCurrencyExponent(currency) === 0 ? "1" : `0.${"0".repeat(Math.max(getCurrencyExponent(currency) - 1, 0))}1`}
              defaultValue={defaultAmount}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settlement-date">{t("copy.date")}</Label>
            <Input
              id="settlement-date"
              name="date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={saving || !debt}>
              {saving ? t("settings.saving") : t("copy.logSettlement")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
