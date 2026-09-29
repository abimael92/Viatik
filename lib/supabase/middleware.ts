import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/env.mjs";
import { logger } from "@/lib/observability/logger";

export type SessionUpdate = {
  response: NextResponse;
  /** `null` when the session check itself failed, so the caller cannot tell. */
  authenticated: boolean | null;
};

/**
 * Next.js middleware that refreshes the user's Supabase session on every
 * request and makes it available to downstream server components/actions.
 */
export async function updateSession(request: NextRequest): Promise<SessionUpdate> {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  try {
    const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    // This will refresh the session if expired and update cookies in `response`.
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      logger.warn("Failed to refresh session in middleware", {
        error: error.message,
        path: request.nextUrl.pathname,
      });
    }

    return { response, authenticated: Boolean(data.user) };
  } catch (error) {
    logger.error("Unexpected error in auth middleware", error instanceof Error ? error : new Error(String(error)), {
      path: request.nextUrl.pathname,
    });
    // Continue with the response even if auth refresh fails
    return { response, authenticated: null };
  }
}
