import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Centralized, type-safe environment variable validation.
 *
 * Import `env` instead of reading from `process.env` directly so that
 * missing or malformed configuration fails fast at build/startup time
 * rather than surfacing as a runtime error deep in the app.
 */
export const env = createEnv({
  server: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    SMS_PROVIDER_API_KEY: z.string().optional(),
    GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
  runtimeEnv: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SMS_PROVIDER_API_KEY: process.env.SMS_PROVIDER_API_KEY,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  // Allow the app to run in CI/build environments without real Supabase
  // credentials (e.g. `pnpm typecheck`/`pnpm lint`); the schema still
  // enforces correctness whenever the variables ARE provided.
  skipValidation:
    process.env.SKIP_ENV_VALIDATION === "true" || process.env.NODE_ENV === "test",
});
