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

/** Title the user picks when an idea becomes a real trip. */
export type ConvertTripIdeaOptions = {
  name?: string;
};

/** What happens to the trip when an idea is set back to an idea. */
export type RevertTripIdeaOptions = {
  /** Soft-delete the trip created from the idea instead of only unlinking it. */
  deleteTrip: boolean;
};

export interface TripIdeaRepository {
  list(): Promise<TripIdea[]>;
  getById(id: string): Promise<TripIdea | undefined>;
  /** The idea that was converted into this trip, if any. */
  getByTripId(tripId: string): Promise<TripIdea | undefined>;
  watchAll(onChange: (ideas: TripIdea[]) => void): () => void;
  watchByTripId(tripId: string, onChange: (idea: TripIdea | undefined) => void): () => void;
  create(input: NewTripIdea): Promise<TripIdea>;
  updateIdea(id: string, patch: TripIdeaPatch): Promise<TripIdea>;
  addPriceCheck(ideaId: string, input: Omit<TripIdeaPriceCheck, "id">): Promise<TripIdea>;
  removePriceCheck(ideaId: string, priceCheckId: string): Promise<TripIdea>;
  updateEstimates(ideaId: string, estimates: TripIdeaEstimate[]): Promise<TripIdea>;
  remove(id: string): Promise<void>;
  convertToTrip(id: string, options?: ConvertTripIdeaOptions): Promise<Trip>;
  revertToIdea(id: string, options: RevertTripIdeaOptions): Promise<TripIdea>;
  /**
   * Move a trip back to the wishlist. Reuses the idea that created the trip when
   * one exists, otherwise creates a new idea from the trip itself.
   */
  sendTripBackToIdea(tripId: string, options: RevertTripIdeaOptions): Promise<TripIdea>;
}
