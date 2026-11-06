import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const httpUrl = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "must use HTTP or HTTPS");

const skipValidationSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["true", "false"]).optional(),
);

function shouldSkipValidation() {
  if (process.env.NODE_ENV === "test") return true;

  const parsed = skipValidationSchema.safeParse(process.env.SKIP_ENV_VALIDATION);
  if (!parsed.success) {
    throw new Error("Invalid environment variable: SKIP_ENV_VALIDATION");
  }
  return parsed.data === "true";
}

/**
 * Centralized, type-safe environment variable validation.
 *
 * Import `env` instead of reading from `process.env` directly so that
 * missing or malformed configuration fails fast at build/startup time
 * rather than surfacing as a runtime error deep in the app.
 */
export const env = createEnv({
  server: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1).optional(),
    // Reserved. Nothing reads this until SMS verification is re-enabled.
    // See .ai/specs/sms-verification.md.
    SMS_PROVIDER_API_KEY: z.string().optional(),
    GOOGLE_MAPS_API_KEY: z.string().trim().min(1).optional(),
    // Optional AI Activity Scout LLM endpoint + key. When unset, the scout uses
    // GEMINI_API_KEY if configured, or falls back to the deterministic offline
    // heuristic engine.
    AI_SCOUT_ENDPOINT: httpUrl.optional(),
    AI_SCOUT_API_KEY: z.string().trim().min(1).optional(),
    OPENAI_API_KEY: z.string().trim().min(1).optional(),
    GEMINI_API_KEY: z.string().trim().min(1).optional(),
    // Signs the short-lived QR connection tokens. Must be >= 32 bytes.
    QR_SIGNING_SECRET: z
      .string()
      .refine((value) => new TextEncoder().encode(value).length >= 32, "must contain at least 32 bytes")
      .optional(),
    // WhatsApp trip-start notifications (Twilio). When unset, nothing is sent.
    TWILIO_ACCOUNT_SID: z.string().trim().min(1).optional(),
    TWILIO_AUTH_TOKEN: z.string().trim().min(1).optional(),
    TWILIO_WHATSAPP_FROM: z.string().trim().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: httpUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1),
  },
  runtimeEnv: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SMS_PROVIDER_API_KEY: process.env.SMS_PROVIDER_API_KEY,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    AI_SCOUT_ENDPOINT: process.env.AI_SCOUT_ENDPOINT,
    AI_SCOUT_API_KEY: process.env.AI_SCOUT_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    QR_SIGNING_SECRET: process.env.QR_SIGNING_SECRET,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  emptyStringAsUndefined: true,
  onValidationError(issues) {
    const names = [...new Set(issues.map((issue) => String(issue.path[0] ?? "environment")))];
    throw new Error(`Invalid environment variables: ${names.join(", ")}`);
  },
  // Allow the app to run in CI/build environments without real Supabase
  // credentials (e.g. `pnpm typecheck`/`pnpm lint`); the schema still
  // enforces correctness whenever the variables ARE provided.
  skipValidation: shouldSkipValidation(),
});
