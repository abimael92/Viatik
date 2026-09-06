import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell/app-shell";
import { DatabaseProvider } from "@/lib/db/database-provider";
import { SyncProvider } from "@/lib/sync/sync-provider";
import { createClient } from "@/lib/supabase/server-client";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, avatar_seed")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile?.full_name?.trim()) redirect("/onboarding");

  return (
    <DatabaseProvider userId={data.user.id}>
      <SyncProvider>
        <AppShell
          userId={data.user.id}
          userName={profile.full_name || data.user.email || "Traveler"}
          userEmail={data.user.email ?? undefined}
          avatarSeed={profile.avatar_seed ?? undefined}
          avatarUrl={profile.avatar_url ?? undefined}
        >
          {children}
        </AppShell>
      </SyncProvider>
    </DatabaseProvider>
  );
}
