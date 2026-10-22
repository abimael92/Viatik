import type { DocumentValidationResult } from "@/features/health/lib/document-validator";
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
