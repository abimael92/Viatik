"use client";

import { ArrowLeftRight, Check, Landmark } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Trip } from "@/features/domain/entities";
import { currencyRateRepository } from "@/features/finance/data/dexie-currency-rate-repository";
import type { CurrencyCode } from "@/features/finance/domain/currency-types";
import {
  QUICK_AMOUNTS,
  SUPPORTED_CURRENCIES,
  convertMinorUnits,
  formatAmount,
  lookupRate,
  parseAmount,
} from "@/features/finance/lib/currency-converter";

/**
 * Standalone offline currency converter. Instantly converts amounts using
 * cached offline exchange rates and lets the user persist a custom rate for a
 * pair. Fully independent from the tip/split calculator.
 */
export function CurrencyConverter({ trip }: { trip: Trip }) {
  const baseCurrency = (trip.baseCurrency || "USD").toUpperCase() as CurrencyCode;
  const [from, setFrom] = useState<CurrencyCode>(
    SUPPORTED_CURRENCIES.includes(baseCurrency) ? baseCurrency : "USD",
  );
  const [to, setTo] = useState<CurrencyCode>(baseCurrency === "USD" ? "EUR" : "USD");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [rateSaved, setRateSaved] = useState(false);

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
