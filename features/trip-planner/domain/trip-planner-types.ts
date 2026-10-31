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

export interface TripIdeaFlightRouteLeg {
  from: string;
  to: string;
  approxDurationMinutes: number;
  layoverAfterMinutes: number;
}

/** Estimated routing only — never a schedule, airline, or live price. */
export interface TripIdeaFlightRoute {
  legs: TripIdeaFlightRouteLeg[];
  arrivesSameDate: boolean;
  isEstimate: true;
}

/** Timing the traveler picked in Scout; drives how the plan is derived. */
export type IdeaTiming = "asap" | "month" | "cheapest" | "dates";
export type IdeaTripLength = "any" | "weekend" | "week" | "two-weeks";
export type IdeaSavingsCadence = Extract<SavingsCadence, "weekly" | "monthly">;

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
  /** Selected contact ids when the crew was picked from contacts (≤19). */
  travelerContactIds: string[];
  flightRoute: TripIdeaFlightRoute | null;
  currency: CurrencyCode;
  interests: string[];
  notes: string;
  targetTripCostMinor: MinorUnits | null;
  categoryEstimates: TripIdeaEstimate[];
  /** Per-traveler flight estimate from Scout. */
  flightCostPerPersonMinor: MinorUnits | null;
  /** Hotel rate per night for the whole group. */
  hotelPerNightMinor: MinorUnits | null;
  /** Vacation-rental rate per night for the whole group. */
  altStayPerNightMinor: MinorUnits | null;
  /** Daily spend per traveler, excluding lodging. */
  dailyPerPersonMinor: MinorUnits | null;
  /** Scout's savings pace; null on ideas created before the wizard stored it. */
  savingsCapacityMinor: MinorUnits | null;
  savingsCadence: IdeaSavingsCadence | null;
  /** Scout's timing answer; null when the idea was written by hand. */
  timing: IdeaTiming | null;
  tripLength: IdeaTripLength | null;
  constraints: string;
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
  travelerContactIds?: string[];
  flightRoute?: TripIdeaFlightRoute | null;
  currency: CurrencyCode;
  interests?: string[];
  notes?: string;
  targetTripCostMinor?: MinorUnits | null;
  categoryEstimates?: TripIdeaEstimate[];
  flightCostPerPersonMinor?: MinorUnits | null;
  hotelPerNightMinor?: MinorUnits | null;
  altStayPerNightMinor?: MinorUnits | null;
  dailyPerPersonMinor?: MinorUnits | null;
  savingsCapacityMinor?: MinorUnits | null;
  savingsCadence?: IdeaSavingsCadence | null;
  timing?: IdeaTiming | null;
  tripLength?: IdeaTripLength | null;
  constraints?: string;
}

export interface SavingsSuggestionInput {
  tripStartDate: string | null;
  targetTripCostMinor: MinorUnits | null;
  currentSavingsMinor: MinorUnits;
  cadence?: SavingsCadence;
  /** Days before departure to book flights; defaults to the short-haul window. */
  bookingWindowDays?: number;
  today?: Date;
}

export type SavingsSuggestion =
  | { status: "missing-input"; missing: Array<"tripStartDate" | "targetTripCostMinor"> }
  | {
      status: "due-now";
      amountMinor: MinorUnits;
      /** ISO date the goal is reached (today) — kept for a uniform timeline. */
      readyOn: string;
      /** ISO date flights should be bought by, never in the past. */
      bookBy: string;
    }
  | {
      status: "scheduled";
      cadence: SavingsCadence;
      periods: number;
      contributionMinor: MinorUnits;
      /** ISO date the goal is reached at this pace. */
      readyOn: string;
      /** ISO date flights should be bought by, never in the past. */
      bookBy: string;
    };
