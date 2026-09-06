import { describe, expect, it } from "vitest";

import type { Poll, PollOption, PollVote } from "@/features/polls/domain/poll-types";
import {
  buildActivityFromWinner,
  calculateTally,
  countVotesByOption,
  pickWinnerDay,
} from "@/features/polls/lib/poll-engine";

function option(id: string, label: string, position: number): PollOption {
  return { id, pollId: "poll-1", label, position, createdAt: "2026-01-01T00:00:00Z" };
}

const OPTIONS = [option("opt-a", "Museum", 0), option("opt-b", "Beach day", 1), option("opt-c", "Hiking", 2)];

function poll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: "poll-1",
    tripId: "trip-1",
    question: "What should we do Saturday?",
    options: OPTIONS,
    createdBy: "user-1",
    status: "active",
    dayDate: null,
    location: null,
    category: null,
    scheduledActivityId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

function vote(optionId: string, userId: string): PollVote {
  return {
    id: `vote-${userId}-${optionId}`,
    pollId: "poll-1",
    optionId,
    userId,
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

describe("countVotesByOption", () => {
  it("counts votes per option", () => {
    const votes = [vote("opt-a", "u1"), vote("opt-a", "u2"), vote("opt-b", "u3")];
    expect(countVotesByOption(votes)).toEqual({ "opt-a": 2, "opt-b": 1 });
  });

  it("returns an empty map for no votes", () => {
    expect(countVotesByOption([])).toEqual({});
  });
});

describe("calculateTally", () => {
  it("computes accurate percentages and picks the single leader", () => {
    const votes = [
      vote("opt-a", "u1"),
      vote("opt-a", "u2"),
      vote("opt-a", "u3"),
      vote("opt-b", "u4"),
      vote("opt-c", "u5"),
    ];
    const tally = calculateTally(poll(), votes);

    expect(tally.totalVotes).toBe(5);
    expect(tally.hasVotes).toBe(true);
    expect(tally.isTie).toBe(false);

    // 3/5 = 60%, 1/5 = 20%, 1/5 = 20% — and options follow display order.
    expect(tally.options.map((entry) => entry.option.id)).toEqual(["opt-a", "opt-b", "opt-c"]);
    expect(tally.options.map((entry) => entry.votes)).toEqual([3, 1, 1]);
    expect(tally.options.map((entry) => entry.percentage)).toEqual([60, 20, 20]);

    expect(tally.winner?.id).toBe("opt-a");
    expect(tally.leaders.map((leader) => leader.id)).toEqual(["opt-a"]);
  });

  it("returns a null winner and zero percentages when there are no votes", () => {
    const tally = calculateTally(poll(), []);

    expect(tally.totalVotes).toBe(0);
    expect(tally.hasVotes).toBe(false);
    expect(tally.winner).toBeNull();
    expect(tally.leaders).toEqual([]);
    expect(tally.isTie).toBe(false);
    expect(tally.options.every((entry) => entry.percentage === 0)).toBe(true);
    expect(tally.options.every((entry) => entry.votes === 0)).toBe(true);
  });

  it("detects a tie between the top options", () => {
    const votes = [vote("opt-a", "u1"), vote("opt-b", "u2"), vote("opt-c", "u3")];
    const tally = calculateTally(poll(), votes);

    expect(tally.totalVotes).toBe(3);
    expect(tally.isTie).toBe(true);
    expect(tally.winner).toBeNull();
    expect(tally.leaders.map((leader) => leader.id)).toEqual(["opt-a", "opt-b", "opt-c"]);
  });

  it("handles a two-way tie", () => {
    const votes = [vote("opt-a", "u1"), vote("opt-a", "u2"), vote("opt-b", "u3"), vote("opt-b", "u4")];
    const tally = calculateTally(poll(), votes);

    expect(tally.isTie).toBe(true);
    expect(tally.winner).toBeNull();
    expect(tally.leaders.map((leader) => leader.id)).toEqual(["opt-a", "opt-b"]);
  });

  it("ignores options that received no votes when picking a winner", () => {
    const votes = [vote("opt-a", "u1"), vote("opt-a", "u2")];
    const tally = calculateTally(poll(), votes);

    expect(tally.isTie).toBe(false);
    expect(tally.winner?.id).toBe("opt-a");
    expect(tally.options.find((entry) => entry.option.id === "opt-c")?.percentage).toBe(0);
  });

  it("rounds percentages to whole numbers", () => {
    // 2/3 = 66.6 → 67, 1/3 = 33.3 → 33.
    const votes = [vote("opt-a", "u1"), vote("opt-a", "u2"), vote("opt-b", "u3")];
    const tally = calculateTally(poll(), votes);
    expect(tally.options.map((entry) => entry.percentage)).toEqual([67, 33, 0]);
  });
});

describe("pickWinnerDay", () => {
  it("prefers the poll's day hint", () => {
    const tripDays = ["2026-06-01", "2026-06-02"];
    expect(pickWinnerDay(poll({ dayDate: "2026-06-02" }), tripDays)).toBe("2026-06-02");
  });

  it("falls back to the first trip day", () => {
    expect(pickWinnerDay(poll(), ["2026-06-01", "2026-06-02"])).toBe("2026-06-01");
  });

  it("returns null when there is no hint and no trip days", () => {
    expect(pickWinnerDay(poll(), [])).toBeNull();
  });
});

describe("buildActivityFromWinner", () => {
  it("maps a winning option to an itinerary activity", () => {
    const activity = buildActivityFromWinner({
      poll: poll({ location: "Downtown", category: "sightseeing" }),
      winner: OPTIONS[0],
      dayDate: "2026-06-01",
      position: 2048,
      userId: "user-1",
    });

    expect(activity).toMatchObject({
      tripId: "trip-1",
      dayDate: "2026-06-01",
      title: "Museum",
      description: "Won poll “What should we do Saturday?”",
      location: "Downtown",
      category: "sightseeing",
      position: 2048,
      createdBy: "user-1",
    });
    expect(activity.id).toBeTruthy();
  });

  it("defaults category and description when hints are missing", () => {
    const activity = buildActivityFromWinner({
      poll: poll(),
      winner: OPTIONS[1],
      dayDate: "2026-06-02",
      position: 1024,
      userId: "user-1",
    });
    expect(activity.category).toBe("general");
    expect(activity.location).toBeNull();
  });
});
