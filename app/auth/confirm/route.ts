import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { PASSWORD_RECOVERY_COOKIE, passwordRecoveryCookieOptions } from "@/lib/auth/password-recovery";
import { createClient } from "@/lib/supabase/server-client";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/home";
}

function redirectToPasswordReset(origin: string) {
  const response = NextResponse.redirect(`${origin}/reset-password`);
  response.cookies.set(PASSWORD_RECOVERY_COOKIE, "1", passwordRecoveryCookieOptions());
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));
  const isRecovery = type === "recovery" || next === "/reset-password";
  const supabase = await createClient();

  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing email verification credentials."), data: null };

  if (result.error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("That email link is invalid or expired. Request a new one.")}`);
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("The verified session could not be created.")}`);
  }

  if (isRecovery) return redirectToPasswordReset(origin);

  const onboardingRequired = data.user.user_metadata?.onboarding_required === true;
  if (onboardingRequired) {
    return NextResponse.redirect(`${origin}/onboarding?setup=1&next=${encodeURIComponent(next)}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", data.user.id)
    .maybeSingle();

  return NextResponse.redirect(
    profile?.full_name?.trim()
      ? `${origin}${next}`
      : `${origin}/onboarding?next=${encodeURIComponent(next)}`
  );
}
