/**
 * Server-side loader for the public guest share view.
 *
 * The `/share/[slug]` route is unauthenticated, so it reads with the Supabase
 * **service client** (service-role key, server-only) — the only path that can
 * resolve a share link and its trip data without an auth session. The service
 * key never leaves the server, and the route only serves data for the tripId
 * resolved from a valid, active share link (the slug is high-entropy, making
 * enumeration impractical). Guest data is deliberately minimized to the fields
 * the read-only companion view needs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SharedTripSnapshot, TripShareLink } from "@/features/sharing/domain/share-types";
import { isValidShareSlug } from "@/features/sharing/lib/share-slug";

export type SharedTripLoadResult =
  | { status: "ok"; snapshot: SharedTripSnapshot }
  /** The link was revoked or its trip was deleted. */
  | { status: "inactive" }
  /** No (or malformed) link for this slug — treated as not found. */
  | { status: "not_found" };

export async function loadSharedTripSnapshot(
  slug: string,
  client: SupabaseClient,
): Promise<SharedTripLoadResult> {
  if (!isValidShareSlug(slug)) return { status: "not_found" };

  const { data: row, error: linkError } = await client
    .from("trip_share_links")
    .select("id, trip_id, slug, label, created_by, allow_itinerary, allow_map, allow_gallery, active, created_at, updated_at, deleted_at")
    .eq("slug", slug)
    .maybeSingle();
  if (linkError) throw new Error(`Failed to load share link: ${linkError.message}`);
  if (!row) return { status: "not_found" };
  if (!row.active || row.deleted_at != null) return { status: "inactive" };

  const share: TripShareLink = {
    id: String(row.id),
    tripId: String(row.trip_id),
    slug: String(row.slug),
    label: row.label == null ? null : String(row.label),
    createdBy: String(row.created_by),
    allowItinerary: Boolean(row.allow_itinerary),
    allowMap: Boolean(row.allow_map),
    allowGallery: Boolean(row.allow_gallery),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  };

  const { data: trip, error: tripError } = await client
    .from("trips")
    .select("id, name, destination, start_date, end_date, cover_image_url, deleted_at")
    .eq("id", share.tripId)
    .maybeSingle();
  if (tripError) throw new Error(`Failed to load trip: ${tripError.message}`);
  if (!trip || trip.deleted_at != null) return { status: "inactive" };

  let activities: SharedTripSnapshot["activities"] = [];
  if (share.allowItinerary || share.allowMap) {
    const { data, error } = await client
      .from("activities")
      .select("id, day_date, title, description, location, latitude, longitude, category, start_time")
      .eq("trip_id", share.tripId)
      .is("deleted_at", null)
      .order("day_date", { ascending: true })
      .order("position", { ascending: true });
    if (error) throw new Error(`Failed to load itinerary: ${error.message}`);
    activities = (data ?? []).map((item) => ({
      id: String(item.id),
      dayDate: String(item.day_date),
      title: String(item.title),
      description: item.description == null ? null : String(item.description),
      location: item.location == null ? null : String(item.location),
      latitude: item.latitude == null ? null : Number(item.latitude),
      longitude: item.longitude == null ? null : Number(item.longitude),
      category: item.category == null ? "general" : String(item.category),
      startTime: item.start_time == null ? null : String(item.start_time),
    }));
  }

  let media: SharedTripSnapshot["media"] = [];
  if (share.allowGallery) {
    const { data, error } = await client
      .from("trip_media")
      .select("id, caption, taken_at, storage_path")
      .eq("trip_id", share.tripId)
      .is("deleted_at", null)
      .order("taken_at", { ascending: true });
    if (error) throw new Error(`Failed to load gallery: ${error.message}`);
    media = await Promise.all(
      (data ?? []).map(async (item) => {
        let url: string | null = null;
        if (item.storage_path) {
          const { data: signed } = await client.storage
            .from("trip-media")
            .createSignedUrl(String(item.storage_path), 3600);
          url = signed?.signedUrl ?? null;
        }
        return {
          id: String(item.id),
          caption: item.caption == null ? null : String(item.caption),
          takenAt: item.taken_at == null ? null : String(item.taken_at),
          url,
        };
      }),
    );
  }

  return {
    status: "ok",
    snapshot: {
      share,
      name: String(trip.name),
      destination: trip.destination == null ? null : String(trip.destination),
      startDate: trip.start_date == null ? null : String(trip.start_date),
      endDate: trip.end_date == null ? null : String(trip.end_date),
      coverImageUrl: trip.cover_image_url == null ? null : String(trip.cover_image_url),
      activities,
      media,
    },
  };
}
