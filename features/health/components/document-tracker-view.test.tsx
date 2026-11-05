import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TravelDocument } from "@/features/health/domain/health-types";
import { DocumentTrackerView } from "@/features/health/components/document-tracker-view";
import { healthRepository } from "@/features/health/data/dexie-health-repository";

vi.mock("@/features/health/data/dexie-health-repository", () => ({
  healthRepository: {
    watchByUser: vi.fn(),
    remove: vi.fn(),
    upsert: vi.fn(),
  },
}));

describe("DocumentTrackerView", () => {
  const document: TravelDocument = {
    id: "document-1",
    userId: "user-1",
    type: "passport",
    documentNumber: null,
    countryOfIssue: null,
    issuedOn: null,
    expiryDate: "2099-01-01",
    countries: [],
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(healthRepository.watchByUser).mockImplementation((_userId, callback) => {
      callback([document]);
      return () => undefined;
    });
  });

  afterEach(() => cleanup());

  it("announces failed removal and keeps the document visible", async () => {
    vi.mocked(healthRepository.remove).mockRejectedValue(new Error("remove failed"));

    render(<DocumentTrackerView userId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Something went wrong. Please try again."
    );
    expect(screen.queryByText("Passport")).not.toBeNull();
  });
});
