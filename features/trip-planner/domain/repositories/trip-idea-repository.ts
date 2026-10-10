import type { Trip } from "@/features/domain/entities";
import type {
  TripIdea,
  TripIdeaPriceCheck,
  TripIdeaEstimate,
  NewTripIdea,
} from "@/features/trip-planner/domain/trip-planner-types";

export type TripIdeaPatch = Partial<
  Omit<
    TripIdea,
    "id" | "createdAt" | "updatedAt" | "version" | "convertedToTripId" | "priceChecks" | "currency"
  >
>;

export interface TripIdeaRepository {
  list(): Promise<TripIdea[]>;
  getById(id: string): Promise<TripIdea | undefined>;
  watchAll(onChange: (ideas: TripIdea[]) => void): () => void;
  create(input: NewTripIdea): Promise<TripIdea>;
  updateIdea(id: string, patch: TripIdeaPatch): Promise<TripIdea>;
  addPriceCheck(ideaId: string, input: Omit<TripIdeaPriceCheck, "id">): Promise<TripIdea>;
  removePriceCheck(ideaId: string, priceCheckId: string): Promise<TripIdea>;
  updateEstimates(ideaId: string, estimates: TripIdeaEstimate[]): Promise<TripIdea>;
  remove(id: string): Promise<void>;
  convertToTrip(id: string): Promise<Trip>;
}
