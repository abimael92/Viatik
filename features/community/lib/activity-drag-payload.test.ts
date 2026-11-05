import { describe, expect, it } from "vitest";

import { parseActivityDragPayload } from "@/features/community/lib/activity-drag-payload";

describe("parseActivityDragPayload", () => {
  it("returns null for malformed JSON", () => {
    expect(parseActivityDragPayload("{")).toBeNull();
  });

  it("returns null when the activity ID is missing", () => {
    expect(parseActivityDragPayload("{}")).toBeNull();
  });

  it("returns null when the activity ID is not a string", () => {
    expect(parseActivityDragPayload(JSON.stringify({ activityId: 42 }))).toBeNull();
  });

  it("returns null when the activity ID is an empty string", () => {
    expect(parseActivityDragPayload(JSON.stringify({ activityId: "" }))).toBeNull();
  });

  it("returns null when the activity ID contains only whitespace", () => {
    expect(parseActivityDragPayload(JSON.stringify({ activityId: "   " }))).toBeNull();
  });

  it("returns a valid activity ID", () => {
    expect(parseActivityDragPayload(JSON.stringify({ activityId: "activity-1" }))).toBe("activity-1");
  });

  it("trims a valid activity ID", () => {
    expect(parseActivityDragPayload(JSON.stringify({ activityId: " activity-1 " }))).toBe("activity-1");
  });
});
