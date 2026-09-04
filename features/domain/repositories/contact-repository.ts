import type { Contact, TravelerType, Trip, TripTraveler } from "@/features/domain/entities";

export type ContactValues = {
  fullName: string;
  avatarUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  relationship?: Contact["relationship"];
  travelerType?: TravelerType;
  birthDate?: string | null;
  notes?: string | null;
  linkedProfileId?: string | null;
  linkedAvatarUrl?: string | null;
  linkedHandle?: string | null;
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
}

export interface TripTravelerRepository {
  list(tripId: string): Promise<TripTraveler[]>;
  watch(tripId: string, onChange: (travelers: TripTraveler[]) => void): () => void;
  attach(input: { id: string; tripId: string; contact: Contact; travelerType?: TravelerType; createdBy: string }): Promise<TripTraveler>;
  remove(id: string): Promise<void>;
}
