import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import type { Contact, Trip, TripTraveler } from "@/features/domain/entities";
import type { ContactRepository, TripTravelerRepository } from "@/features/domain/repositories/contact-repository";
import { append } from "@/lib/sync/outbox-transactional";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

function normalizeTags(values?: string[]): string[] {
  return [...new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

export class DexieContactRepository implements ContactRepository {
  list(ownerId: string): Promise<Contact[]> {
    const db = getDb();
    return db.contacts.where("ownerId").equals(ownerId).filter((contact) => contact.deletedAt === null).sortBy("fullName");
  }

  watch(ownerId: string, onChange: (contacts: Contact[]) => void): () => void {
    const subscription = liveQuery(() => this.list(ownerId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: Parameters<ContactRepository["create"]>[0]): Promise<Contact> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.contacts], async (ctx) => {
      const now = new Date().toISOString();
      const contact: Contact = {
        id: input.id,
        ownerId: input.ownerId,
        fullName: input.fullName.trim(),
        avatarUrl: input.avatarUrl?.trim() || null,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        relationship: input.relationship ?? "other",
        travelerType: input.travelerType ?? "adult",
        birthDate: input.birthDate ?? null,
        notes: input.notes?.trim() || null,
        linkedProfileId: input.linkedProfileId ?? null,
        linkedAvatarUrl: input.linkedAvatarUrl?.trim() || null,
        linkedHandle: input.linkedHandle?.trim() || null,
        emergencyContactName: input.emergencyContactName?.trim() || null,
        emergencyContactRelationship: input.emergencyContactRelationship?.trim() || null,
        emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
        dietaryRestrictions: normalizeTags(input.dietaryRestrictions),
        allergies: normalizeTags(input.allergies),
        passportIssuingCountry: input.passportIssuingCountry?.trim().toUpperCase() || null,
        passportExpiresOn: input.passportExpiresOn || null,
        preferredCurrency: input.preferredCurrency?.trim().toUpperCase() || null,
        preferredLanguage: input.preferredLanguage?.trim() || null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await ctx.table<Contact>("contacts").add(contact);
      await append("contact", "insert", contact, { tx: ctx, baseUpdatedAt: null });
      return contact;
    });
  }

  async listUpcomingTrips(id: string, ownerId: string, today = new Date().toISOString().slice(0, 10)): Promise<Trip[]> {
    const db = getDb();
    const contact = await db.contacts.get(id);
    if (!contact || contact.ownerId !== ownerId || contact.deletedAt) return [];
    const travelers = await db.tripTravelers.where("contactId").equals(id).filter((traveler) => traveler.deletedAt === null).toArray();
    const trips = await db.trips.bulkGet([...new Set(travelers.map((traveler) => traveler.tripId))]);
    return trips.filter((trip): trip is Trip => Boolean(trip && !trip.deletedAt && (!trip.endDate || trip.endDate >= today))).sort((a, b) =>
      (a.startDate ?? a.endDate ?? a.createdAt ?? "9999").localeCompare(b.startDate ?? b.endDate ?? b.createdAt ?? "9999")
    );
  }

  async update(id: string, ownerId: string, values: Parameters<ContactRepository["update"]>[2], propagateTripIds: string[] = []): Promise<Contact> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.contacts, db.trips, db.tripTravelers], async (ctx) => {
      const contact = await ctx.table<Contact>("contacts").get(id);
      if (!contact || contact.deletedAt || contact.ownerId !== ownerId) throw new Error("Contact not found.");
      const now = new Date().toISOString();
      const updated: Contact = {
        ...contact,
        ...values,
        fullName: values.fullName.trim(),
        avatarUrl: values.avatarUrl?.trim() || null,
        email: values.email?.trim() || null,
        phone: values.phone?.trim() || null,
        notes: values.notes?.trim() || null,
        birthDate: values.birthDate || null,
        linkedAvatarUrl: values.linkedAvatarUrl?.trim() || contact.linkedAvatarUrl,
        linkedHandle: values.linkedHandle?.trim() || contact.linkedHandle,
        emergencyContactName: values.emergencyContactName === undefined ? contact.emergencyContactName : values.emergencyContactName?.trim() || null,
        emergencyContactRelationship: values.emergencyContactRelationship === undefined ? contact.emergencyContactRelationship : values.emergencyContactRelationship?.trim() || null,
        emergencyContactPhone: values.emergencyContactPhone === undefined ? contact.emergencyContactPhone : values.emergencyContactPhone?.trim() || null,
        dietaryRestrictions: values.dietaryRestrictions === undefined ? contact.dietaryRestrictions : normalizeTags(values.dietaryRestrictions),
        allergies: values.allergies === undefined ? contact.allergies : normalizeTags(values.allergies),
        passportIssuingCountry: values.passportIssuingCountry === undefined ? contact.passportIssuingCountry : values.passportIssuingCountry?.trim().toUpperCase() || null,
        passportExpiresOn: values.passportExpiresOn === undefined ? contact.passportExpiresOn : values.passportExpiresOn || null,
        preferredCurrency: values.preferredCurrency === undefined ? contact.preferredCurrency : values.preferredCurrency?.trim().toUpperCase() || null,
        preferredLanguage: values.preferredLanguage === undefined ? contact.preferredLanguage : values.preferredLanguage?.trim() || null,
        updatedAt: now,
      };
      await ctx.table<Contact>("contacts").put(updated);
      await append("contact", "update", updated, { tx: ctx, baseUpdatedAt: contact.updatedAt });
      if (propagateTripIds.length && (contact.fullName !== updated.fullName || contact.travelerType !== updated.travelerType)) {
        const today = new Date().toISOString().slice(0, 10);
        const selected = new Set(propagateTripIds);
        const travelers = await ctx.table<TripTraveler>("tripTravelers").where("contactId").equals(id).filter((traveler) => traveler.deletedAt === null && selected.has(traveler.tripId)).toArray();
        for (const traveler of travelers) {
          const trip = await ctx.table<Trip>("trips").get(traveler.tripId);
          if (!trip || trip.deletedAt || (trip.endDate && trip.endDate < today)) continue;
          const snapshot = { ...traveler, displayName: updated.fullName, travelerType: updated.travelerType, updatedAt: now };
          await ctx.table<TripTraveler>("tripTravelers").put(snapshot);
          await append("tripTraveler", "update", snapshot, { tx: ctx, baseUpdatedAt: traveler.updatedAt });
        }
      }
      return updated;
    });
  }

  async remove(id: string, ownerId: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.contacts], async (ctx) => {
      const contact = await ctx.table<Contact>("contacts").get(id);
      if (!contact || contact.ownerId !== ownerId) return;
      const now = new Date().toISOString();
      const updated = { ...contact, updatedAt: now, deletedAt: now };
      await ctx.table<Contact>("contacts").put(updated);
      await append("contact", "update", updated, { tx: ctx, baseUpdatedAt: contact.updatedAt });
    });
  }
}

