import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TripGallery } from "@/features/trips/components/trip-gallery";
import type { TripMedia } from "@/features/domain/entities-media";

if (typeof window !== "undefined") {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.PointerEvent ??= class PointerEvent extends MouseEvent {} as unknown as typeof PointerEvent;
  window.matchMedia ??= () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

let callback: (media: TripMedia[]) => void = () => {};

const makeMedia = (id: string, caption: string, takenAt: string | null = null): TripMedia => ({
  id,
  tripId: "trip-1",
  activityId: null,
  caption,
  takenAt,
  blob: new Blob([id], { type: "image/jpeg" }),
  storagePath: `${id}.jpg`,
  uploadedUrl: null,
  signedUrlExpiresAt: null,
  contentType: "image/jpeg",
  byteSize: 1,
  createdBy: "user-1",
  updatedBy: "user-1",
  deletedBy: null,
  restoredAt: null,
  restoredBy: null,
  version: 1,
  uploadStatus: "uploaded",
  uploadProgress: 100,
  uploadError: null,
  uploadAttempts: 0,
  nextUploadAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
});

vi.mock("@/features/media/data/dexie-media-repository", () => ({
  mediaRepository: {
    watchByTrip: vi.fn((_tripId, _activityId, cb) => {
      callback = cb;
      return () => {};
    }),
    create: vi.fn(),
    remove: vi.fn(),
    retry: vi.fn(),
  },
}));

vi.mock("browser-image-compression", () => ({
  default: vi.fn((file: File) => Promise.resolve(file)),
}));

vi.mock("@/lib/sync/use-sync-status", () => ({
  useSyncStatus: () => ({ isOnline: true }),
}));

describe("TripGallery", () => {
  beforeEach(() => {
    callback = () => {};
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the lightbox and navigates with previous/next", async () => {
    render(<TripGallery tripId="trip-1" userId="user-1" canEdit={false} />);
    act(() => { callback([makeMedia("m1", "Beach"), makeMedia("m2", "Dinner")]); });

    const image = screen.getByRole("button", { name: /View Beach in lightbox/ });
    fireEvent.click(image);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(within(dialog as HTMLElement).getByAltText("Beach")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    await waitFor(() => expect(within(dialog as HTMLElement).getByAltText("Dinner")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    await waitFor(() => expect(within(dialog as HTMLElement).getByAltText("Beach")).toBeTruthy());

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("hides upload and delete controls for viewers", () => {
    render(<TripGallery tripId="trip-1" userId="user-1" canEdit={false} />);
    act(() => { callback([makeMedia("m1", "Beach")]); });

    expect(screen.queryByLabelText("Add photos")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete photo" })).toBeNull();
    expect(screen.getByRole("button", { name: /View Beach in lightbox/ })).toBeTruthy();
  });

  it("groups photos by day with headers and a fallback bucket for missing dates", () => {
    render(<TripGallery tripId="trip-1" userId="user-1" canEdit={false} />);
    act(() => {
      callback([
        makeMedia("m1", "Beach", "2026-01-03"),
        makeMedia("m2", "Dinner", "2026-01-03"),
        makeMedia("m3", "Sunrise", "2026-01-01"),
        makeMedia("m4", "Old", null),
      ]);
    });

    fireEvent.click(screen.getByRole("button", { name: "By Day" }));

    expect(screen.getByRole("heading", { name: "2026-01-03" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "2026-01-01" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "No date / Older" })).toBeTruthy();

    expect(screen.getByRole("button", { name: /View Beach in lightbox/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /View Dinner in lightbox/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /View Old in lightbox/ })).toBeTruthy();
  });

  it("filters to photos taken today", () => {
    const today = new Date().toISOString().slice(0, 10);
    render(<TripGallery tripId="trip-1" userId="user-1" canEdit={false} />);
    act(() => {
      callback([makeMedia("m1", "TodayShot", today), makeMedia("m2", "OldShot", "2026-01-01")]);
    });

    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    expect(screen.getByRole("button", { name: /View TodayShot in lightbox/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /View OldShot in lightbox/ })).toBeNull();
  });

  it("shows an empty message when the selected view has no photos", () => {
    render(<TripGallery tripId="trip-1" userId="user-1" canEdit={false} />);
    act(() => { callback([makeMedia("m1", "OldShot", "2026-01-01")]); });

    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    expect(screen.getByText("No photos match this view.")).toBeTruthy();
  });
});
