import type { Activity, ActivityPersonalBudget, Connection, ConnectionRemoteStatus, ConnectionSnapshot, ConnectionSource, ConnectionStatus, Contact, Expense, ExpenseSettlement, ExpenseShare, Trip, TripInvitation, TripMember, TripStatus, TripTraveler, UserWallet } from "@/features/domain/entities";
import { isSpendingCategory, type SpendingCategory, type SpendingSubcategory } from "@/features/domain/categories";
import type { TripMedia } from "@/features/domain/entities-media";
import { MAX_MINOR_UNITS, type MinorUnits } from "@/features/domain/money";
import { getSyncUser } from "@/lib/sync/sync-context";
import type { VaultEntry, VaultKeyset } from "@/features/vault/domain/vault-types";
import type { TripWeatherForecast } from "@/features/weather/domain/weather-types";
import type { TripShareLink } from "@/features/sharing/domain/share-types";
import { normalizeActivityCategory } from "@/features/activities/domain/activity-category";

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
    latitude: trip.latitude,
    longitude: trip.longitude,
    place_id: trip.placeId,
    time_zone: trip.timeZone,
    start_date: trip.startDate,
    end_date: trip.endDate,
    status: trip.status,
    started_at: trip.startedAt,
    completed_at: trip.completedAt,
    cancelled_at: trip.cancelledAt,
    cover_image_url: trip.coverImageUrl,
    adult_count: trip.adultCount,
    child_count: trip.childCount,
    base_currency: trip.baseCurrency,
    created_by: trip.createdBy,
    updated_by: trip.updatedBy,
    deleted_by: trip.deletedBy,
    restored_at: trip.restoredAt,
    restored_by: trip.restoredBy,
    status_changed_at: trip.statusChangedAt,
    status_changed_by: trip.statusChangedBy,
    version: trip.version,
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
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    placeId: row.place_id == null ? null : String(row.place_id),
    timeZone: row.time_zone == null ? null : String(row.time_zone),
    startDate: row.start_date == null ? null : String(row.start_date),
    endDate: row.end_date == null ? null : String(row.end_date),
    status: (row.status ?? "planned") as TripStatus,
    startedAt: row.started_at == null ? null : String(row.started_at),
    completedAt: row.completed_at == null ? null : String(row.completed_at),
    cancelledAt: row.cancelled_at == null ? null : String(row.cancelled_at),
    coverImageUrl: row.cover_image_url == null ? null : String(row.cover_image_url),
    adultCount: row.adult_count == null ? 1 : Number(row.adult_count),
    childCount: row.child_count == null ? 0 : Number(row.child_count),
    baseCurrency: row.base_currency == null ? "USD" : String(row.base_currency),
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    deletedBy: row.deleted_by == null ? null : String(row.deleted_by),
    restoredAt: row.restored_at == null ? null : String(row.restored_at),
    restoredBy: row.restored_by == null ? null : String(row.restored_by),
    statusChangedAt: String(row.status_changed_at),
    statusChangedBy: String(row.status_changed_by),
    version: Number(row.version ?? 1),
    // Community fields are local-only (never persisted remotely); default on read.
    isPublic: false,
    shareSlug: null,
    likesCount: 0,
    forkCount: 0,
    authorName: null,
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
    place_name: activity.placeName ?? null,
    formatted_address: activity.formattedAddress ?? null,
    place_id: activity.placeId ?? null,
    location: null,
    latitude: null,
    longitude: null,
    category: normalizeActivityCategory(activity.category),
    timing_specificity: activity.timingSpecificity ?? "exact",
    flexible_period: activity.flexiblePeriod ?? null,
    start_time: activity.startTime,
    end_time: activity.endTime,
    booking_reference: activity.bookingReference ?? null,
    participants: activity.participants ?? [],
    poll_status: activity.pollStatus ?? "confirmed",
    voting_ends_at: activity.votingEndsAt ?? null,
    poll_options: activity.pollOptions ?? [],
    poll_votes: activity.pollVotes ?? [],
    position: activity.position,
    estimated_cost: activity.estimatedCostMinor == null ? null : minorUnitsToRemote(activity.estimatedCostMinor, "estimated_cost"),
    created_by: activity.createdBy,
    updated_by: activity.updatedBy ?? activity.createdBy,
    deleted_by: activity.deletedBy ?? null,
    restored_at: activity.restoredAt ?? null,
    restored_by: activity.restoredBy ?? null,
    version: activity.version ?? 1,
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
    placeName: row.place_name == null ? null : String(row.place_name),
    formattedAddress: row.formatted_address == null ? null : String(row.formatted_address),
    placeId: row.place_id == null ? null : String(row.place_id),
    category: normalizeActivityCategory(row.category),
    timingSpecificity: row.timing_specificity === "flexible" ? "flexible" : "exact",
    flexiblePeriod: row.flexible_period == null ? null : row.flexible_period as Activity["flexiblePeriod"],
    startTime: row.start_time == null ? null : String(row.start_time),
    endTime: row.end_time == null ? null : String(row.end_time),
    bookingReference: row.booking_reference == null ? null : String(row.booking_reference),
    participants: Array.isArray(row.participants)
      ? row.participants.flatMap((participant) => {
          if (!participant || typeof participant !== "object") return [];
          const value = participant as Record<string, unknown>;
          const status = value.status;
          const userId = typeof value.userId === "string" ? value.userId : null;
          const travelerId = typeof value.travelerId === "string" ? value.travelerId : null;
          if ((!userId && !travelerId) || (status !== "attending" && status !== "declined" && status !== "pending")) return [];
          return [{ userId, travelerId, displayName: typeof value.displayName === "string" ? value.displayName : null, status }];
        })
      : [],
    pollStatus: row.poll_status === "proposed" || row.poll_status === "voting" || row.poll_status === "approved" || row.poll_status === "rejected" ? row.poll_status : "confirmed",
    votingEndsAt: row.voting_ends_at == null ? null : String(row.voting_ends_at),
    pollOptions: Array.isArray(row.poll_options) ? row.poll_options as Activity["pollOptions"] : [],
    pollVotes: Array.isArray(row.poll_votes) ? row.poll_votes as Activity["pollVotes"] : [],
    position: typeof row.position === "number" ? row.position : Number(row.position),
    estimatedCostMinor: row.estimated_cost == null ? null : minorUnitsFromRemote(row.estimated_cost, "estimated_cost"),
    createdBy: String(row.created_by),
    updatedBy: row.updated_by == null ? String(row.created_by) : String(row.updated_by),
    deletedBy: row.deleted_by == null ? null : String(row.deleted_by),
    restoredAt: row.restored_at == null ? null : String(row.restored_at),
    restoredBy: row.restored_by == null ? null : String(row.restored_by),
    version: Number(row.version ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  };
}

