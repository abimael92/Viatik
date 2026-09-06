import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { pollRepository } from "@/features/polls/data/dexie-poll-repository";

const TEST_USER = "test-poll-user";

let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  await db.open();
  await db.polls.clear();
  await db.pollVotes.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DexiePollRepository", () => {
  it("creates a poll with embedded options in order", async () => {
    const poll = await pollRepository.create({
      tripId: "trip-1",
      question: "Lunch?",
      options: ["Ramen", "Burritos"],
      createdBy: TEST_USER,
    });

    expect(poll.status).toBe("active");
    expect(poll.options.map((option) => option.label)).toEqual(["Ramen", "Burritos"]);
    expect(poll.options.every((option) => option.pollId === poll.id)).toBe(true);
  });

  it("requires a question and at least two options", async () => {
    await expect(
      pollRepository.create({ tripId: "trip-1", question: "", options: ["a", "b"], createdBy: TEST_USER }),
    ).rejects.toThrow("Poll question is required");
    await expect(
      pollRepository.create({ tripId: "trip-1", question: "Pick", options: ["only"], createdBy: TEST_USER }),
    ).rejects.toThrow("at least two options");
  });

  it("casts a vote and lets a member change it (one vote per member)", async () => {
    const poll = await pollRepository.create({
      tripId: "trip-1",
      question: "What should we do?",
      options: ["Museum", "Beach"],
      createdBy: TEST_USER,
    });
    const first = poll.options[0];
    const second = poll.options[1];

    await pollRepository.castVote(poll.id, first.id, TEST_USER);
    const afterFirst = await pollRepository.listVotesByPoll(poll.id);
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0].optionId).toBe(first.id);

    // Changing the vote upserts rather than adding a second row.
    await pollRepository.castVote(poll.id, second.id, TEST_USER);
    const afterSecond = await pollRepository.listVotesByPoll(poll.id);
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].optionId).toBe(second.id);
  });

  it("rejects votes for unknown options", async () => {
    const poll = await pollRepository.create({
      tripId: "trip-1",
      question: "Pick one",
      options: ["A", "B"],
      createdBy: TEST_USER,
    });
    await expect(pollRepository.castVote(poll.id, "missing", TEST_USER)).rejects.toThrow(
      "no longer exists",
    );
  });

  it("rejects votes once a poll is closed", async () => {
    const poll = await pollRepository.create({
      tripId: "trip-1",
      question: "Pick one",
      options: ["A", "B"],
      createdBy: TEST_USER,
    });
    const closed = await pollRepository.close(poll.id);
    expect(closed.status).toBe("closed");

    await expect(
      pollRepository.castVote(poll.id, poll.options[0].id, TEST_USER),
    ).rejects.toThrow("closed");
  });

  it("marks a poll as scheduled", async () => {
    const poll = await pollRepository.create({
      tripId: "trip-1",
      question: "Where to?",
      options: ["Park", "Pier"],
      createdBy: TEST_USER,
    });
    const scheduled = await pollRepository.markScheduled(poll.id, "activity-1");
    expect(scheduled.scheduledActivityId).toBe("activity-1");
  });
});
