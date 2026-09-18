import { describe, expect, it, vi } from "vitest";

import { resolveActivityVote } from "@/features/activities/lib/voting-resolution";

const options = [
  { id: "a", label: "Dinner", proposedBy: "user-1", createdAt: "2026-01-01T00:00:00Z" },
  { id: "b", label: "Museum", proposedBy: "user-2", createdAt: "2026-01-01T00:00:00Z" },
];

describe("resolveActivityVote", () => {
  it("auto-approves the majority option after all eligible users vote", () => {
    const result = resolveActivityVote({ pollOptions: options, pollVotes: [
      { userId: "user-1", choice: "approve", optionId: "a", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      { userId: "user-2", choice: "approve", optionId: "a", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    ] }, 2);
    expect(result).toEqual({ status: "approved", option: options[0], tieBreaker: false });
  });

  it("uses Scout's random tie-breaker after all eligible users vote", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const result = resolveActivityVote({ pollOptions: options, pollVotes: [
      { userId: "user-1", choice: "approve", optionId: "a", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      { userId: "user-2", choice: "approve", optionId: "b", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    ] }, 2);
    expect(result).toEqual({ status: "approved", option: options[1], tieBreaker: true });
    vi.restoreAllMocks();
  });
});