export class DexieTripTravelerRepository implements TripTravelerRepository {
  list(tripId: string): Promise<TripTraveler[]> {
    const db = getDb();
    return db.tripTravelers.where("tripId").equals(tripId).filter((traveler) => traveler.deletedAt === null).sortBy("displayName");
  }

  watch(tripId: string, onChange: (travelers: TripTraveler[]) => void): () => void {
    const subscription = liveQuery(() => this.list(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async attach(input: Parameters<TripTravelerRepository["attach"]>[0]): Promise<TripTraveler> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripTravelers], async (ctx) => {
      const existing = await ctx.table<TripTraveler>("tripTravelers").where("[tripId+contactId]").equals([input.tripId, input.contact.id]).first();
      const now = new Date().toISOString();
      const traveler: TripTraveler = {
        id: existing?.id ?? input.id,
        tripId: input.tripId,
        contactId: input.contact.id,
        displayName: input.contact.fullName,
        travelerType: input.travelerType ?? input.contact.travelerType,
        createdBy: input.createdBy,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      };
      await ctx.table<TripTraveler>("tripTravelers").put(traveler);
      await append("tripTraveler", existing ? "update" : "insert", traveler, { tx: ctx, baseUpdatedAt: existing?.updatedAt ?? null });
      return traveler;
    });
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripTravelers], async (ctx) => {
      const traveler = await ctx.table<TripTraveler>("tripTravelers").get(id);
      if (!traveler) return;
      const now = new Date().toISOString();
      const updated = { ...traveler, updatedAt: now, deletedAt: now };
      await ctx.table<TripTraveler>("tripTravelers").put(updated);
      await append("tripTraveler", "update", updated, { tx: ctx, baseUpdatedAt: traveler.updatedAt });
    });
  }
}

export const contactRepository = new DexieContactRepository();
export const tripTravelerRepository = new DexieTripTravelerRepository();
