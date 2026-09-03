import type { Activity, Contact, Expense, ExpenseSettlement, ExpenseShare, Trip, TripInvitation, TripMember, TripTraveler } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import { MAX_MINOR_UNITS, type MinorUnits } from "@/features/domain/money";

function minorUnitsToRemote(value: MinorUnits, field: string): string {
  if (value < 0n || value > MAX_MINOR_UNITS) throw new Error(`Invalid remote ${field}`);
  return value.toString();
}

function minorUnitsFromRemote(value: unknown, field: string): MinorUnits {
  const normalized = String(value);
  if (!/^\d+$/.test(normalized)) throw new Error(`Invalid remote ${field}`);
  const amount = BigInt(normalized);
  if (amount > MAX_MINOR_UNITS) throw new Error(`Invalid remote ${field}`);
  return amount;
}

/**
 * Bidirectional mapping between camelCase domain entities and snake_case
 * Supabase PostgreSQL rows. Keeping these isolated means the sync engine
 * (which is the only component that speaks to Supabase) can adapt to schema
 * changes in one place.
 */

export function tripToRow(trip: Trip): Record<string, unknown> {
  return {
    id: trip.id,
    owner_id: trip.ownerId,
    name: trip.name,
    description: trip.description,
    destination: trip.destination,
    start_date: trip.startDate,
    end_date: trip.endDate,
    cover_image_url: trip.coverImageUrl,
    adult_count: trip.adultCount,
    child_count: trip.childCount,
    base_currency: trip.baseCurrency,
    created_at: trip.createdAt,
    updated_at: trip.updatedAt,
    deleted_at: trip.deletedAt,
  };
}

export function rowToTrip(row: Record<string, unknown>): Trip {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    destination: row.destination == null ? null : String(row.destination),
    startDate: row.start_date == null ? null : String(row.start_date),
    endDate: row.end_date == null ? null : String(row.end_date),
    coverImageUrl: row.cover_image_url == null ? null : String(row.cover_image_url),
    adultCount: row.adult_count == null ? 1 : Number(row.adult_count),
    childCount: row.child_count == null ? 0 : Number(row.child_count),
    baseCurrency: row.base_currency == null ? "USD" : String(row.base_currency),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  };
}

export function activityToRow(activity: Activity): Record<string, unknown> {
  return {
    id: activity.id,
    trip_id: activity.tripId,
    day_date: activity.dayDate,
    title: activity.title,
    description: activity.description,
    location: activity.location,
    category: activity.category,
    start_time: activity.startTime,
    end_time: activity.endTime,
    position: activity.position,
    created_by: activity.createdBy,
    created_at: activity.createdAt,
    updated_at: activity.updatedAt,
    deleted_at: activity.deletedAt,
  };
}

export function rowToActivity(row: Record<string, unknown>): Activity {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    dayDate: String(row.day_date),
    title: String(row.title),
    description: row.description == null ? null : String(row.description),
    location: row.location == null ? null : String(row.location),
    category: row.category == null ? "general" : String(row.category),
    startTime: row.start_time == null ? null : String(row.start_time),
    endTime: row.end_time == null ? null : String(row.end_time),
    position: typeof row.position === "number" ? row.position : Number(row.position),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  };
}

export function expenseToRow(expense: Expense): Record<string, unknown> {
  return {
    id: expense.id,
    trip_id: expense.tripId,
    activity_id: expense.activityId,
    description: expense.description,
    amount: minorUnitsToRemote(expense.amountMinor, "amount"),
    currency: expense.currency,
    paid_by: expense.paidBy,
    split_type: expense.splitType,
    created_by: expense.createdBy,
    created_at: expense.createdAt,
    updated_at: expense.updatedAt,
    deleted_at: expense.deletedAt,
  };
}

export function rowToExpense(row: Record<string, unknown>): Expense {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    activityId: row.activity_id == null ? null : String(row.activity_id),
    description: String(row.description),
    amountMinor: minorUnitsFromRemote(row.amount, "amount"),
    currency: String(row.currency),
    paidBy: String(row.paid_by),
    splitType: (row.split_type == null ? "equal" : String(row.split_type)) as Expense["splitType"],
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  };
}

