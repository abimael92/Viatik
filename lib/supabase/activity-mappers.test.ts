import { describe, expect, it } from "vitest";

import type { Activity } from "@/features/domain/entities";
import { activityToRow, rowToActivity } from "@/lib/supabase/mappers";

const timestamp = "2026-09-15T12:00:00.000Z";

describe("activity mappers", () => {
  it("writes structured place metadata and suppresses deprecated location fields", () => {
    const activity: Activity = {
      id: "activity-1",
      tripId: "trip-1",
      dayDate: "2026-09-16",
      title: "Visit the Prado",
      description: null,
      placeName: "Museo Nacional del Prado",
      formattedAddress: "Retiro, 28014 Madrid, Spain",
      placeId: "ChIJ7aLYZp0oQg0R4zT8xCG8ndY",
      location: "legacy location",
      latitude: 40.4138,
      longitude: -3.6921,
      category: "culture",
      timingSpecificity: "flexible",
      flexiblePeriod: "morning",
      startTime: null,
      endTime: null,
      bookingReference: "PRADO-42",
      participants: [{ userId: "user-1", status: "attending" }],
      pollStatus: "proposed",
      votingEndsAt: "2026-09-16T18:00:00.000Z",
      pollOptions: [{ id: "option-1", label: "Visit the Prado", proposedBy: "user-1", createdAt: timestamp }],
      pollVotes: [{ userId: "user-1", choice: "approve", optionId: "option-1", createdAt: timestamp, updatedAt: timestamp }],
      position: 1,
      estimatedCostMinor: null,
      createdBy: "user-1",
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    expect(activityToRow(activity)).toMatchObject({
      place_name: "Museo Nacional del Prado",
      formatted_address: "Retiro, 28014 Madrid, Spain",
      place_id: "ChIJ7aLYZp0oQg0R4zT8xCG8ndY",
      location: null,
      latitude: null,
      longitude: null,
      category: "sightseeing",
      timing_specificity: "flexible",
      flexible_period: "morning",
      booking_reference: "PRADO-42",
      participants: [{ userId: "user-1", status: "attending" }],
      poll_status: "proposed",
      voting_ends_at: "2026-09-16T18:00:00.000Z",
      poll_options: [{ id: "option-1", label: "Visit the Prado", proposedBy: "user-1", createdAt: timestamp }],
      poll_votes: [{ userId: "user-1", choice: "approve", optionId: "option-1", createdAt: timestamp, updatedAt: timestamp }],
      updated_by: "user-1",
      version: 1,
    });
  });

  it("ignores deprecated remote coordinates when reading", () => {
    const activity = rowToActivity({
      id: "activity-1",
      trip_id: "trip-1",
      day_date: "2026-09-16",
      title: "Visit the Prado",
      description: null,
      place_name: "Museo Nacional del Prado",
      formatted_address: "Retiro, 28014 Madrid, Spain",
      place_id: "place-1",
      location: "legacy location",
      latitude: 40.4138,
      longitude: -3.6921,
      category: "food",
      timing_specificity: "flexible",
      flexible_period: "evening",
      booking_reference: "DINNER-7",
      participants: [
        { userId: "user-1", status: "declined" },
        { userId: null, travelerId: "traveler-1", displayName: "Alex Chen", status: "attending" },
      ],
      poll_status: "voting",
      voting_ends_at: "2026-09-16T18:00:00.000Z",
      poll_options: [{ id: "option-1", label: "Dinner", proposedBy: "user-2", createdAt: timestamp }],
      poll_votes: [{ userId: "user-1", choice: "decline", optionId: null, createdAt: timestamp, updatedAt: timestamp }],
      start_time: null,
      end_time: null,
      position: 1,
      estimated_cost: null,
      created_by: "user-1",
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    });

    expect(activity).toMatchObject({
      placeName: "Museo Nacional del Prado",
      formattedAddress: "Retiro, 28014 Madrid, Spain",
      placeId: "place-1",
      category: "food-and-drink",
      timingSpecificity: "flexible",
      flexiblePeriod: "evening",
      bookingReference: "DINNER-7",
      participants: [
        { userId: "user-1", travelerId: null, displayName: null, status: "declined" },
        { userId: null, travelerId: "traveler-1", displayName: "Alex Chen", status: "attending" },
      ],
      pollStatus: "voting",
      votingEndsAt: "2026-09-16T18:00:00.000Z",
      pollOptions: [{ id: "option-1", label: "Dinner", proposedBy: "user-2", createdAt: timestamp }],
      pollVotes: [{ userId: "user-1", choice: "decline", optionId: null, createdAt: timestamp, updatedAt: timestamp }],
    });
    expect(activity).not.toHaveProperty("location");
    expect(activity).not.toHaveProperty("latitude");
    expect(activity).not.toHaveProperty("longitude");
  });
});
