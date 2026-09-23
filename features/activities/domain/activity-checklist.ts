import type { ActivityChecklistItem } from "@/features/domain/entities";

export const MAX_ACTIVITY_CHECKLIST_ITEMS = 50;
export const MAX_ACTIVITY_CHECKLIST_TITLE_LENGTH = 160;

export interface ActivityChecklistProgress {
  total: number;
  completed: number;
}

/** Normalize untrusted checklist payloads into a bounded, trimmed domain array. */
export function normalizeActivityChecklist(value: unknown): ActivityChecklistItem[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_ACTIVITY_CHECKLIST_ITEMS).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const title = typeof candidate.title === "string"
      ? candidate.title.trim().slice(0, MAX_ACTIVITY_CHECKLIST_TITLE_LENGTH)
      : "";
    if (!title) return [];

    const completed =
      candidate.completed === true ||
      candidate.is_completed === true ||
      candidate.isCompleted === true;
    const archived =
      candidate.archived === true ||
      candidate.is_archived === true ||
      candidate.isArchived === true;

    return [{
      id: typeof candidate.id === "string" && candidate.id ? candidate.id : `checklist-${index}`,
      title,
      completed,
      archived,
    }];
  });
}

export function createActivityChecklistItem(title: string, id = crypto.randomUUID()): ActivityChecklistItem | null {
  const normalized = title.trim().slice(0, MAX_ACTIVITY_CHECKLIST_TITLE_LENGTH);
  if (!normalized) return null;
  return { id, title: normalized, completed: false, archived: false };
}

export function toggleActivityChecklistItem(
  checklist: readonly ActivityChecklistItem[],
  itemId: string,
): ActivityChecklistItem[] {
  return checklist.map((item) =>
    item.id === itemId && !item.archived ? { ...item, completed: !item.completed } : item,
  );
}

export function archiveActivityChecklistItem(
  checklist: readonly ActivityChecklistItem[],
  itemId: string,
): ActivityChecklistItem[] {
  return checklist.map((item) =>
    item.id === itemId ? { ...item, archived: true, completed: false } : item,
  );
}

export function restoreActivityChecklistItem(
  checklist: readonly ActivityChecklistItem[],
  itemId: string,
): ActivityChecklistItem[] {
  return checklist.map((item) =>
    item.id === itemId ? { ...item, archived: false } : item,
  );
}

export function activeActivityChecklistItems(
  checklist: readonly ActivityChecklistItem[] | null | undefined,
): ActivityChecklistItem[] {
  return (checklist ?? []).filter((item) => !item.archived);
}

export function activityChecklistProgress(
  checklist: readonly ActivityChecklistItem[] | null | undefined,
): ActivityChecklistProgress {
  const items = activeActivityChecklistItems(checklist);
  return {
    total: items.length,
    completed: items.filter((item) => item.completed).length,
  };
}
