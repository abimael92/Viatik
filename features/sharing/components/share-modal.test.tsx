import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TripShareLink } from "@/features/sharing/domain/share-types";
import { shareLinkRepository } from "@/features/sharing/data/dexie-share-repository";
import { ShareModal } from "@/features/sharing/components/share-modal";

if (typeof window !== "undefined") {
  window.matchMedia ??= () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock("@/features/sharing/data/dexie-share-repository", () => ({
  shareLinkRepository: {
    watchByTrip: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const link: TripShareLink = {
  id: "link-1",
  tripId: "trip-1",
  slug: "Abc123Def456",
  label: null,
  createdBy: "owner-1",
  allowItinerary: true,
  allowMap: true,
  allowGallery: true,
  active: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

let onChange: ((links: TripShareLink[]) => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  onChange = undefined;
  vi.mocked(shareLinkRepository.watchByTrip).mockImplementation((_tripId, cb) => {
    onChange = cb;
    return () => {};
  });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => cleanup());

describe("ShareModal", () => {
  it("renders existing links with their copy button", () => {
    render(<ShareModal open tripId="trip-1" userId="owner-1" onOpenChange={() => {}} />);
    act(() => onChange?.([link]));

    expect(screen.getByText("Abc123Def456")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy link/ })).toBeTruthy();
  });

  it("creates a new link when New link is tapped", async () => {
    render(<ShareModal open tripId="trip-1" userId="owner-1" onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /New link/ }));

    await waitFor(() => {
      expect(shareLinkRepository.create).toHaveBeenCalledWith({ tripId: "trip-1", createdBy: "owner-1" });
    });
  });

  it("copies the share URL to the clipboard", async () => {
    render(<ShareModal open tripId="trip-1" userId="owner-1" onOpenChange={() => {}} />);
    act(() => onChange?.([link]));

    fireEvent.click(screen.getByRole("button", { name: /Copy link/ }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining(`/share/${link.slug}`),
      );
    });
  });

  it("toggles permissions via the repository update", async () => {
    render(<ShareModal open tripId="trip-1" userId="owner-1" onOpenChange={() => {}} />);
    act(() => onChange?.([link]));

    fireEvent.click(screen.getByRole("button", { name: /Itinerary on/ }));
    await waitFor(() => {
      expect(shareLinkRepository.update).toHaveBeenCalledWith("link-1", { allowItinerary: false });
    });
  });
});
