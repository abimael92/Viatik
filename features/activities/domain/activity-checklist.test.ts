import { describe, expect, it } from "vitest";

import {
  activityChecklistProgress,
  archiveActivityChecklistItem,
  createActivityChecklistItem,
  MAX_ACTIVITY_CHECKLIST_ITEMS,
  MAX_ACTIVITY_CHECKLIST_TITLE_LENGTH,
  normalizeActivityChecklist,
  restoreActivityChecklistItem,
  toggleActivityChecklistItem,
} from "@/features/activities/domain/activity-checklist";

describe("normalizeActivityChecklist", () => {
  it("returns an empty list for missing or invalid payloads", () => {
    expect(normalizeActivityChecklist(undefined)).toEqual([]);
    expect(normalizeActivityChecklist(null)).toEqual([]);
    expect(normalizeActivityChecklist("nope")).toEqual([]);
    expect(normalizeActivityChecklist([{ title: "   " }])).toEqual([]);
  });

  it("trims titles, preserves ids, and accepts completion/archive aliases", () => {
    expect(
      normalizeActivityChecklist([
        { id: "a", title: "  Pack bags  ", completed: true },
        { id: "b", title: "Buy tickets", is_completed: true, is_archived: true },
        { id: "c", title: "Confirm reservation", isCompleted: false },
        { title: "Missing id" },
      ]),
    ).toEqual([
      { id: "a", title: "Pack bags", completed: true, archived: false },
      { id: "b", title: "Buy tickets", completed: true, archived: true },
      { id: "c", title: "Confirm reservation", completed: false, archived: false },
      { id: "checklist-3", title: "Missing id", completed: false, archived: false },
    ]);
  });

  it("bounds list length and title length", () => {
    const longTitle = "x".repeat(MAX_ACTIVITY_CHECKLIST_TITLE_LENGTH + 20);
    const items = Array.from({ length: MAX_ACTIVITY_CHECKLIST_ITEMS + 5 }, (_, index) => ({
      id: `item-${index}`,
      title: index === 0 ? longTitle : `Task ${index}`,
    }));

    const normalized = normalizeActivityChecklist(items);
    expect(normalized).toHaveLength(MAX_ACTIVITY_CHECKLIST_ITEMS);
    expect(normalized[0].title).toHaveLength(MAX_ACTIVITY_CHECKLIST_TITLE_LENGTH);
  });
});

describe("createActivityChecklistItem", () => {
  it("rejects blank titles and creates incomplete active items", () => {
    expect(createActivityChecklistItem("   ")).toBeNull();
    expect(createActivityChecklistItem("Pack passport", "fixed-id")).toEqual({
      id: "fixed-id",
      title: "Pack passport",
      completed: false,
      archived: false,
    });
  });
});

describe("checklist progress actions", () => {
  const checklist = [
    { id: "a", title: "One", completed: false, archived: false },
    { id: "b", title: "Two", completed: true, archived: false },
    { id: "c", title: "Three", completed: false, archived: true },
  ];

  it("toggles only active items", () => {
    expect(toggleActivityChecklistItem(checklist, "a")).toEqual([
      { id: "a", title: "One", completed: true, archived: false },
      { id: "b", title: "Two", completed: true, archived: false },
      { id: "c", title: "Three", completed: false, archived: true },
    ]);
  });

  it("soft-archives and restores items", () => {
    expect(archiveActivityChecklistItem(checklist, "a")[0]).toMatchObject({
      id: "a",
      archived: true,
      completed: false,
    });
    expect(restoreActivityChecklistItem(checklist, "c")[2]).toMatchObject({
      id: "c",
      archived: false,
    });
  });

  it("counts only active items toward progress", () => {
    expect(activityChecklistProgress(checklist)).toEqual({ total: 2, completed: 1 });
  });
});
