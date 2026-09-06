/**
 * Travel document compliance engine.
 *
 * Pure, rule-based validation that audits identity documents against
 * destination entry mandates and surfaces proactive boarding alerts. No I/O —
 * all inputs are passed in, so the rules are easy to unit test.
 */

import type { TravelDocument, TravelDocumentType } from "@/features/health/domain/health-types";

/** How much validity a passport must have beyond travel to satisfy a country. */
export type PassportValidityRule = "sixMonth" | "threeMonth" | "durationOfStay";

/** Aggregate health of a document for the trip in question. */
export type DocumentValidationStatus = "valid" | "warning" | "invalid";

export interface DocumentValidationOptions {
  /** Trip destination — free text such as "Paris, France"; scanned for a rule. */
  destination?: string | null;
  /** Departure/travel date (ISO `yyyy-mm-dd`). Defaults to today. */
  travelDate?: string | null;
  /** Reference "now" date (ISO `yyyy-mm-dd`). Defaults to today. */
  now?: string;
  /** Intended length of stay in days (only used by the durationOfStay rule). */
  stayDays?: number;
}

export interface DocumentValidationResult {
  status: DocumentValidationStatus;
  /** Whole days from `now` until expiry (negative when already expired). */
  daysRemaining: number;
  /** Whole days from `now` until travel. */
  daysUntilTravel: number;
  /** For passports: the rule matched for the destination, if any. */
  rule?: PassportValidityRule;
  /** Minimum validity the rule demands (for passports). */
  requiredValidityDays?: number;
  /** Human-readable explanation surfaced in the UI. */
  message: string;
}

export const DAYS_PER_MONTH = 30;

/** Warning threshold: flag any document expiring within ~6 months of today. */
export const DEFAULT_WARNING_DAYS = 6 * DAYS_PER_MONTH;

/** Rule day thresholds. */
export const RULE_VALIDITY_DAYS: Record<PassportValidityRule, (stayDays?: number) => number> = {
  sixMonth: () => 6 * DAYS_PER_MONTH,
  threeMonth: () => 3 * DAYS_PER_MONTH,
  durationOfStay: (stayDays) => Math.max(1, stayDays ?? 0),
};

/** Renewal-nudge horizon that tracks the destination rule (6 vs 3 months). */
export function warningDaysForRule(rule: PassportValidityRule): number {
  switch (rule) {
    case "sixMonth":
      return 6 * DAYS_PER_MONTH;
    case "threeMonth":
    case "durationOfStay":
      return 3 * DAYS_PER_MONTH;
  }
}

function formatWarningMonths(rule: PassportValidityRule): string {
  return rule === "sixMonth" ? "6 months" : "3 months";
}

/** Countries that apply the Schengen 3-month passport rule. */
const SCHENGEN_COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Czech Republic", "Czechia",
  "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary",
  "Iceland", "Italy", "Latvia", "Liechtenstein", "Lithuania", "Luxembourg",
  "Malta", "Netherlands", "Norway", "Poland", "Portugal", "Romania",
  "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland",
];

/** Countries that apply the stricter 6-month passport rule. */
const SIX_MONTH_COUNTRIES = ["United States", "USA", "US", "Canada", "Thailand", "Japan", "China"];

/**
 * Resolve a destination (free-text, e.g. "Kyoto, Japan" or "Paris, France")
 * to a passport validity rule by scanning for known country names. Defaults to
 * the standard 6-month rule when nothing matches.
 */
export function passportValidityRuleFor(destination: string | null | undefined): PassportValidityRule {
  const haystack = (destination ?? "").toLowerCase();
  if (!haystack) return "sixMonth";

  for (const country of SIX_MONTH_COUNTRIES) {
    if (haystack.includes(country.toLowerCase())) return "sixMonth";
  }
  for (const country of SCHENGEN_COUNTRIES) {
    if (haystack.includes(country.toLowerCase())) return "threeMonth";
  }
  return "sixMonth";
}

