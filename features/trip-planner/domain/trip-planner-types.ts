import type { SpendingCategory } from "@/features/domain/categories";
import type { CurrencyCode, MinorUnits } from "@/features/domain/money";

export type SavingsCadence = "monthly" | "weekly" | "once";

export interface TripIdeaEstimate {
  category: SpendingCategory;
  amountMinor: MinorUnits;
}

export interface TripIdeaPriceCheck {
  id: string;
  category: SpendingCategory;
  amountMinor: MinorUnits;
  source: string;
  checkedAt: string;
}

export interface TripIdea {
  id: string;
  name: string;
  origin: string;
  destination: string;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  timeZone: string | null;
  startDate: string | null;
  endDate: string | null;
  targetMonth: string | null;
  durationDays: number | null;
  adultCount: number;
  childCount: number;
  currency: CurrencyCode;
  interests: string[];
  notes: string;
  targetTripCostMinor: MinorUnits | null;
  categoryEstimates: TripIdeaEstimate[];
  priceChecks: TripIdeaPriceCheck[];
  convertedToTripId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface TripSavingsPlan {
  id: string;
  tripIdeaId: string;
  currentSavingsMinor: MinorUnits;
  cadence: SavingsCadence;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface NewTripIdea {
  id: string;
  name: string;
  origin?: string;
  destination: string;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timeZone?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  targetMonth?: string | null;
  durationDays?: number | null;
  adultCount?: number;
  childCount?: number;
  currency: CurrencyCode;
  interests?: string[];
  notes?: string;
  targetTripCostMinor?: MinorUnits | null;
  categoryEstimates?: TripIdeaEstimate[];
}

export interface SavingsSuggestionInput {
  tripStartDate: string | null;
  targetTripCostMinor: MinorUnits | null;
  currentSavingsMinor: MinorUnits;
  cadence?: SavingsCadence;
  today?: Date;
}

export type SavingsSuggestion =
  | { status: "missing-input"; missing: Array<"tripStartDate" | "targetTripCostMinor"> }
  | { status: "due-now"; amountMinor: MinorUnits }
  | {
      status: "scheduled";
      cadence: SavingsCadence;
      periods: number;
      contributionMinor: MinorUnits;
    };
