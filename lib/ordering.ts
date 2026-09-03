/** Gap left between freshly-created fractional positions. */
const POSITION_STEP = 1024;

/**
 * Fractional-indexing helpers for drag-and-drop lists (dnd-kit itinerary
 * board, etc). Storing a float `position` per row lets us move an item
 * between two neighbors by writing a single row instead of re-numbering an
 * entire list on every drag.
 */

/** Position for a brand-new item appended to the end of a list. */
export function nextPosition(existingPositions: number[]): number {
  if (existingPositions.length === 0) return POSITION_STEP;
  return Math.max(...existingPositions) + POSITION_STEP;
}

/**
 * Position for an item dropped between `before` and `after` (either may be
 * absent if dropping at the start/end of the list).
 */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return POSITION_STEP;
  if (before === undefined) return after! - POSITION_STEP;
  if (after === undefined) return before + POSITION_STEP;
  return (before + after) / 2;
}
