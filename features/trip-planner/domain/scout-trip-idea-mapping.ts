import { getCurrencyExponent, MAX_MINOR_UNITS, type MinorUnits } from "@/features/domain/money";
import { buildScoutIdeaBudget } from "@/features/trip-planner/domain/scout-idea-plan";
import type {
  NewTripIdea,
  SavingsCadence,
} from "@/features/trip-planner/domain/trip-planner-types";
import type { ScoutTripIdeaSuggestion } from "@/features/trip-planner/domain/scout-trip-ideas-schema";

function toMinorUnits(wholeCurrencyUnits: number, currency: string): MinorUnits {
  const amount = BigInt(wholeCurrencyUnits) * 10n ** BigInt(getCurrencyExponent(currency));
  if (amount <= 0n || amount > MAX_MINOR_UNITS) {
    throw new RangeError("Scout's estimate is outside the supported amount range.");
  }
  return amount;
}

export function mapScoutIdeaToTripIdea({
  suggestion,
  vibe,
  crewSize,
  currency,
  cadence,
}: {
  suggestion: ScoutTripIdeaSuggestion;
  vibe: string;
  crewSize: number;
  currency: string;
  cadence: Extract<SavingsCadence, "weekly" | "monthly">;
}): {
  idea: NewTripIdea;
  cadence: SavingsCadence;
  flightPerPersonMinor: MinorUnits;
  dailyPerPersonMinor: MinorUnits;
} {
  const flightPerPersonMinor = toMinorUnits(suggestion.estimated_flight_cost_per_person, currency);
  const dailyPerPersonMinor = toMinorUnits(suggestion.estimated_daily_budget_per_person, currency);
  const budget = buildScoutIdeaBudget({ suggestion, crewSize, currency });
  const targetTripCostMinor = budget.grandTotalMinor;
  if (targetTripCostMinor > MAX_MINOR_UNITS) {
    throw new RangeError("Scout's total estimate is outside the supported amount range.");
  }

  const foodMinor = (budget.dailyTotalMinor * 3n) / 5n;

  return {
    flightPerPersonMinor,
    dailyPerPersonMinor,
    cadence,
    idea: {
      id: crypto.randomUUID(),
      name: `${suggestion.destination} - ${suggestion.best_season}`.slice(0, 120),
      destination: suggestion.destination,
      durationDays: suggestion.ideal_duration_days,
      adultCount: crewSize,
      childCount: 0,
      currency,
      interests: [vibe.trim().slice(0, 60)],
      notes: `${suggestion.scout_pitch}\n\nBest season: ${suggestion.best_season}`.slice(0, 500),
      targetTripCostMinor,
      categoryEstimates: [
        { category: "transport", amountMinor: budget.flightTotalMinor },
        { category: "stay", amountMinor: budget.stay.hotelTotalMinor },
        { category: "food", amountMinor: foodMinor },
        { category: "activities", amountMinor: budget.dailyTotalMinor - foodMinor },
      ],
    },
  };
}
