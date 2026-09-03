import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/env.mjs";

let client: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!client) {
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
