import { DAYS_PER_MONTH, type DocumentValidationResult } from "@/features/health/lib/document-validator";
import type { TranslationKey } from "@/lib/i18n/translations";

type Translate = (key: TranslationKey, variables?: Record<string, string | number>) => string;

export function documentValidationMessage(result: DocumentValidationResult, t: Translate): string {
  if (!result.messageKey) return result.message;
  const variables = result.messageVars
    ? Object.fromEntries(
        Object.entries(result.messageVars).map(([name, value]) => [
          name,
          typeof value === "string" && value.startsWith("copy.") ? t(value as TranslationKey) : value,
        ]),
      )
    : undefined;
  return t(result.messageKey as TranslationKey, variables);
}

export function countdownLabel(daysRemaining: number, t: Translate): string {
  if (daysRemaining <= 0) return t("copy.countdownExpired");
  if (daysRemaining === 1) return t("copy.countdownOneDay");
  if (daysRemaining < 30) return t("copy.countdownDays", { count: daysRemaining });
  const months = Math.floor(daysRemaining / DAYS_PER_MONTH);
  return months === 1 ? t("copy.countdownOneMonth") : t("copy.countdownMonths", { count: months });
}
