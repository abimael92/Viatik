import { redirect } from "next/navigation";

import { AuthShell } from "@/app/(auth)/auth-shell";
import { ForgotPasswordForm } from "@/app/(auth)/forgot-password/forgot-password-form";
import { createClient } from "@/lib/supabase/server-client";

export default async function ForgotPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/home");

  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
