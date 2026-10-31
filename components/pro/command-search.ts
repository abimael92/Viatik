/**
 * Pure search/grouping logic for the command palette. No React, no Dexie —
 * the component feeds it already-shaped items and it decides what matches and
 * how results are grouped for keyboard navigation.
 */

export type PaletteGroupId = "actions" | "navigation" | "trips" | "activities" | "contacts";

export const PALETTE_GROUP_ORDER: readonly PaletteGroupId[] = [
  "actions",
  "navigation",
  "trips",
  "activities",
  "contacts",
];

export const PALETTE_PER_GROUP_CAP = 5;

/** Minimum query length before a data group is searched. */
export const PALETTE_MIN_QUERY: Record<"trips" | "activities" | "contacts", number> = {
  trips: 1,
  activities: 2,
  contacts: 1,
};

export interface PaletteItem {
  /** Unique option id — used for `aria-activedescendant`. */
  id: string;
  group: PaletteGroupId;
  label: string;
  subtitle?: string;
  /** Shortcut hint rendered as a kbd (e.g. "G T"). */
  hint?: string;
  /** Extra match-only keywords (commands). */
  keywords?: string;
  /** Accent/case-folded haystack; matching never looks anywhere else. */
  searchText: string;
}

export interface PaletteGroup<T extends PaletteItem = PaletteItem> {
  id: PaletteGroupId;
  items: T[];
}

/** Lowercase, strip accents (NFD + combining marks) and trim. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Build the normalized haystack for an item from its searchable fields. */
export function paletteSearchText(...fields: Array<string | null | undefined>): string {
  return normalizeText(fields.filter((field): field is string => Boolean(field)).join(" "));
}

function matches(item: PaletteItem, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const haystack = `${item.searchText} ${normalizeText(item.keywords ?? "")}`;
  return haystack.includes(normalizedQuery);
}

/**
 * Group palette results. `actions` (contextual trip actions) and `navigation`
 * (commands) are always evaluated; the data groups only participate when the
 * query meets their minimum length. Each group keeps at most
 * `PALETTE_PER_GROUP_CAP` items, in the order callers supplied.
 */
export function buildPaletteGroups<T extends PaletteItem = PaletteItem>(
  query: string,
  input: {
    actions?: T[];
    navigation?: T[];
    trips?: T[];
    activities?: T[];
    contacts?: T[];
  }
): PaletteGroup<T>[] {
  const normalizedQuery = normalizeText(query);
  const groups: PaletteGroup<T>[] = [];

  const commandItems = (items: T[] | undefined) =>
    (items ?? []).filter((item) => matches(item, normalizedQuery));
  const dataItems = (items: T[] | undefined) => commandItems(items).slice(0, PALETTE_PER_GROUP_CAP);

  groups.push({ id: "actions", items: commandItems(input.actions) });
  groups.push({ id: "navigation", items: commandItems(input.navigation) });

  if (normalizedQuery.length > 0) {
    if (normalizedQuery.length >= PALETTE_MIN_QUERY.trips) {
      groups.push({ id: "trips", items: dataItems(input.trips) });
    }
    if (normalizedQuery.length >= PALETTE_MIN_QUERY.activities) {
      groups.push({ id: "activities", items: dataItems(input.activities) });
    }
    if (normalizedQuery.length >= PALETTE_MIN_QUERY.contacts) {
      groups.push({ id: "contacts", items: dataItems(input.contacts) });
    }
  }

  return groups.filter((group) => group.items.length > 0);
}

/** Flat ordered list across groups — this is what arrow keys traverse. */
export function flattenPaletteGroups<T extends PaletteItem>(groups: PaletteGroup<T>[]): T[] {
  return groups.flatMap((group) => group.items);
}
