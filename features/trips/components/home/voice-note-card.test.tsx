import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VoiceNoteCard } from "@/features/trips/components/home/voice-note-card";
import type { TripMedia } from "@/features/domain/entities-media";
import type { TripNote } from "@/features/trips/domain/trip-note";

const { retry } = vi.hoisted(() => ({ retry: vi.fn() }));

vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: () => undefined,
}));

vi.mock("@/lib/db/database-provider", () => ({
  useDatabase: () => ({ mediaTranscripts: { get: vi.fn() } }),
}));

vi.mock("@/features/media/data/dexie-media-repository", () => ({
  mediaRepository: { retry },
}));

vi.mock("@/features/media/components/voice-note-player", () => ({
  VoiceNotePlayer: () => null,
}));

vi.mock("@/features/media/components/voice-transcript", () => ({
  TranscriptPanel: () => null,
  TranscriptToggle: () => null,
}));

const note: TripNote = {
  id: "note-1",
  tripId: "trip-1",
  userId: "user-1",
  content: "Voice note",
  audioMediaId: "media-voice",
  createdBy: "user-1",
  updatedBy: "user-1",
  deletedBy: null,
  version: 1,
  createdAt: "2026-11-05T12:00:00.000Z",
  updatedAt: "2026-11-05T12:00:00.000Z",
  deletedAt: null,
};

const failedMedia: TripMedia = {
  id: "media-voice",
  tripId: "trip-1",
  activityId: null,
  kind: "audio",
  publicGallery: null,
  durationMs: 1_000,
  caption: null,
  blob: null,
  storagePath: "trip-1/media-voice",
  uploadedUrl: null,
  signedUrlExpiresAt: null,
  contentType: "audio/webm",
  byteSize: 1,
  createdBy: "user-1",
  updatedBy: "user-1",
  deletedBy: null,
  restoredAt: null,
  restoredBy: null,
  version: 1,
  uploadStatus: "failed",
  uploadProgress: 0,
  uploadError: null,
  uploadAttempts: 1,
  nextUploadAt: null,
  createdAt: "2026-11-05T12:00:00.000Z",
  updatedAt: "2026-11-05T12:00:00.000Z",
  deletedAt: null,
};

describe("VoiceNoteCard", () => {
  it("announces a rejected retry and preserves the failed upload state", async () => {
    retry.mockRejectedValueOnce(new Error("retry failed"));
    render(
      <VoiceNoteCard
        note={note}
        media={failedMedia}
        userId="user-1"
        onEdit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry upload" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Upload failed");
    expect(screen.getByText("Upload failed", { selector: "span[aria-live='polite']" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry upload" })).toBeTruthy();
    expect(retry).toHaveBeenCalledWith("media-voice");
  });
});
