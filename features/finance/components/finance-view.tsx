"use client";

import type { Trip } from "@/features/domain/entities";
import { formatMinorUnits } from "@/features/domain/money";
import { FinanceDashboard } from "@/features/finance/components/finance-dashboard";
import { CurrencyCard } from "@/features/finance/components/money-dashboard";
import { useTripSpending } from "@/features/finance/lib/use-trip-spending";
import { useI18n } from "@/lib/i18n/i18n-provider";

/**
 * Finance tab of the money hub. Shows the trip total, the destination currency
 * & rate card, and the detailed personal / group finance views. The currency
 * converter and tip & split calculator now live on the Budget tab.
 */
export function FinanceView({
  tripId,
  userId,
  trip,
  days,
  canEdit,
}: {
  tripId: string;
  userId: string;
  trip: Trip;
  days: string[];
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const baseCurrency = trip.baseCurrency || "USD";
  const { totalSpent } = useTripSpending(tripId, baseCurrency);

  return (
    <div className="space-y-6">
      {/* Trip total — moved here from the Budget hero */}
      <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
        <p className="text-sm font-semibold text-muted-foreground">{t("copy.tripTotal")}</p>
        <p className="font-mono text-2xl font-bold tabular-nums">{formatMinorUnits(totalSpent, baseCurrency)}</p>
      </div>

      <CurrencyCard trip={trip} baseCurrency={baseCurrency} />

      {/*
        Category envelopes (temporarily disabled).
        <CategoryEnvelopes tripId={tripId} userId={userId} baseCurrency={baseCurrency} canEdit={canEdit} />
      */}

      <FinanceDashboard tripId={tripId} userId={userId} trip={trip} days={days} canEdit={canEdit} />
    </div>
  );
}
