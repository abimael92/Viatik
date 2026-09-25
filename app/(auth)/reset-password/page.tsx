import { cookies } from "next/headers";

import { AuthShell } from "@/app/(auth)/auth-shell";
import { ResetPasswordForm } from "@/app/(auth)/reset-password/reset-password-form";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/password-recovery";
import { createClient } from "@/lib/supabase/server-client";

export default async function ResetPasswordPage() {
  const [supabase, cookieStore] = await Promise.all([createClient(), cookies()]);
  const { data } = await supabase.auth.getUser();
  const canReset = cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value === "1" && Boolean(data.user);

  return (
    <AuthShell>
      <ResetPasswordForm canReset={canReset} />
    </AuthShell>
  );
}
