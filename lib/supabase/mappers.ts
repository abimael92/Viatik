import type { Activity, Trip } from "@/features/domain/entities";

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
