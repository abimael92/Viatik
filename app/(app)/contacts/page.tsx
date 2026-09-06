import { redirect } from "next/navigation";

import { ContactsPanel } from "@/features/contacts/components/contacts-panel";
import type { CurrentPublicProfile } from "@/features/contacts/lib/profile-directory";
import { createClient } from "@/lib/supabase/server-client";

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, avatar_seed, viatik_id, public_handle")
    .eq("id", data.user.id)
    .maybeSingle();

  const ownProfile: CurrentPublicProfile = {
    profileId: data.user.id,
    fullName: profile?.full_name ?? "Viatik user",
    viatikId: profile?.viatik_id ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    avatarSeed: profile?.avatar_seed ?? null,
    publicHandle: profile?.public_handle ?? null,
  };

  return <ContactsPanel userId={data.user.id} ownProfile={ownProfile} />;
}
