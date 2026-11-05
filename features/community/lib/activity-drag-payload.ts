export function parseActivityDragPayload(raw: string): string | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;

    const activityId = (data as { activityId?: unknown }).activityId;
    if (typeof activityId !== "string") return null;
    const normalizedId = activityId.trim();
    return normalizedId || null;
  } catch {
    return null;
  }
}