export function activityPersonalBudgetToRow(budget: ActivityPersonalBudget): Record<string, unknown> {
  return {
    id: budget.id,
    activity_id: budget.activityId,
    trip_id: budget.tripId,
    user_id: budget.userId,
    amount: minorUnitsToRemote(budget.amountMinor, "amount"),
    currency: budget.currency,
    version: budget.version,
    created_at: budget.createdAt,
    updated_at: budget.updatedAt,
  };
}

export function rowToActivityPersonalBudget(row: Record<string, unknown>): ActivityPersonalBudget {
  return {
    id: String(row.id),
    activityId: String(row.activity_id),
    tripId: String(row.trip_id),
    userId: String(row.user_id),
    amountMinor: minorUnitsFromRemote(row.amount, "amount"),
    currency: String(row.currency),
    version: Number(row.version ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
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
    exchange_rate_to_base: expense.exchangeRateToBase,
    paid_by: expense.paidBy,
    split_type: expense.splitType,
    // The remote `category_id` column is reused to carry the typed category key;
    // `subcategory` is a local-only field with no remote counterpart.
    category_id: expense.category,
    expense_date: expense.date,
    created_by: expense.createdBy,
    updated_by: expense.updatedBy,
    deleted_by: expense.deletedBy,
    restored_at: expense.restoredAt,
    restored_by: expense.restoredBy,
    version: expense.version,
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
    exchangeRateToBase: row.exchange_rate_to_base == null ? null : Number(row.exchange_rate_to_base),
    paidBy: String(row.paid_by),
    splitType: (row.split_type == null ? "equal" : String(row.split_type)) as Expense["splitType"],
    category: (isSpendingCategory(row.category_id) ? row.category_id : null) as SpendingCategory | null,
    subcategory: null as SpendingSubcategory | null,
    date: row.expense_date == null ? String(row.created_at).slice(0, 10) : String(row.expense_date),
    createdBy: String(row.created_by),
    updatedBy: row.updated_by == null ? null : String(row.updated_by),
    deletedBy: row.deleted_by == null ? null : String(row.deleted_by),
    restoredAt: row.restored_at == null ? null : String(row.restored_at),
    restoredBy: row.restored_by == null ? null : String(row.restored_by),
    version: Number(row.version ?? 1),
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
    split_type: share.splitType,
    updated_by: share.updatedBy,
    deleted_by: share.deletedBy,
    restored_at: share.restoredAt,
    restored_by: share.restoredBy,
    version: share.version,
    created_at: share.createdAt,
    updated_at: share.updatedAt,
  };
}

export function rowToExpenseShare(row: Record<string, unknown>): ExpenseShare {
  return {
    id: String(row.id),
    expenseId: String(row.expense_id),
    paidBy: "",
    userId: String(row.user_id),
    shareAmountMinor: minorUnitsFromRemote(row.share_amount, "share_amount"),
    sharePercentage: row.share_percentage == null ? null : Number(row.share_percentage),
    splitType: (row.split_type == null ? "equal" : String(row.split_type)) as ExpenseShare["splitType"],
    settlementStatus: "pending",
    settledAt: row.settled_at == null ? null : String(row.settled_at),
    settledBy: row.settled_by == null ? null : String(row.settled_by),
    statusChangedAt: row.status_changed_at == null ? null : String(row.status_changed_at),
    statusChangedBy: row.status_changed_by == null ? null : String(row.status_changed_by),
    updatedBy: row.updated_by == null ? null : String(row.updated_by),
    deletedBy: row.deleted_by == null ? null : String(row.deleted_by),
    restoredAt: row.restored_at == null ? null : String(row.restored_at),
    restoredBy: row.restored_by == null ? null : String(row.restored_by),
    version: Number(row.version ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function userWalletToRow(wallet: UserWallet): Record<string, unknown> {
  return {
    id: wallet.id,
    trip_id: wallet.tripId,
    user_id: wallet.userId,
    starting_balance: minorUnitsToRemote(wallet.startingBalanceMinor, "starting_balance"),
    currency: wallet.currency,
    version: wallet.version,
    created_at: wallet.createdAt,
    updated_at: wallet.updatedAt,
  };
}

export function rowToUserWallet(row: Record<string, unknown>): UserWallet {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    userId: String(row.user_id),
    startingBalanceMinor: minorUnitsFromRemote(row.starting_balance, "starting_balance"),
    currency: String(row.currency),
    version: Number(row.version ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function tripMemberToRow(member: TripMember): Record<string, unknown> {
  return { id: member.id, trip_id: member.tripId, user_id: member.userId, role: member.role, invited_by: member.invitedBy, joined_at: member.joinedAt, role_changed_at: member.roleChangedAt, role_changed_by: member.roleChangedBy, removed_at: member.removedAt, removed_by: member.removedBy, version: member.version, created_at: member.createdAt, updated_at: member.updatedAt };
}
export function rowToTripMember(row: Record<string, unknown>): TripMember {
  return { id: String(row.id), tripId: String(row.trip_id), userId: String(row.user_id), role: String(row.role) as TripMember["role"], invitedBy: row.invited_by == null ? null : String(row.invited_by), joinedAt: String(row.joined_at), roleChangedAt: row.role_changed_at == null ? null : String(row.role_changed_at), roleChangedBy: row.role_changed_by == null ? null : String(row.role_changed_by), removedAt: row.removed_at == null ? null : String(row.removed_at), removedBy: row.removed_by == null ? null : String(row.removed_by), version: Number(row.version ?? 1), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
export function invitationToRow(invitation: TripInvitation): Record<string, unknown> {
  return { id: invitation.id, trip_id: invitation.tripId, email: invitation.email, role: invitation.role, status: invitation.status, invited_by: invitation.invitedBy, invited_user_id: invitation.invitedUserId, expires_at: invitation.expiresAt, status_changed_at: invitation.statusChangedAt, status_changed_by: invitation.statusChangedBy, accepted_at: invitation.acceptedAt, accepted_by: invitation.acceptedBy, rejected_at: invitation.rejectedAt, rejected_by: invitation.rejectedBy, revoked_at: invitation.revokedAt, revoked_by: invitation.revokedBy, version: invitation.version, created_at: invitation.createdAt, updated_at: invitation.updatedAt };
}
export function rowToInvitation(row: Record<string, unknown>): TripInvitation {
  return { id: String(row.id), tripId: String(row.trip_id), email: String(row.email), role: String(row.role) as TripInvitation["role"], status: String(row.status) as TripInvitation["status"], invitedBy: String(row.invited_by), invitedUserId: row.invited_user_id == null ? null : String(row.invited_user_id), expiresAt: String(row.expires_at), statusChangedAt: String(row.status_changed_at), statusChangedBy: String(row.status_changed_by), acceptedAt: row.accepted_at == null ? null : String(row.accepted_at), acceptedBy: row.accepted_by == null ? null : String(row.accepted_by), rejectedAt: row.rejected_at == null ? null : String(row.rejected_at), rejectedBy: row.rejected_by == null ? null : String(row.rejected_by), revokedAt: row.revoked_at == null ? null : String(row.revoked_at), revokedBy: row.revoked_by == null ? null : String(row.revoked_by), version: Number(row.version ?? 1), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
export function mediaToRow(media: TripMedia): Record<string, unknown> {
  return { id: media.id, trip_id: media.tripId, activity_id: media.activityId, caption: media.caption, storage_path: media.storagePath, content_type: media.contentType, byte_size: media.byteSize, created_by: media.createdBy, updated_by: media.updatedBy, deleted_by: media.deletedBy, restored_at: media.restoredAt, restored_by: media.restoredBy, version: media.version, created_at: media.createdAt, updated_at: media.updatedAt, deleted_at: media.deletedAt };
}
export function rowToMedia(row: Record<string, unknown>): TripMedia {
  return { id: String(row.id), tripId: String(row.trip_id), activityId: row.activity_id == null ? null : String(row.activity_id), caption: row.caption == null ? null : String(row.caption), blob: null, storagePath: String(row.storage_path), uploadedUrl: null, signedUrlExpiresAt: null, contentType: String(row.content_type), byteSize: Number(row.byte_size), createdBy: String(row.created_by), updatedBy: String(row.updated_by), deletedBy: row.deleted_by == null ? null : String(row.deleted_by), restoredAt: row.restored_at == null ? null : String(row.restored_at), restoredBy: row.restored_by == null ? null : String(row.restored_by), version: Number(row.version ?? 1), 
    // Rows fetched from Supabase are already synced; there is no local upload queue state to restore.
    uploadStatus: "uploaded", uploadProgress: 100, uploadError: null, uploadAttempts: 0, nextUploadAt: null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), deletedAt: row.deleted_at == null ? null : String(row.deleted_at) };
}
export function settlementToRow(settlement: ExpenseSettlement): Record<string, unknown> {
  return { id: settlement.id, trip_id: settlement.tripId, from_user_id: settlement.fromUserId, to_user_id: settlement.toUserId, amount: minorUnitsToRemote(settlement.amountMinor, "amount"), currency: settlement.currency, created_by: settlement.createdBy, updated_by: settlement.updatedBy, deleted_by: settlement.deletedBy, restored_at: settlement.restoredAt, restored_by: settlement.restoredBy, version: settlement.version, created_at: settlement.createdAt, updated_at: settlement.updatedAt, deleted_at: settlement.deletedAt };
}
export function rowToSettlement(row: Record<string, unknown>): ExpenseSettlement {
  return { id: String(row.id), tripId: String(row.trip_id), fromUserId: String(row.from_user_id), toUserId: String(row.to_user_id), amountMinor: minorUnitsFromRemote(row.amount, "amount"), currency: String(row.currency), status: "pending", settledAt: row.settled_at == null ? null : String(row.settled_at), settledBy: row.settled_by == null ? null : String(row.settled_by), statusChangedAt: row.status_changed_at == null ? null : String(row.status_changed_at), statusChangedBy: row.status_changed_by == null ? null : String(row.status_changed_by), updatedBy: row.updated_by == null ? null : String(row.updated_by), deletedBy: row.deleted_by == null ? null : String(row.deleted_by), restoredAt: row.restored_at == null ? null : String(row.restored_at), restoredBy: row.restored_by == null ? null : String(row.restored_by), version: Number(row.version ?? 1), createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at), deletedAt: row.deleted_at == null ? null : String(row.deleted_at) };
}
export function contactToRow(contact: Contact): Record<string, unknown> {
  return { id: contact.id, owner_id: contact.ownerId, full_name: contact.fullName, avatar_url: contact.avatarUrl, avatar_seed: contact.avatarSeed, email: contact.email, phone: contact.phone, relationship: contact.relationship, traveler_type: contact.travelerType, birth_date: contact.birthDate, notes: contact.notes, linked_profile_id: contact.linkedProfileId, linked_avatar_url: contact.linkedAvatarUrl, linked_handle: contact.linkedHandle, emergency_contact_name: contact.emergencyContactName, emergency_contact_relationship: contact.emergencyContactRelationship, emergency_contact_phone: contact.emergencyContactPhone, dietary_restrictions: contact.dietaryRestrictions, allergies: contact.allergies, passport_issuing_country: contact.passportIssuingCountry, passport_expires_on: contact.passportExpiresOn, preferred_currency: contact.preferredCurrency, preferred_language: contact.preferredLanguage, updated_by: contact.updatedBy, deleted_by: contact.deletedBy, restored_at: contact.restoredAt, restored_by: contact.restoredBy, version: contact.version, created_at: contact.createdAt, updated_at: contact.updatedAt, deleted_at: contact.deletedAt };
}
export function rowToContact(row: Record<string, unknown>): Contact {
  return { id: String(row.id), ownerId: String(row.owner_id), fullName: String(row.full_name), avatarUrl: row.avatar_url == null ? null : String(row.avatar_url), avatarSeed: row.avatar_seed == null ? null : String(row.avatar_seed), email: row.email == null ? null : String(row.email), phone: row.phone == null ? null : String(row.phone), relationship: (row.relationship ?? "other") as Contact["relationship"], travelerType: (row.traveler_type ?? "adult") as Contact["travelerType"], birthDate: row.birth_date == null ? null : String(row.birth_date), notes: row.notes == null ? null : String(row.notes), linkedProfileId: row.linked_profile_id == null ? null : String(row.linked_profile_id), linkedAvatarUrl: row.linked_avatar_url == null ? null : String(row.linked_avatar_url), linkedHandle: row.linked_handle == null ? null : String(row.linked_handle), connectionId: row.connection_id == null ? null : String(row.connection_id), connectionStatus: (row.connection_status ?? "unverified_offline") as ConnectionStatus, connectionDirection: row.connection_direction == null ? null : (row.connection_direction as Contact["connectionDirection"]), emergencyContactName: row.emergency_contact_name == null ? null : String(row.emergency_contact_name), emergencyContactRelationship: row.emergency_contact_relationship == null ? null : String(row.emergency_contact_relationship), emergencyContactPhone: row.emergency_contact_phone == null ? null : String(row.emergency_contact_phone), dietaryRestrictions: Array.isArray(row.dietary_restrictions) ? row.dietary_restrictions.map(String) : [], allergies: Array.isArray(row.allergies) ? row.allergies.map(String) : [], passportIssuingCountry: row.passport_issuing_country == null ? null : String(row.passport_issuing_country), passportExpiresOn: row.passport_expires_on == null ? null : String(row.passport_expires_on), preferredCurrency: row.preferred_currency == null ? null : String(row.preferred_currency), preferredLanguage: row.preferred_language == null ? null : String(row.preferred_language), updatedBy: row.updated_by == null ? null : String(row.updated_by), deletedBy: row.deleted_by == null ? null : String(row.deleted_by), restoredAt: row.restored_at == null ? null : String(row.restored_at), restoredBy: row.restored_by == null ? null : String(row.restored_by), version: Number(row.version ?? 1), createdAt: String(row.created_at), updatedAt: String(row.updated_at), deletedAt: row.deleted_at == null ? null : String(row.deleted_at) };
}
function snapshotFromRemote(value: unknown): ConnectionSnapshot {
  const snap = (value ?? {}) as Record<string, unknown>;
  return {
    profileId: String(snap.profile_id ?? snap.profileId ?? ""),
    viatikId: String(snap.viatik_id ?? snap.viatikId ?? ""),
    displayName: String(snap.display_name ?? snap.displayName ?? "Viatik user"),
    avatarUrl: (snap.avatar_url ?? snap.avatarUrl ?? null) == null ? null : String(snap.avatar_url ?? snap.avatarUrl),
    avatarSeed: (snap.avatar_seed ?? snap.avatarSeed ?? null) == null ? null : String(snap.avatar_seed ?? snap.avatarSeed),
    publicHandle: (snap.public_handle ?? snap.publicHandle ?? null) == null ? null : String(snap.public_handle ?? snap.publicHandle),
  };
}

/** Converts a local `Connection` edge into a snake_case `connections` row for the CAS RPC. */
export function connectionToRow(conn: Connection): Record<string, unknown> {
  return {
    id: conn.id,
    requester_id: conn.requesterId,
    recipient_id: conn.recipientId,
    status: conn.status,
    requester_snapshot: conn.requesterSnapshot,
    recipient_snapshot: conn.recipientSnapshot,
    status_changed_at: conn.statusChangedAt ?? null,
    status_changed_by: conn.statusChangedBy ?? null,
    accepted_at: conn.acceptedAt ?? null,
    accepted_by: conn.acceptedBy ?? null,
    blocked_at: conn.blockedAt ?? null,
    blocked_by: conn.blockedBy ?? null,
    version: conn.version ?? 1,
    source: conn.source ?? "legacy",
    created_at: conn.createdAt,
    updated_at: conn.updatedAt,
  };
}

/** Parses a snake_case `connections` row back into a local `Connection`. */
export function rowToConnection(row: Record<string, unknown>): Connection {
  return {
    id: String(row.id),
    requesterId: String(row.requester_id),
    recipientId: String(row.recipient_id),
    status: (row.status ?? "pending") as ConnectionRemoteStatus,
    requesterSnapshot: snapshotFromRemote(row.requester_snapshot),
    recipientSnapshot: snapshotFromRemote(row.recipient_snapshot),
    statusChangedAt: row.status_changed_at == null ? null : String(row.status_changed_at),
    statusChangedBy: row.status_changed_by == null ? null : String(row.status_changed_by),
    acceptedAt: row.accepted_at == null ? null : String(row.accepted_at),
    acceptedBy: row.accepted_by == null ? null : String(row.accepted_by),
    blockedAt: row.blocked_at == null ? null : String(row.blocked_at),
    blockedBy: row.blocked_by == null ? null : String(row.blocked_by),
    version: Number(row.version ?? 1),
    source: (row.source ?? "legacy") as ConnectionSource,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Materializes a local `Contact` read-model from a pulled `connections` row for
 * the CURRENT user. The counterpart is the party on the other side of the edge;
 * their PUBLIC-ONLY snapshot feeds the contact's display fields. A `blocked`
 * (declined) edge is materialized as a soft-deleted contact so it drops out of
 * the active list while the authoritative edge row remains.
 */
export function rowToConnectionContact(row: Record<string, unknown>): Contact {
  const viewerId = getSyncUser() ?? "";
  const requesterId = String(row.requester_id);
  const recipientId = String(row.recipient_id);
  const status = (row.status ?? "pending") as ConnectionRemoteStatus;
  const isRecipient = recipientId === viewerId;
  const counterpart = snapshotFromRemote(isRecipient ? row.requester_snapshot : row.recipient_snapshot);
  const counterpartId = isRecipient ? requesterId : recipientId;
  const avatarUrl = counterpart.avatarUrl ?? null;
  const publicHandle = counterpart.publicHandle ?? null;
  const connectionStatus: ConnectionStatus = status === "accepted" ? "accepted" : "pending";
  const direction = status === "pending" ? (isRecipient ? "inbound" : "outbound") : null;
  const updatedAt = String(row.updated_at);
  const blocked = status === "blocked";
  return {
    id: String(row.id),
    ownerId: viewerId,
    fullName: counterpart.displayName,
    avatarUrl,
    avatarSeed: counterpart.avatarSeed ?? null,
    email: null,
    phone: null,
    relationship: "other",
    travelerType: "adult",
    birthDate: null,
    notes: null,
    linkedProfileId: counterpartId,
    linkedAvatarUrl: avatarUrl,
    linkedHandle: publicHandle,
    connectionId: String(row.id),
    connectionStatus,
    connectionDirection: direction,
    emergencyContactName: null,
    emergencyContactRelationship: null,
    emergencyContactPhone: null,
    dietaryRestrictions: [],
    allergies: [],
    passportIssuingCountry: null,
    passportExpiresOn: null,
    preferredCurrency: null,
    preferredLanguage: null,
    createdAt: String(row.created_at),
    updatedAt,
    deletedAt: blocked ? updatedAt : null,
  };
}

export function tripTravelerToRow(traveler: TripTraveler): Record<string, unknown> {
  return { id: traveler.id, trip_id: traveler.tripId, contact_id: traveler.contactId, display_name: traveler.displayName, traveler_type: traveler.travelerType, created_by: traveler.createdBy, updated_by: traveler.updatedBy, deleted_by: traveler.deletedBy, restored_at: traveler.restoredAt, restored_by: traveler.restoredBy, version: traveler.version, created_at: traveler.createdAt, updated_at: traveler.updatedAt, deleted_at: traveler.deletedAt };
}
export function rowToTripTraveler(row: Record<string, unknown>): TripTraveler {
  return { id: String(row.id), tripId: String(row.trip_id), contactId: String(row.contact_id), displayName: String(row.display_name), travelerType: String(row.traveler_type) as TripTraveler["travelerType"], createdBy: String(row.created_by), updatedBy: row.updated_by == null ? null : String(row.updated_by), deletedBy: row.deleted_by == null ? null : String(row.deleted_by), restoredAt: row.restored_at == null ? null : String(row.restored_at), restoredBy: row.restored_by == null ? null : String(row.restored_by), version: Number(row.version ?? 1), createdAt: String(row.created_at), updatedAt: String(row.updated_at), deletedAt: row.deleted_at == null ? null : String(row.deleted_at) };
}

export function vaultKeysetToRow(keyset: VaultKeyset): Record<string, unknown> {
  return {
    id: keyset.id,
    owner_id: keyset.ownerId,
    salt: keyset.salt,
    verification_ciphertext: keyset.verificationCiphertext,
    verification_iv: keyset.verificationIv,
    kdf: keyset.kdf,
    iterations: keyset.iterations,
    key_version: keyset.keyVersion,
    created_at: keyset.createdAt,
    updated_at: keyset.updatedAt,
  };
}

export function rowToVaultKeyset(row: Record<string, unknown>): VaultKeyset {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    salt: String(row.salt),
    verificationCiphertext: String(row.verification_ciphertext),
    verificationIv: String(row.verification_iv),
    kdf: String(row.kdf) as VaultKeyset["kdf"],
    iterations: Number(row.iterations),
    keyVersion: Number(row.key_version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function vaultEntryToRow(entry: VaultEntry): Record<string, unknown> {
  return {
    id: entry.id,
    trip_id: entry.tripId,
    owner_id: entry.ownerId,
    ciphertext: entry.ciphertext,
    initialization_vector: entry.initializationVector,
    key_version: entry.keyVersion,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    deleted_at: entry.deletedAt,
  };
}

export function rowToVaultEntry(row: Record<string, unknown>): VaultEntry {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    ownerId: String(row.owner_id),
    ciphertext: String(row.ciphertext),
    initializationVector: String(row.initialization_vector),
    keyVersion: Number(row.key_version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  };
}

export function tripWeatherForecastToRow(forecast: TripWeatherForecast): Record<string, unknown> {
  return {
    id: forecast.id,
    trip_id: forecast.tripId,
    location_revision: forecast.locationRevision,
    fetched_at: forecast.fetchedAt,
    forecast_json: forecast.forecast,
    created_by: forecast.createdBy,
    created_at: forecast.createdAt,
    updated_at: forecast.updatedAt,
    deleted_at: forecast.deletedAt,
  };
}

export function shareLinkToRow(link: TripShareLink): Record<string, unknown> {
  return {
    id: link.id,
    trip_id: link.tripId,
    slug: link.slug,
    label: link.label,
    created_by: link.createdBy,
    allow_itinerary: link.allowItinerary,
    allow_map: link.allowMap,
    allow_gallery: link.allowGallery,
    active: link.active,
    created_at: link.createdAt,
    updated_at: link.updatedAt,
    deleted_at: link.deletedAt,
  };
}

export function rowToShareLink(row: Record<string, unknown>): TripShareLink {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    slug: String(row.slug),
    label: row.label == null ? null : String(row.label),
    createdBy: String(row.created_by),
    allowItinerary: row.allow_itinerary == null ? true : Boolean(row.allow_itinerary),
    allowMap: row.allow_map == null ? true : Boolean(row.allow_map),
    allowGallery: row.allow_gallery == null ? true : Boolean(row.allow_gallery),
    active: row.active == null ? true : Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  };
}

export function rowToTripWeatherForecast(row: Record<string, unknown>): TripWeatherForecast {
  const forecastJson = row.forecast_json;
  const forecast =
    forecastJson && typeof forecastJson === "object"
      ? (forecastJson as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    locationRevision: String(row.location_revision),
    fetchedAt: String(row.fetched_at),
    forecast: {
      dates: Array.isArray(forecast.dates) ? forecast.dates.map(String) : [],
      temperature2mMax: Array.isArray(forecast.temperature2mMax)
        ? forecast.temperature2mMax.map(Number)
        : [],
      temperature2mMin: Array.isArray(forecast.temperature2mMin)
        ? forecast.temperature2mMin.map(Number)
        : [],
      precipitationSum: Array.isArray(forecast.precipitationSum)
        ? forecast.precipitationSum.map(Number)
        : [],
      weatherCode: Array.isArray(forecast.weatherCode)
        ? forecast.weatherCode.map(Number)
        : [],
      windSpeed10mMax: Array.isArray(forecast.windSpeed10mMax)
        ? forecast.windSpeed10mMax.map(Number)
        : [],
    },
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  };
}
