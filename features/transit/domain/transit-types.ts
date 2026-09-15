/**
 * Live Transit & Logistics domain entities.
 *
 * `TransitSegment` tracks a single flight or train leg on a trip — carrier,
 * flight/train number, gate/terminal/platform, and real-time status. Segments
 * are stored locally (device-local, like `packingItems`/`polls`) so logistics
 * stay available offline; live status is fetched on demand and cached onto the
 * segment itself with graceful fallback when offline or when a provider has no
 * data.
 */

export type TransitMode = "flight" | "train";

export type TransitStatusState =
  | "scheduled"
  | "boarding"
  | "delayed"
  | "cancelled"
  | "departed"
  | "landed"
  | "arrived";

export interface TransitSegment {
  id: string;
  tripId: string;
  mode: TransitMode;
  /** ISO date (`yyyy-mm-dd`) the segment is scheduled on — drives itinerary placement. */
  dayDate: string;
  /** Carrier name, e.g. "Delta", "Amtrak". */
  carrier: string;
  /** IATA-style carrier code, e.g. "DL". */
  carrierCode: string | null;
  /** Flight or train number, e.g. "1284". */
  number: string;
  /** Airport gate or train platform. */
  gate: string | null;
  /** Airport terminal. */
  terminal: string | null;
  /** Train platform (alternative to `gate`). */
  platform: string | null;
  origin: string | null;
  destination: string | null;
  /** ISO datetime of scheduled departure. */
  scheduledDeparture: string;
  /** ISO datetime of scheduled arrival. */
  scheduledArrival: string | null;
  /** Current status state (from live data, cache, or default). */
  status: TransitStatusState;
  /** Human-readable status message, e.g. "Gate changed to B12". */
  statusMessage: string | null;
  /** ISO datetime of actual departure (set once departed). */
  actualDeparture: string | null;
  /** ISO datetime of actual arrival (set once arrived/landed). */
  actualArrival: string | null;
  /** ISO datetime of estimated departure (live-adjusted). */
  estimatedDeparture: string | null;
  /** ISO datetime of estimated arrival (live-adjusted). */
  estimatedArrival: string | null;
  /** Delay in minutes versus the published schedule (>= 0). */
  delayMinutes: number | null;
  ticketImage?: Blob | null;
  ticketImageName?: string | null;
  bookingReference?: string | null;
  createdBy: string;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  deletedAt: string | null;
}

/** Input used to create a transit segment. */
export interface NewTransitSegment {
  tripId: string;
  mode: TransitMode;
  dayDate: string;
  carrier: string;
  carrierCode?: string | null;
  number: string;
  gate?: string | null;
  terminal?: string | null;
  platform?: string | null;
  origin?: string | null;
  destination?: string | null;
  scheduledDeparture: string;
  scheduledArrival?: string | null;
  ticketImage?: Blob | null;
  ticketImageName?: string | null;
  bookingReference?: string | null;
  createdBy: string;
}

/** Normalized live status returned by a provider (before applying to a segment). */
export interface TransitStatusUpdate {
  status: TransitStatusState;
  statusMessage: string | null;
  estimatedDeparture: string | null;
  estimatedArrival: string | null;
  actualDeparture?: string | null;
  actualArrival?: string | null;
  delayMinutes: number | null;
}

/** Result of a status fetch: how the data was sourced. */
export type TransitStatusSource = "live" | "cache" | "fallback";

export interface TransitFetchResult {
  segment: TransitSegment;
  source: TransitStatusSource;
}

/** A source of real-time transit status (injectable for tests). */
export interface TransitStatusProvider {
  fetchStatus(segment: TransitSegment): Promise<TransitStatusUpdate | null>;
}

/** Offline cache for the last-known status of a segment. */
export interface TransitStatusCache {
  getCached(segmentId: string): Promise<TransitStatusUpdate | undefined>;
  save(segmentId: string, update: TransitStatusUpdate): Promise<void>;
}

/** Storage-agnostic contract for reading/writing transit segments. */
export interface TransitRepository {
  listByTrip(tripId: string): Promise<TransitSegment[]>;
  listByDay(tripId: string, dayDate: string): Promise<TransitSegment[]>;
  /** Live query: invokes `onChange` whenever the trip's segments change. */
  watchByTrip(tripId: string, onChange: (segments: TransitSegment[]) => void): () => void;
  create(input: NewTransitSegment): Promise<TransitSegment>;
  update(
    id: string,
    patch: Partial<Omit<TransitSegment, "id" | "tripId" | "createdBy">>,
  ): Promise<TransitSegment>;
  /** Soft delete — removes the leg from the itinerary. */
  remove(id: string): Promise<void>;
}

/** Visual metadata per status state (label + badge tone). */
export const TRANSIT_STATUS_META: Record<
  TransitStatusState,
  { label: string; tone: "default" | "warning" | "destructive" | "success" | "muted" }
> = {
  scheduled: { label: "Scheduled", tone: "muted" },
  boarding: { label: "Boarding", tone: "warning" },
  delayed: { label: "Delayed", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "destructive" },
  departed: { label: "Departed", tone: "success" },
  landed: { label: "Landed", tone: "success" },
  arrived: { label: "Arrived", tone: "success" },
};

/** Minutes before scheduled departure to suggest "boarding" for flights. */
export const BOARDING_WINDOW_MINUTES = 45;
