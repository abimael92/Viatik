import type { ConnectionDirection, ConnectionSnapshot, ConnectionStatus, Contact, TravelerType, Trip, TripTraveler, ViatikProfileLookup } from "@/features/domain/entities";

export type ContactValues = {
  fullName: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  email?: string | null;
  phone?: string | null;
  relationship?: Contact["relationship"];
  travelerType?: TravelerType;
  birthDate?: string | null;
  notes?: string | null;
  linkedProfileId?: string | null;
  linkedAvatarUrl?: string | null;
  linkedHandle?: string | null;
  connectionId?: string | null;
  connectionStatus?: ConnectionStatus;
  connectionDirection?: ConnectionDirection | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  dietaryRestrictions?: string[];
  allergies?: string[];
  passportIssuingCountry?: string | null;
  passportExpiresOn?: string | null;
  preferredCurrency?: string | null;
  preferredLanguage?: string | null;
};

export interface ContactRepository {
  list(ownerId: string): Promise<Contact[]>;
  watch(ownerId: string, onChange: (contacts: Contact[]) => void): () => void;
  create(input: ContactValues & { id: string; ownerId: string }): Promise<Contact>;
  update(id: string, ownerId: string, values: ContactValues, propagateTripIds?: string[]): Promise<Contact>;
  listUpcomingTrips(id: string, ownerId: string, today?: string): Promise<Trip[]>;
  remove(id: string, ownerId: string): Promise<void>;
  /**
   * Queue a mutual request to the given profile. Writes an optimistic `pending`
   * contact locally (works fully offline) and enqueues a `connectionRequest`
   * outbox mutation that is replayed against Supabase once online.
   */
  sendConnectionRequest(ownerId: string, profile: ViatikProfileLookup, ownSnapshot: ConnectionSnapshot): Promise<Contact>;
  /**
   * Accept (`accept: true`) or decline (`accept: false`) an inbound pending
   * request. Flips the local status optimistically and enqueues a
   * `connectionResponse` outbox mutation.
   */
  respondToConnectionRequest(id: string, ownerId: string, accept: boolean): Promise<Contact>;
  /**
   * Mark a contact as mutually accepted after a verified QR scan. Local-only;
   * the remote `accepted` edge is created by the server action.
   */
  markAcceptedFromScan(id: string, ownerId: string): Promise<Contact>;
  /**
   * Persist a newly-accepted connection locally after a verified QR scan.
   * No outbox mutation is queued — the server action already created the
   * remote `accepted` edge. Keyed by the server-generated connection id so a
   * later pull reconciles idempotently.
   */
  recordAcceptedConnection(ownerId: string, profile: ViatikProfileLookup, ownSnapshot: ConnectionSnapshot, connectionId: string): Promise<Contact>;
  /**
   * List contacts that are inbound pending requests (the request inbox).
   */
  listInboundRequests(ownerId: string): Promise<Contact[]>;
}

export interface TripTravelerRepository {
  list(tripId: string): Promise<TripTraveler[]>;
  watch(tripId: string, onChange: (travelers: TripTraveler[]) => void): () => void;
  attach(input: { id: string; tripId: string; contact: Contact; travelerType?: TravelerType; createdBy: string }): Promise<TripTraveler>;
  remove(id: string): Promise<void>;
}
