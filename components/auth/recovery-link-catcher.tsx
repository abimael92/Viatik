"use client";

import { useLayoutEffect } from "react";

import { grantPasswordRecovery } from "@/app/actions/auth";
import { recoverySessionFromHash } from "@/lib/auth/password-recovery";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

const expiredLink = "That email link is invalid or expired. Request a new one.";

/**
 * Recovery emails often land on the site root (`http://localhost:3000`) with the
 * session in the hash. Move that browser to the reset-password screen.
 */
export function RecoveryLinkCatcher() {
  useLayoutEffect(() => {
    const session = recoverySessionFromHash(window.location.hash);
    if (!session) return;

    const supabase = getSupabaseBrowserClient();
    void supabase.auth
      .setSession({ access_token: session.accessToken, refresh_token: session.refreshToken })
      .then(async ({ error }) => {
        if (error) {
          window.location.replace(`/login?error=${encodeURIComponent(expiredLink)}`);
          return;
        }
        const result = await grantPasswordRecovery();
        window.location.replace(result.success ? "/reset-password" : `/login?error=${encodeURIComponent(result.error)}`);
      });
  }, []);

  return null;
}
