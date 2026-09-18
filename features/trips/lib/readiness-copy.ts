import type { TranslationKey } from "@/lib/i18n/translations";

type ReadinessCopy = {
  label: TranslationKey;
  action: TranslationKey;
  hint: TranslationKey;
};

const READINESS_COPY: Record<string, ReadinessCopy> = {
  dates: { label: "common.travelDates", action: "common.setDates", hint: "common.readinessDatesHint" },
  itinerary: { label: "common.itinerary", action: "common.planItinerary", hint: "common.readinessItineraryHint" },
  crew: { label: "common.crewConfirmed", action: "common.addTravelers", hint: "common.readinessCrewHint" },
  budget: { label: "common.budgetPlanned", action: "common.setBudget", hint: "common.readinessBudgetHint" },
  docs: { label: "common.docsInVault", action: "common.addDocuments", hint: "common.readinessDocsHint" },
  passport: { label: "common.passport", action: "common.addPassport", hint: "common.readinessPassportHint" },
};

export function readinessCopy(key: string): ReadinessCopy | null {
  return READINESS_COPY[key] ?? null;
}
