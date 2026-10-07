import { describe, expect, it } from "vitest";

import { loadSharedTripSnapshot } from "@/features/sharing/lib/shared-trip";

function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    trip_id: "trip-1",
    slug: "Abc123Def456",
    label: "Family",
    created_by: "owner-1",
    allow_itinerary: true,
    allow_map: true,
    allow_gallery: true,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

const tripRow = {
  id: "trip-1",
  name: "Paris Week",
  destination: "Paris",
  start_date: "2026-06-01",
  end_date: "2026-06-08",
  cover_image_url: "https://cover.jpg",
  deleted_at: null,
};

const activityRow = {
  id: "act-1",
  trip_id: "trip-1",
  day_date: "2026-06-02",
  title: "Louvre",
  description: "Morning visit",
  location: "Louvre Museum",
  latitude: 48.8606,
  longitude: 2.3376,
  category: "sightseeing",
  start_time: "2026-06-02T09:00:00Z",
};

const mediaRow = { id: "media-1", trip_id: "trip-1", kind: "photo", public_gallery: true, caption: "The gallery", taken_at: "2026-06-02", storage_path: "trip-1/media-1.jpg", deleted_at: null };

function fakeClient(data: Record<string, unknown>) {
  const signedPaths: string[] = [];
  const storage = {
    from: () => ({
      createSignedUrl: async (path: string) => {
        signedPaths.push(path);
        return { data: { signedUrl: `https://signed/${path.split("/").at(-1)}` }, error: null };
      },
    }),
  };
  const rows = (table: string) => data[table];
  const chain = (table: string) => {
    const filters: Array<{ column: string; operator: "eq" | "is"; value: unknown }> = [];
    const selectedColumns: string[] = [];
    const filteredRows = () => {
      const value = rows(table);
      const list = Array.isArray(value) ? value : value ? [value] : [];
      return list.filter((row) => filters.every(({ column, operator, value: expected }) =>
        (operator === "eq" ? row[column] === expected : row[column] == null === (expected == null)),
      ));
    };
    const query = {
      select: (columns: string) => {
        selectedColumns.push(columns);
        return query;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ column, operator: "eq", value });
        return query;
      },
      is: (column: string, value: unknown) => {
        filters.push({ column, operator: "is", value });
        return query;
      },
      order: () => query,
      maybeSingle: async () => ({ data: filteredRows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject?: (reason?: unknown) => unknown) =>
        Promise.resolve({ data: filteredRows(), error: null }).then(resolve, reject),
    };
    return query;
  };
  return {
    storage,
    signedPaths,
    from: (table: string) => chain(table),
  } as never;
}

describe("loadSharedTripSnapshot", () => {
  it("loads an active link with itinerary, map data, and signed gallery URLs", async () => {
    const client = fakeClient({
      trip_share_links: linkRow(),
      trips: tripRow,
      activities: [activityRow],
      trip_media: [mediaRow],
    });

    const result = await loadSharedTripSnapshot("Abc123Def456", client as never);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.snapshot.share.slug).toBe("Abc123Def456");
    expect(result.snapshot.name).toBe("Paris Week");
    expect(result.snapshot.activities).toHaveLength(1);
    expect(result.snapshot.activities[0].title).toBe("Louvre");
    expect(result.snapshot.media[0].url).toBe("https://signed/media-1.jpg");
  });

  it("signs only live legacy-public photos, excluding member-only, null, audio, and deleted media", async () => {
    const client = fakeClient({
      trip_share_links: linkRow(),
      trips: tripRow,
      activities: [],
      trip_media: [
        mediaRow,
        { ...mediaRow, id: "private-photo", public_gallery: false },
        { ...mediaRow, id: "unclassified-photo", public_gallery: null },
        { ...mediaRow, id: "audio", kind: "audio" },
        { ...mediaRow, id: "removed-photo", deleted_at: "2026-06-03T00:00:00Z" },
      ],
    });

    const result = await loadSharedTripSnapshot("Abc123Def456", client as never);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.snapshot.media.map(({ id }) => id)).toEqual(["media-1"]);
    expect((client as unknown as { signedPaths: string[] }).signedPaths).toEqual(["trip-1/media-1.jpg"]);
  });

  it("returns not_found for malformed or unknown slugs", async () => {
    const client = fakeClient({ trip_share_links: null, trips: null, activities: [], trip_media: [] });
    expect((await loadSharedTripSnapshot("tooshort", client as never)).status).toBe("not_found");
    expect((await loadSharedTripSnapshot("MissingSlug", client as never)).status).toBe("not_found");
  });

  it("returns inactive when the link is disabled or the trip is deleted", async () => {
    const disabled = fakeClient({
      trip_share_links: linkRow({ active: false }),
      trips: tripRow,
      activities: [],
      trip_media: [],
    });
    expect((await loadSharedTripSnapshot("Abc123Def456", disabled as never)).status).toBe("inactive");

    const deletedTrip = fakeClient({
      trip_share_links: linkRow(),
      trips: { ...tripRow, deleted_at: "2026-07-01T00:00:00Z" },
      activities: [],
      trip_media: [],
    });
    expect((await loadSharedTripSnapshot("Abc123Def456", deletedTrip as never)).status).toBe("inactive");
  });

  it("gates sections by the link's permission flags", async () => {
    const client = fakeClient({
      trip_share_links: linkRow({ allow_itinerary: false, allow_map: false, allow_gallery: false }),
      trips: tripRow,
      activities: [activityRow],
      trip_media: [mediaRow],
    });
    const result = await loadSharedTripSnapshot("Abc123Def456", client as never);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.snapshot.activities).toEqual([]);
    expect(result.snapshot.media).toEqual([]);
  });
});
