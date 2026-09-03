import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/app/(auth)/onboarding/onboarding-form";
import { createClient } from "@/lib/supabase/server-client";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, supabase] = await Promise.all([searchParams, createClient()]);
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(next ?? "/trips")}`);

  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/trips";

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", authData.user.id).maybeSingle();
  if (profile?.full_name?.trim()) redirect(destination);

  const email = authData.user.email ?? "";

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8" aria-labelledby="onboarding-title">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 text-lg font-bold"><Image src="/viatik-logo.png" alt="" width={40} height={40} priority className="size-10 object-contain" />Viatik</Link>
        <OnboardingForm email={email} next={destination} />
      </section>
    </main>
  );
}
