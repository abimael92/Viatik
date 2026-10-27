export type ScoutWizardStepId = "where" | "vibe" | "crew" | "budget" | "takeoff" | "timing";

/**
 * Ordered wizard steps. Route mode (a pinned destination) skips the vibe
 * question entirely; "where" is always first so toggling the destination never
 * shifts the step under the traveler's feet.
 */
export function getScoutWizardSteps(hasDestination: boolean): ScoutWizardStepId[] {
  return hasDestination
    ? ["where", "crew", "budget", "takeoff", "timing"]
    : ["where", "vibe", "crew", "budget", "takeoff", "timing"];
}