/** Whole-day difference `later - earlier`, truncated, for ISO dates. */
export function daysBetween(earlier: string, later: string): number {
  const a = new Date(`${earlier}T12:00:00`).getTime();
  const b = new Date(`${later}T12:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function ruleLabel(rule: PassportValidityRule): string {
  switch (rule) {
    case "sixMonth":
      return "valid for 6 months beyond travel";
    case "threeMonth":
      return "valid for 3 months beyond travel (Schengen)";
    case "durationOfStay":
      return "valid for the full length of stay";
  }
}

function validatePassport(
  document: TravelDocument,
  options: DocumentValidationOptions,
): DocumentValidationResult {
  const today = options.now ?? new Date().toISOString().slice(0, 10);
  const travel = options.travelDate ?? today;

  const rule = passportValidityRuleFor(options.destination);
  const requiredValidityDays = RULE_VALIDITY_DAYS[rule](options.stayDays);

  const daysRemaining = daysBetween(today, document.expiryDate);
  const daysUntilTravel = daysBetween(today, travel);
  const validityAtTravel = daysBetween(travel, document.expiryDate);

  // Boarding rejection: expired before departure, or not valid for the mandate.
  if (validityAtTravel <= 0) {
    return {
      status: "invalid",
      daysRemaining,
      daysUntilTravel,
      rule,
      requiredValidityDays,
      message:
        daysRemaining <= 0
          ? "This passport has expired."
          : "This passport will be expired before you travel.",
    };
  }
  if (validityAtTravel < requiredValidityDays) {
    return {
      status: "invalid",
      daysRemaining,
      daysUntilTravel,
      rule,
      requiredValidityDays,
      message: `May be denied boarding — a passport must be ${ruleLabel(rule)}.`,
    };
  }
  // Proactive renewal nudge: expiring within the rule's warning horizon
  // (6 months for the standard rule, 3 months for Schengen).
  if (daysRemaining < warningDaysForRule(rule)) {
    return {
      status: "warning",
      daysRemaining,
      daysUntilTravel,
      rule,
      requiredValidityDays,
      message: `This passport expires within ${formatWarningMonths(rule)}. Consider renewing soon.`,
    };
  }
  return {
    status: "valid",
    daysRemaining,
    daysUntilTravel,
    rule,
    requiredValidityDays,
    message: "This passport meets destination validity requirements.",
  };
}

/**
 * Validate any expiring document (visa, insurance, vaccination) against the
 * travel date. These are valid as long as they cover the trip; a 6-month
 * warning nudges renewal before they get close.
 */
function validateExpiringDocument(
  document: TravelDocument,
  options: DocumentValidationOptions,
): DocumentValidationResult {
  const today = options.now ?? new Date().toISOString().slice(0, 10);
  const travel = options.travelDate ?? today;

  const daysRemaining = daysBetween(today, document.expiryDate);
  const daysUntilTravel = daysBetween(today, travel);
  const coversTrip = daysBetween(travel, document.expiryDate) >= 0;

  if (!coversTrip) {
    return {
      status: "invalid",
      daysRemaining,
      daysUntilTravel,
      message: daysRemaining <= 0 ? "This document has expired." : "This document will expire before you travel.",
    };
  }
  if (daysRemaining < DEFAULT_WARNING_DAYS) {
    return {
      status: "warning",
      daysRemaining,
      daysUntilTravel,
      message: "This document expires within 6 months. Consider renewing soon.",
    };
  }
  return {
    status: "valid",
    daysRemaining,
    daysUntilTravel,
    message: "This document will be valid for the trip.",
  };
}

/** Dispatch a document to the appropriate validator. */
export function validateDocument(
  document: TravelDocument,
  options: DocumentValidationOptions = {},
): DocumentValidationResult {
  if (document.type === "passport") return validatePassport(document, options);
  return validateExpiringDocument(document, options);
}

/** Whether a document's current state would be a red flag for border checks. */
export function isBlockingRisk(document: TravelDocument, options: DocumentValidationOptions = {}): boolean {
  return validateDocument(document, options).status === "invalid";
}

/** Short "expires in …" copy used by countdown labels. */
export function formatCountdown(daysRemaining: number): string {
  if (daysRemaining <= 0) return "Expired";
  if (daysRemaining === 1) return "Expires in 1 day";
  if (daysRemaining < 30) return `Expires in ${daysRemaining} days`;
  const months = Math.floor(daysRemaining / DAYS_PER_MONTH);
  return `Expires in ${months} month${months === 1 ? "" : "s"}`;
}

/** Validate all documents for a user and bucket them by severity. */
export function summarizeDocuments(
  documents: TravelDocument[],
  options: DocumentValidationOptions = {},
): { valid: TravelDocument[]; warning: TravelDocument[]; invalid: TravelDocument[] } {
  const buckets = { valid: [] as TravelDocument[], warning: [] as TravelDocument[], invalid: [] as TravelDocument[] };
  for (const document of documents) {
    buckets[validateDocument(document, options).status].push(document);
  }
  return buckets;
}

export type { TravelDocumentType };