export function expenseShareToRow(share: ExpenseShare): Record<string, unknown> {
  return {
    id: share.id,
    expense_id: share.expenseId,
    user_id: share.userId,
    share_amount: minorUnitsToRemote(share.shareAmountMinor, "share_amount"),
    share_percentage: share.sharePercentage,
    created_at: share.createdAt,
    updated_at: share.updatedAt,
  };
}

export function rowToExpenseShare(row: Record<string, unknown>): ExpenseShare {
  return {
    id: String(row.id),
    expenseId: String(row.expense_id),
    userId: String(row.user_id),
    shareAmountMinor: minorUnitsFromRemote(row.share_amount, "share_amount"),
    sharePercentage: row.share_percentage == null ? null : Number(row.share_percentage),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function tripMemberToRow(member: TripMember): Record<string, unknown> {
  return { id: member.id, trip_id: member.tripId, user_id: member.userId, role: member.role, invited_by: member.invitedBy, joined_at: member.joinedAt, created_at: member.createdAt, updated_at: member.updatedAt };
}
export function rowToTripMember(row: Record<string, unknown>): TripMember {
  return { id: String(row.id), tripId: String(row.trip_id), userId: String(row.user_id), role: String(row.role) as TripMember["role"], invitedBy: row.invited_by == null ? null : String(row.invited_by), joinedAt: String(row.joined_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
export function invitationToRow(invitation: TripInvitation): Record<string, unknown> {
  return { id: invitation.id, trip_id: invitation.tripId, email: invitation.email, role: invitation.role, status: invitation.status, invited_by: invitation.invitedBy, invited_user_id: invitation.invitedUserId, expires_at: invitation.expiresAt, created_at: invitation.createdAt, updated_at: invitation.updatedAt };
}
export function rowToInvitation(row: Record<string, unknown>): TripInvitation {
  return { id: String(row.id), tripId: String(row.trip_id), email: String(row.email), role: String(row.role) as TripInvitation["role"], status: String(row.status) as TripInvitation["status"], invitedBy: String(row.invited_by), invitedUserId: row.invited_user_id == null ? null : String(row.invited_user_id), expiresAt: String(row.expires_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
export function mediaToRow(media: TripMedia): Record<string, unknown> {
  return { id: media.id, trip_id: media.tripId, activity_id: media.activityId, caption: media.caption, storage_path: media.storagePath, content_type: media.contentType, byte_size: media.byteSize, created_by: media.createdBy, created_at: media.createdAt, updated_at: media.updatedAt, deleted_at: media.deletedAt };
}
export function rowToMedia(row: Record<string, unknown>): TripMedia {
  return { id: String(row.id), tripId: String(row.trip_id), activityId: row.activity_id == null ? null : String(row.activity_id), caption: row.caption == null ? null : String(row.caption), blob: null, storagePath: String(row.storage_path), uploadedUrl: null, signedUrlExpiresAt: null, contentType: String(row.content_type), byteSize: Number(row.byte_size), createdBy: String(row.created_by), uploadStatus: "uploaded", uploadProgress: 100, uploadError: null, uploadAttempts: 0, nextUploadAt: null, createdAt: String(row.created_at), updatedAt: String(row.updated_at), deletedAt: row.deleted_at == null ? null : String(row.deleted_at) };
}
export function settlementToRow(settlement: ExpenseSettlement): Record<string, unknown> {
  return { id: settlement.id, trip_id: settlement.tripId, from_user_id: settlement.fromUserId, to_user_id: settlement.toUserId, amount: minorUnitsToRemote(settlement.amountMinor, "amount"), currency: settlement.currency, created_by: settlement.createdBy, created_at: settlement.createdAt, updated_at: settlement.updatedAt, deleted_at: settlement.deletedAt };
}
export function rowToSettlement(row: Record<string, unknown>): ExpenseSettlement {
  return { id: String(row.id), tripId: String(row.trip_id), fromUserId: String(row.from_user_id), toUserId: String(row.to_user_id), amountMinor: minorUnitsFromRemote(row.amount, "amount"), currency: String(row.currency), createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at), deletedAt: row.deleted_at == null ? null : String(row.deleted_at) };
}
export function contactToRow(contact: Contact): Record<string, unknown> {
  return { id: contact.id, owner_id: contact.ownerId, full_name: contact.fullName, email: contact.email, phone: contact.phone, relationship: contact.relationship, traveler_type: contact.travelerType, birth_date: contact.birthDate, notes: contact.notes, linked_profile_id: contact.linkedProfileId, linked_avatar_url: contact.linkedAvatarUrl, linked_handle: contact.linkedHandle, emergency_contact_name: contact.emergencyContactName, emergency_contact_relationship: contact.emergencyContactRelationship, emergency_contact_phone: contact.emergencyContactPhone, dietary_restrictions: contact.dietaryRestrictions, allergies: contact.allergies, passport_issuing_country: contact.passportIssuingCountry, passport_expires_on: contact.passportExpiresOn, preferred_currency: contact.preferredCurrency, preferred_language: contact.preferredLanguage, created_at: contact.createdAt, updated_at: contact.updatedAt, deleted_at: contact.deletedAt };
}
export function rowToContact(row: Record<string, unknown>): Contact {
  return { id: String(row.id), ownerId: String(row.owner_id), fullName: String(row.full_name), email: row.email == null ? null : String(row.email), phone: row.phone == null ? null : String(row.phone), relationship: (row.relationship ?? "other") as Contact["relationship"], travelerType: (row.traveler_type ?? "adult") as Contact["travelerType"], birthDate: row.birth_date == null ? null : String(row.birth_date), notes: row.notes == null ? null : String(row.notes), linkedProfileId: row.linked_profile_id == null ? null : String(row.linked_profile_id), linkedAvatarUrl: row.linked_avatar_url == null ? null : String(row.linked_avatar_url), linkedHandle: row.linked_handle == null ? null : String(row.linked_handle), emergencyContactName: row.emergency_contact_name == null ? null : String(row.emergency_contact_name), emergencyContactRelationship: row.emergency_contact_relationship == null ? null : String(row.emergency_contact_relationship), emergencyContactPhone: row.emergency_contact_phone == null ? null : String(row.emergency_contact_phone), dietaryRestrictions: Array.isArray(row.dietary_restrictions) ? row.dietary_restrictions.map(String) : [], allergies: Array.isArray(row.allergies) ? row.allergies.map(String) : [], passportIssuingCountry: row.passport_issuing_country == null ? null : String(row.passport_issuing_country), passportExpiresOn: row.passport_expires_on == null ? null : String(row.passport_expires_on), preferredCurrency: row.preferred_currency == null ? null : String(row.preferred_currency), preferredLanguage: row.preferred_language == null ? null : String(row.preferred_language), createdAt: String(row.created_at), updatedAt: String(row.updated_at), deletedAt: row.deleted_at == null ? null : String(row.deleted_at) };
}
export function tripTravelerToRow(traveler: TripTraveler): Record<string, unknown> {
  return { id: traveler.id, trip_id: traveler.tripId, contact_id: traveler.contactId, display_name: traveler.displayName, traveler_type: traveler.travelerType, created_by: traveler.createdBy, created_at: traveler.createdAt, updated_at: traveler.updatedAt, deleted_at: traveler.deletedAt };
}
export function rowToTripTraveler(row: Record<string, unknown>): TripTraveler {
  return { id: String(row.id), tripId: String(row.trip_id), contactId: String(row.contact_id), displayName: String(row.display_name), travelerType: String(row.traveler_type) as TripTraveler["travelerType"], createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at), deletedAt: row.deleted_at == null ? null : String(row.deleted_at) };
}
