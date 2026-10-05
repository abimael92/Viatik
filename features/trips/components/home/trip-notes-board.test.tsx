import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { TripNotesBoard } from "@/features/trips/components/home/trip-notes-board";
import { tripNoteRepository } from "@/features/trips/data/dexie-trip-note-repository";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import type { RecordedAudio } from "@/features/media/lib/audio-recorder";

const state = vi.hoisted(() => ({
  notes: [] as unknown[],
  media: [] as unknown[],
  transcript: null as unknown,
  getTranscript: vi.fn(),
  recorder: {
    supported: true,
    status: "idle" as "idle" | "starting" | "recording" | "paused",
    elapsedMs: 0,
    error: null as string | null,
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
  },
  onRecorded: null as null | ((audio: RecordedAudio) => void),
}));

vi.mock("@/lib/db/database-provider", () => ({
  useDatabase: () => ({ mediaTranscripts: { get: state.getTranscript } }),
}));

vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (query: () => unknown) => {
    void query();
    return state.transcript;
  },
}));

vi.mock("@/features/trips/data/dexie-trip-note-repository", () => ({
  tripNoteRepository: {
    watchByTrip: vi.fn((_tripId: string, onChange: (notes: unknown[]) => void) => {
      onChange(state.notes);
      return () => {};
    }),
    create: vi.fn(),
    createVoiceNote: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@/features/media/data/dexie-media-repository", () => ({
  mediaRepository: {
    watchByIds: vi.fn((ids: string[], onChange: (media: unknown[]) => void) => {
      onChange(state.media.filter((item) => ids.includes((item as { id: string }).id)));
      return () => {};
    }),
    retry: vi.fn(),
  },
}));

vi.mock("@/features/media/lib/use-audio-recorder", () => ({
  useAudioRecorder: (options: { onRecorded: (audio: RecordedAudio) => void }) => {
    state.onRecorded = options.onRecorded;
    return state.recorder;
  },
}));

const textNote = {
  id: "note-1",
  tripId: "trip-1",
  userId: "user-1",
  content: "Buffet closes at 12 PM",
  audioMediaId: null,
  createdBy: "user-1",
  updatedBy: "user-1",
  deletedBy: null,
  version: 1,
  createdAt: "2026-09-27T12:00:00.000Z",
  updatedAt: "2026-09-27T12:00:00.000Z",
  deletedAt: null,
};

const voiceNote = { ...textNote, id: "note-2", content: "", audioMediaId: "media-1" };

beforeEach(() => {
  state.notes = [textNote];
  state.media = [];
  state.transcript = null;
  state.getTranscript.mockResolvedValue(undefined);
  state.recorder.supported = true;
  state.recorder.status = "idle";
  state.recorder.elapsedMs = 0;
  state.recorder.error = null;
  URL.createObjectURL = vi.fn(() => "blob:voice-note");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TripNotesBoard", () => {
  it("saves a note from the inline field and opens a saved note for edit", async () => {
    vi.mocked(tripNoteRepository.create).mockResolvedValue({} as never);
    render(<TripNotesBoard tripId="trip-1" userId="user-1" />);

    fireEvent.change(screen.getByLabelText("Write a quick note..."), {
      target: { value: "Happy hour at 8 PM" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() => expect(tripNoteRepository.create).toHaveBeenCalledOnce());
    expect(vi.mocked(tripNoteRepository.create).mock.calls[0]?.[0]).toMatchObject({
      tripId: "trip-1",
      userId: "user-1",
      content: "Happy hour at 8 PM",
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit note: Buffet closes at 12 PM" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(tripNoteRepository.remove).toHaveBeenCalledWith("note-1", "user-1"));
  });

  it("records a voice note and saves it with the typed text as its caption", async () => {
    vi.mocked(tripNoteRepository.createVoiceNote).mockResolvedValue({} as never);
    render(<TripNotesBoard tripId="trip-1" userId="user-1" />);

    fireEvent.change(screen.getByLabelText("Write a quick note..."), { target: { value: "Market stall" } });
    fireEvent.click(screen.getByRole("button", { name: "Record voice note" }));
    expect(state.recorder.start).toHaveBeenCalledOnce();

    const blob = new Blob(["voice"], { type: "audio/webm" });
    await act(async () => {
      await state.onRecorded?.({ blob, contentType: "audio/webm", durationMs: 4200 });
    });

    expect(tripNoteRepository.createVoiceNote).toHaveBeenCalledWith(expect.objectContaining({
      tripId: "trip-1",
      userId: "user-1",
      content: "Market stall",
      audio: expect.objectContaining({ mediaId: expect.any(String), blob, contentType: "audio/webm", durationMs: 4200 }),
    }));
    await waitFor(() => expect((screen.getByLabelText("Write a quick note...") as HTMLInputElement).value).toBe(""));
  });

  it("shows a recording bar with the elapsed time, stop, and cancel", () => {
    state.recorder.status = "recording";
    state.recorder.elapsedMs = 65_000;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TripNotesBoard tripId="trip-1" userId="user-1" />);

    expect(screen.getByRole("timer").textContent).toBe("01:05 / 02:00");
    expect(screen.queryByLabelText("Write a quick note...")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pause recording" }));
    expect(state.recorder.pause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Stop and save" }));
    expect(state.recorder.stop).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Cancel recording" }));
    expect(confirm).toHaveBeenCalledWith("Discard this recording?");
    expect(state.recorder.cancel).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it("discards a short recording without asking", () => {
    state.recorder.status = "recording";
    state.recorder.elapsedMs = 2_000;
    const confirm = vi.spyOn(window, "confirm");
    render(<TripNotesBoard tripId="trip-1" userId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel recording" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(state.recorder.cancel).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it("keeps the recording bar open while paused", () => {
    state.recorder.status = "paused";
    state.recorder.elapsedMs = 20_000;
    render(<TripNotesBoard tripId="trip-1" userId="user-1" />);

    expect(screen.getByText("Paused")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume recording" }));
    expect(state.recorder.resume).toHaveBeenCalledOnce();
  });

  it("hides the microphone where recording is unavailable", () => {
    state.recorder.supported = false;
    render(<TripNotesBoard tripId="trip-1" userId="user-1" />);

    expect(screen.queryByRole("button", { name: "Record voice note" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add note" })).toBeTruthy();
  });

  it("lists voice notes as cards with a custom player and offers a retry after a failed upload", () => {
    state.notes = [textNote, voiceNote];
    state.media = [{ id: "media-1", tripId: "trip-1", kind: "audio", durationMs: 4200, blob: new Blob(["voice"], { type: "audio/webm" }), uploadedUrl: null, uploadStatus: "failed", createdBy: "user-1", deletedAt: null }];
    const { container } = render(<TripNotesBoard tripId="trip-1" userId="user-1" />);

    const list = screen.getByRole("list", { name: "Voice notes" });
    const card = within(list).getByRole("article", { name: "Voice note" });
    expect(card.querySelector("time")?.getAttribute("dateTime")).toBe("2026-09-27T12:00:00.000Z");
    expect(within(card).getByLabelText("Duration 00:04")).toBeTruthy();
    const audio = container.querySelector("audio");
    expect(audio?.getAttribute("src")).toBe("blob:voice-note");
    expect(audio?.hasAttribute("controls")).toBe(false);
    expect(within(card).getByRole("button", { name: "Play voice note" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: /Playback speed 1x/ })).toBeTruthy();

    expect(screen.getByText("Upload failed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry upload" }));
    expect(mediaRepository.retry).toHaveBeenCalledWith("media-1");
  });

  it("toggles the transcript on a voice note card", () => {
    state.notes = [voiceNote];
    state.media = [{ id: "media-1", tripId: "trip-1", kind: "audio", durationMs: 4200, blob: new Blob(["voice"]), uploadedUrl: null, uploadStatus: "uploaded", createdBy: "user-1", deletedAt: null }];
    render(<TripNotesBoard tripId="trip-1" userId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Show transcript" }));

    expect(screen.getByRole("button", { name: "Hide transcript" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("No transcript yet. It will appear here once the note is transcribed.")).toBeTruthy();
    expect(state.getTranscript).toHaveBeenCalledWith("media-1");
  });

  it("renders the transcript text and language from the local Dexie query", () => {
    state.notes = [voiceNote];
    state.transcript = { mediaId: "media-1", tripId: "trip-1", status: "done", text: "Turn left at the next street.", language: "en", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 1 };
    state.media = [{ id: "media-1", tripId: "trip-1", kind: "audio", durationMs: 4200, blob: new Blob(["voice"]), uploadedUrl: null, uploadStatus: "uploaded", createdBy: "user-1", deletedAt: null }];
    render(<TripNotesBoard tripId="trip-1" userId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Show transcript" }));

    expect(screen.getByText("Turn left at the next street.")).toBeTruthy();
    expect(screen.getByText("Auto-transcribed · EN")).toBeTruthy();
  });

  it("keeps the same clip URL when only the upload status changes", () => {
    state.notes = [voiceNote];
    const clip = { id: "media-1", tripId: "trip-1", kind: "audio", durationMs: 4200, uploadedUrl: null, createdBy: "user-1", deletedAt: null };
    let emit: (rows: unknown[]) => void = () => {};
    const watchByIds = vi.mocked(mediaRepository.watchByIds);
    const original = watchByIds.getMockImplementation();
    onTestFinished(() => {
      if (original) watchByIds.mockImplementation(original);
    });
    watchByIds.mockImplementation((ids, onChange) => {
      if (!ids.includes("media-1")) return () => {};
      emit = onChange as (rows: unknown[]) => void;
      onChange([{ ...clip, blob: new Blob(["voice"]), uploadStatus: "pending" }] as never);
      return () => {};
    });
    render(<TripNotesBoard tripId="trip-1" userId="user-1" />);

    act(() => emit([{ ...clip, blob: new Blob(["voice"]), uploadStatus: "uploaded" }]));

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("tells collaborators a clip is not on this device yet", () => {
    state.notes = [voiceNote];
    render(<TripNotesBoard tripId="trip-1" userId="user-2" />);

    expect(screen.getByText("Available when online")).toBeTruthy();
  });

  it("shows that an unsynced clip is safe on this device", () => {
    state.notes = [voiceNote];
    state.media = [{ id: "media-1", tripId: "trip-1", kind: "audio", durationMs: 4200, blob: new Blob(["voice"]), uploadedUrl: null, uploadStatus: "pending", createdBy: "user-1", deletedAt: null }];
    render(<TripNotesBoard tripId="trip-1" userId="user-1" />);

    expect(screen.getByText("Saved on this device")).toBeTruthy();
  });
});
