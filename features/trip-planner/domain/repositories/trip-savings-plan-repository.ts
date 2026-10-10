import type {
  SavingsCadence,
  TripSavingsPlan,
} from "@/features/trip-planner/domain/trip-planner-types";

export interface NewTripSavingsPlan {
  id: string;
  tripIdeaId: string;
  currentSavingsMinor: bigint;
  cadence?: SavingsCadence;
}

export interface TripSavingsPlanRepository {
  getByIdea(tripIdeaId: string): Promise<TripSavingsPlan | undefined>;
  watchByIdea(
    tripIdeaId: string,
    onChange: (plan: TripSavingsPlan | undefined) => void
  ): () => void;
  upsert(input: NewTripSavingsPlan): Promise<TripSavingsPlan>;
  updatePlan(
    id: string,
    patch: Partial<Pick<TripSavingsPlan, "currentSavingsMinor" | "cadence">>
  ): Promise<TripSavingsPlan>;
  removeByIdea(tripIdeaId: string): Promise<void>;
}
