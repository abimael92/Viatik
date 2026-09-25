"use client";

import { Percent, Receipt, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Trip } from "@/features/domain/entities";
import type { CurrencyCode } from "@/features/finance/domain/currency-types";
import {
  SUPPORTED_CURRENCIES,
  calculateTipBreakdown,
  formatAmount,
  getTipCustoms,
  parseAmount,
} from "@/features/finance/lib/currency-converter";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const TIP_PRESETS = [0, 10, 12, 15, 18, 20];

/**
 * Standalone offline tip & split calculator. Figures the tip, tax, and
 * per-person split for a subtotal in a single currency of your choosing, and
 * surfaces destination-specific tipping etiquette. Fully independent from the
 * currency converter.
 */
export function TipSplitCalculator({ trip }: { trip: Trip }) {
  const { t } = useI18n();
  const baseCurrency = (trip.baseCurrency || "USD").toUpperCase() as CurrencyCode;
  const customs = useMemo(() => getTipCustoms(trip.destination), [trip.destination]);
  const [currency, setCurrency] = useState<CurrencyCode>(
    SUPPORTED_CURRENCIES.includes(baseCurrency) ? baseCurrency : "USD",
  );
  const [amount, setAmount] = useState("");
  const [tipPercent, setTipPercent] = useState(customs.defaultTipPercent);
  const [taxPercent, setTaxPercent] = useState(0);
  const [people, setPeople] = useState("1");

  const parsed = useMemo(() => {
    if (!amount.trim()) return null;
    try {
      return parseAmount(amount, currency);
    } catch {
      return null;
    }
  }, [amount, currency]);

  const breakdown = useMemo(
    () =>
      parsed !== null
        ? calculateTipBreakdown({
            subtotalMinor: parsed,
            currency,
            tipPercent,
            taxPercent,
            people: Number(people) || 1,
          })
        : null,
    [parsed, currency, tipPercent, taxPercent, people],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <Receipt className="size-5 text-primary" /> {t("copy.tipSplitCalculator")}
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="tip-amount">{t("copy.subtotal")}</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="tip-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="flex-1"
              />
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
                aria-label={t("common.currency")}
                className="h-10 w-24 rounded-md border bg-background px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SUPPORTED_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>{t("copy.tip")}</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TIP_PRESETS.map((percent) => (
                <button
                  key={percent}
                  type="button"
                  onClick={() => setTipPercent(percent)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    tipPercent === percent
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:border-primary/50 hover:bg-primary/10",
                  )}
                >
                  {percent}%
                </button>
              ))}
              <div className="flex items-center gap-1 rounded-md border px-2">
                <Percent className="size-4 text-muted-foreground" aria-hidden />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={tipPercent}
                  onChange={(event) => setTipPercent(Number(event.target.value) || 0)}
                  className="h-9 w-16 border-0 p-0 text-center font-semibold focus-visible:ring-0"
                  aria-label={t("copy.customTipPercent")}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tip-tax">{t("copy.taxPercent")}</Label>
              <Input
                id="tip-tax"
                type="number"
                min="0"
                step="0.01"
                value={taxPercent}
                onChange={(event) => setTaxPercent(Number(event.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tip-people">{t("copy.splitBetween")}</Label>
              <div className="flex items-center gap-2">
                <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <Input
                  id="tip-people"
                  type="number"
                  min="1"
                  value={people}
                  onChange={(event) => setPeople(event.target.value)}
                  placeholder="1"
                />
              </div>
            </div>
          </div>

          {breakdown ? (
            <div className="rounded-lg bg-muted p-4">
              <BreakdownRow label={t("copy.subtotal")} value={formatAmount(breakdown.subtotalMinor, currency)} />
              <BreakdownRow
                label={`${t("copy.tip")} (${breakdown.tipPercent}%)`}
                value={formatAmount(breakdown.tipMinor, currency)}
              />
              {breakdown.taxPercent > 0 && (
                <BreakdownRow
                  label={`Tax (${breakdown.taxPercent}%)`}
                  value={formatAmount(breakdown.taxMinor, currency)}
                />
              )}
              <div className="mt-2 border-t pt-2">
                <BreakdownRow label={t("copy.total")} value={formatAmount(breakdown.totalMinor, currency)} strong />
                <p className="mt-1 text-right text-xs text-muted-foreground">
                  ≈ {formatAmount(breakdown.perPersonMinor, currency)} per person
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("copy.tipEmpty")}
            </p>
          )}
        </div>
      </div>

      {/* Destination tipping etiquette */}
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <span className="text-lg leading-none" aria-hidden>{customs.flag}</span>
          Tipping etiquette — {customs.destination}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="default">Expected: {customs.expectedTip}</Badge>
          <Badge variant={customs.serviceIncluded ? "success" : "muted"}>
            {customs.serviceIncluded ? "Service included" : "Service not included"}
          </Badge>
        </div>
        <p className="mt-3 text-sm text-card-foreground">{customs.tipGuide}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-semibold text-card-foreground">{t("copy.taxes")}</span> {customs.taxNote}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-semibold text-card-foreground">{t("copy.paying")}</span> {customs.roundingNote}
        </p>
      </div>
    </div>
  );
}

function BreakdownRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-sm tabular-nums", strong ? "font-bold text-foreground" : "")}>
        {value}
      </span>
    </div>
  );
}
