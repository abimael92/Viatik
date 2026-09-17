import { describe, expect, it } from "vitest";

import type { Decision, DecisionOption, DecisionVote } from "@/features/domain/entities";
import {
  decisionOptionToRow,
  decisionToRow,
  decisionVoteToRow,
  rowToDecision,
  rowToDecisionOption,
  rowToDecisionVote,
} from "@/lib/supabase/mappers";

const timestamp = "2026-09-16T12:00:00.000Z";

const decision: Decision = {
  id: "decision-1",
  tripId: "trip-1",
  type: "standalone_poll",
  question: "Where should we eat?",
  status: "open",
  votingEndsAt: "2026-09-17T18:00:00.000Z",
  resolution: null,
  resolvedBy: null,
  resolvedAt: null,
  createdAt: timestamp,
  createdBy: "user-1",
  updatedAt: timestamp,
  updatedBy: "user-1",
  version: 1,
  deletedAt: null,
  deletedBy: null,
};

const option: DecisionOption = {
  id: "option-1",
  decisionId: "decision-1",
  label: "Ramen",
  metadata: { location: "Shibuya" },
  position: 0,
  createdAt: timestamp,
  createdBy: "user-1",
  updatedAt: timestamp,
  updatedBy: "user-1",
  version: 1,
  deletedAt: null,
  deletedBy: null,
};

const vote: DecisionVote = {
  id: "vote-1",
  decisionId: "decision-1",
  optionId: "option-1",
  userId: "user-2",
  createdAt: timestamp,
  createdBy: "user-2",
  updatedAt: timestamp,
  updatedBy: "user-2",
  version: 1,
  deletedAt: null,
  deletedBy: null,
};

describe("decision mappers", () => {
  it("maps decisions to and from Supabase rows", () => {
    expect(rowToDecision(decisionToRow(decision))).toEqual(decision);
  });

  it("maps options to and from Supabase rows", () => {
    expect(rowToDecisionOption(decisionOptionToRow(option))).toEqual(option);
  });

  it("maps votes to and from Supabase rows", () => {
    expect(rowToDecisionVote(decisionVoteToRow(vote))).toEqual(vote);
  });
});
