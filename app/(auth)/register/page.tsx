import { redirect } from "next/navigation";

import { AuthShell } from "@/app/(auth)/auth-shell";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { createClient } from "@/lib/supabase/server-client";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, supabase] = await Promise.all([searchParams, createClient()]);
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
    const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/trips";
    redirect(profile?.full_name?.trim() ? destination : `/onboarding?next=${encodeURIComponent(destination)}`);
  }

  return (
    <AuthShell mode="register">
      <LoginForm mode="register" next={next} />
    </AuthShell>
  );
}
