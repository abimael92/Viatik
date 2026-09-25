import { errorCopy } from "@/lib/i18n/error-copy";
import { frontendCopy } from "@/lib/i18n/frontend-copy";
import type { TranslationKey } from "@/lib/i18n/translations";

type Translate = (key: TranslationKey, variables?: Record<string, string | number>) => string;

const exact = new Map<string, TranslationKey>();

for (const [key, value] of Object.entries(errorCopy.en)) {
  exact.set(value, `errors.${key}` as TranslationKey);
}
for (const [key, value] of Object.entries(frontendCopy.en)) {
  if (!exact.has(value)) exact.set(value, `copy.${key}` as TranslationKey);
}

const patterns: Array<{ test: RegExp; key: TranslationKey }> = [
  { test: /invalid login credentials|invalid credentials/i, key: "errors.incorrectPassword" },
  { test: /already registered/i, key: "errors.accountExists" },
  { test: /password should be at least/i, key: "errors.passwordMin" },
  { test: /too many requests|over_request_rate_limit|rate limit/i, key: "errors.tooManyRequests" },
  { test: /\b(rate|too many)\b/i, key: "errors.tooManyAttempts" },
  { test: /expired/i, key: "errors.codeExpired" },
  { test: /could not find the (function|table|relation)|schema cache|PGRST205|42P01/i, key: "errors.serviceUpdating" },
  { test: /row-level security|42501|permission denied/i, key: "errors.notAllowed" },
  { test: /jwt|not authenticated|invalid claim|session missing/i, key: "errors.signInAgain" },
  { test: /failed to fetch|networkerror|load failed|network request failed/i, key: "errors.network" },
  { test: /duplicate key|23505|unique constraint/i, key: "errors.alreadyExists" },
  { test: /unable to decrypt/i, key: "errors.vaultDecrypt" },
  { test: /unable to reach the weather service/i, key: "errors.weatherUnreachable" },
];

/** Turn a thrown or server-returned English failure into the active locale. */
export function localizeUserError(message: string | null | undefined, t: Translate, fallback: TranslationKey): string {
  const value = message?.trim();
  if (!value) return t(fallback);
  const known = exact.get(value);
  if (known) return t(known);
  const pattern = patterns.find((entry) => entry.test.test(value));
  if (pattern) return t(pattern.key);
  if (/schema cache|PGRST|postgres|violates|syntax error|stack|at \w+\s+\(|function public\./i.test(value)) {
    return t("errors.unexpected");
  }
  return value;
}

function fallbackKey(fallback: string): TranslationKey {
  return exact.get(fallback) ?? (fallback.includes(".") ? (fallback as TranslationKey) : "errors.unexpected");
}

export function localizeThrownError(cause: unknown, t: Translate, fallback: TranslationKey | string): string {
  const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : undefined;
  return localizeUserError(message, t, fallbackKey(fallback));
}
