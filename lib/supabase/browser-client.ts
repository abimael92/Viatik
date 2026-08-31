import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/env.mjs";

let client: SupabaseClient | null = null;

/**
 * Lazily-created, memoized Supabase client for use in the browser (client
 * components, the sync engine, etc). Server components/actions must use
 * `lib/supabase/server-client.ts` instead, which is cookie-aware.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
