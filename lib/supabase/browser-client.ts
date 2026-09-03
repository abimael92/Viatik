import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/env.mjs";
import { logger } from "@/lib/observability/logger";

let client: SupabaseClient | null = null;

/**
 * Lazily-created, memoized Supabase client for use in the browser (client
 * components, the sync engine, etc). Server components/actions must use
 * `lib/supabase/server-client.ts` instead, which is cookie-aware.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    try {
      client = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { experimental: { passkey: true } },
      });
      logger.debug("Supabase browser client initialized");
    } catch (error) {
      logger.error("Failed to initialize Supabase browser client", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  return client;
}
