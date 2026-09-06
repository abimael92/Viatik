"use client";

import { ArrowLeftRight, Check, Landmark, Percent, Receipt, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Trip } from "@/features/domain/entities";
import { currencyRateRepository } from "@/features/finance/data/dexie-currency-rate-repository";
import type { CurrencyCode } from "@/features/finance/domain/currency-types";
import {
  QUICK_AMOUNTS,
  SUPPORTED_CURRENCIES,
  calculateTipBreakdown,
  convertMinorUnits,
  formatAmount,
  getTipCustoms,
  lookupRate,
  parseAmount,
} from "@/features/finance/lib/currency-converter";
import { cn } from "@/lib/utils";

const TIP_PRESETS = [0, 10, 12, 15, 18, 20];

/**
 * Offline Currency Converter & Tip Calculator. Instantly converts amounts using
 * cached offline exchange rates, computes quick tip/tax splits, and surfaces
 * destination-specific tipping etiquette. Fully offline-first via the local
 * `currencyRates` cache (Dexie schema v27).
 */
export function CurrencyConverterView({ trip }: { trip: Trip }) {
  const baseCurrency = (trip.baseCurrency || "USD").toUpperCase() as CurrencyCode;
  const [from, setFrom] = useState<CurrencyCode>(
    SUPPORTED_CURRENCIES.includes(baseCurrency) ? baseCurrency : "USD",
  );
  const [to, setTo] = useState<CurrencyCode>(baseCurrency === "USD" ? "EUR" : "USD");
  const customs = useMemo(() => getTipCustoms(trip.destination), [trip.destination]);
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [rateSaved, setRateSaved] = useState(false);
  const [tipPercent, setTipPercent] = useState(customs.defaultTipPercent);
  const [taxPercent, setTaxPercent] = useState(0);
  const [people, setPeople] = useState("1");

  // Seed the offline rate cache once on first open.
  useEffect(() => {
    void currencyRateRepository.ensureDefaults();
  }, []);

  // Resolve the from→to rate from the cache, falling back to built-in defaults.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await currencyRateRepository.getRate(from, to);
      if (cancelled) return;
      setRate(String(cached ? cached.rate : lookupRate(from, to)));
      setRateSaved(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const rateNum = Number(rate);
  const rateValid = Number.isFinite(rateNum) && rateNum > 0;

  const parsed = useMemo(() => {
    if (!amount.trim()) return null;
    try {
      return parseAmount(amount, from);
    } catch {
      return null;
    }
  }, [amount, from]);

  const converted = useMemo(
    () => (parsed !== null && rateValid ? convertMinorUnits(parsed, from, rateNum, to) : null),
    [parsed, from, rateNum, to, rateValid],
  );

  const breakdown = useMemo(
    () =>
      parsed !== null
        ? calculateTipBreakdown({
            subtotalMinor: parsed,
            currency: from,
            tipPercent,
            taxPercent,
            people: Number(people) || 1,
          })
        : null,
    [parsed, from, tipPercent, taxPercent, people],
  );

  const totalConverted = useMemo(
    () => (breakdown && rateValid ? convertMinorUnits(breakdown.totalMinor, from, rateNum, to) : null),
    [breakdown, from, rateNum, to, rateValid],
  );

  const handleSwap = () => {
    setFrom(to);
    setTo(from);
    setRateSaved(false);
  };

  const handleSaveRate = async () => {
    if (!rateValid) return;
    await currencyRateRepository.saveRate(from, to, rateNum);
    setRateSaved(true);
  };

  return (
    <section aria-labelledby="converter-heading" className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <ArrowLeftRight className="size-5" aria-hidden />
        </span>
        <div>
          <Heading level={2} id="converter-heading" className="text-xl font-bold">
            Currency &amp; tips
          </Heading>
          <p className="text-sm text-muted-foreground">
            Convert on the go with offline rates and split tips in seconds.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Converter */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Landmark className="size-5 text-primary" /> Currency converter
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="converter-from-amount">Amount</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="converter-from-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  className="flex-1"
                />
                <CurrencySelect value={from} onChange={setFrom} label="From currency" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <Button type="button" variant="outline" size="sm" onClick={handleSwap} aria-label="Swap currencies">
                <ArrowLeftRight className="size-4" />
              </Button>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div>
              <Label htmlFor="converter-to-amount">Converted</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="converter-to-amount"
                  value={converted !== null ? formatAmount(converted, to) : ""}
                  readOnly
                  className="flex-1 font-mono font-semibold"
                  aria-label={`Converted amount in ${to}`}
                />
                <CurrencySelect value={to} onChange={setTo} label="To currency" />
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-muted p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor="converter-rate">Rate · 1 {from} =</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Input
                    id="converter-rate"
                    inputMode="decimal"
                    value={rate}
                    onChange={(event) => setRate(event.target.value)}
                    className="w-32 font-mono"
                  />
                  <span className="text-sm font-semibold text-muted-foreground">{to}</span>
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => void handleSaveRate()} disabled={!rateValid}>
                {rateSaved ? <Check className="size-4" /> : null}
                {rateSaved ? "Saved" : "Save rate"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Offline default shown — update it and tap Save to keep it accurate.
            </p>
          </div>

          <div className="mt-4">
            <Label>Quick amounts ({from})</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount(String(value))}
                  className="rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tip calculator */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Receipt className="size-5 text-primary" /> Tip &amp; split calculator
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <Label>Tip</Label>
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
                    aria-label="Custom tip percent"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="converter-tax">Tax %</Label>
                <Input
                  id="converter-tax"
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxPercent}
                  onChange={(event) => setTaxPercent(Number(event.target.value) || 0)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="converter-people">Split between</Label>
                <div className="flex items-center gap-2">
                  <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <Input
                    id="converter-people"
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
                <BreakdownRow label="Subtotal" value={formatAmount(breakdown.subtotalMinor, from)} />
                <BreakdownRow
                  label={`Tip (${breakdown.tipPercent}%)`}
                  value={formatAmount(breakdown.tipMinor, from)}
                />
                {breakdown.taxPercent > 0 && (
                  <BreakdownRow
                    label={`Tax (${breakdown.taxPercent}%)`}
                    value={formatAmount(breakdown.taxMinor, from)}
                  />
                )}
                <div className="mt-2 border-t pt-2">
                  <BreakdownRow label="Total" value={formatAmount(breakdown.totalMinor, from)} strong />
                  <p className="mt-1 text-right text-xs text-muted-foreground">
                    ≈ {formatAmount(breakdown.perPersonMinor, from)} per person
                    {totalConverted !== null && (
                      <span> · ≈ {formatAmount(totalConverted, to)} total</span>
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Enter an amount above to see the tip, tax, and split breakdown.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Etiquette */}
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
          <span className="font-semibold text-card-foreground">Taxes:</span> {customs.taxNote}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-semibold text-card-foreground">Paying:</span> {customs.roundingNote}
        </p>
      </div>
    </section>
  );
}

function CurrencySelect({
  value,
  onChange,
  label,
}: {
  value: CurrencyCode;
  onChange: (value: CurrencyCode) => void;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as CurrencyCode)}
      aria-label={label}
      className="h-10 w-24 rounded-md border bg-background px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {SUPPORTED_CURRENCIES.map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </select>
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
