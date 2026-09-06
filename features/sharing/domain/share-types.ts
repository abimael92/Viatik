/**
 * Social & Access Sharing domain entities.
 *
 * A `TripShareLink` is a high-entropy, read-only guest link a trip owner
 * generates so family back home can view live itinerary, map, and gallery data
 * without a Viatik account. Links are stored locally (offline-first, schema
 * v28) and synced to the remote `trip_share_links` table via the outbox so the
 * public `/share/[slug]` route can resolve them without authentication.
 */

export interface SharePermissions {
  /** Whether the guest may view the itinerary. */
  allowItinerary: boolean;
  /** Whether the guest may view the trip map. */
  allowMap: boolean;
  /** Whether the guest may view the photo gallery. */
  allowGallery: boolean;
}

export interface TripShareLink extends SharePermissions {
  id: string;
  tripId: string;
  /** High-entropy public token in the share URL (`/share/[slug]`). */
  slug: string;
  /** Optional human label, e.g. "Family link". */
  label: string | null;
  /** Which member generated the link (must be the trip owner). */
  createdBy: string;
  /** Soft-disable the link without deleting it (revokes guest access). */
  active: boolean;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  deletedAt: string | null;
}

/** Input used to create a link. The slug is minted inside the repository. */
export interface NewTripShareLink {
  tripId: string;
  createdBy: string;
  label?: string | null;
  /** All default to true; omit for an all-access link. */
  allowItinerary?: boolean;
  allowMap?: boolean;
  allowGallery?: boolean;
}

/** Storage-agnostic contract for reading/writing share links. */
export interface ShareLinkRepository {
  listByTrip(tripId: string): Promise<TripShareLink[]>;
  /** Live query: invokes `onChange` whenever the trip's links change. */
  watchByTrip(tripId: string, onChange: (links: TripShareLink[]) => void): () => void;
  getBySlug(slug: string): Promise<TripShareLink | undefined>;
  create(input: NewTripShareLink): Promise<TripShareLink>;
  update(
    id: string,
    patch: Partial<Omit<TripShareLink, "id" | "tripId" | "slug" | "createdBy">>,
  ): Promise<TripShareLink>;
  /** Soft delete — revokes access and removes the link from the UI. */
  remove(id: string): Promise<void>;
}

/** Read-only snapshot served to guests by the public `/share/[slug]` route. */
export interface SharedTripSnapshot {
  /** Slug-resolved share link (with active permission flags). */
  share: TripShareLink;
  name: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  coverImageUrl: string | null;
  activities: Array<{
    id: string;
    dayDate: string;
    title: string;
    description: string | null;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    category: string;
    startTime: string | null;
  }>;
  media: Array<{
    id: string;
    caption: string | null;
    takenAt: string | null;
    /** Signed (temporary) image URL rendered by the guest gallery. */
    url: string | null;
  }>;
}
