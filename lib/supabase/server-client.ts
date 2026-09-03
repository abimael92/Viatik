import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/env.mjs";

/**
 * Creates a Supabase client bound to the current request's cookies.
 * This must be called freshly for every Server Action / Route Handler /
 * Server Component so that sessions are isolated per-request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      async getAll() {
        return cookieStore.getAll();
      },
      async setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // `set` may be called on a response that's already been sent, for
          // example during prerendering. This is safe to ignore because the
          // browser client will re-attach cookies on the next interaction.
        }
      },
    },
  });
}
