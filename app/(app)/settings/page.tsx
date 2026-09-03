import { redirect } from "next/navigation";

import { SettingsClient } from "@/app/(app)/settings/settings-client";
import { createClient } from "@/lib/supabase/server-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
  return <SettingsClient userId={data.user.id} phone={data.user.phone ?? null} fullName={profile?.full_name ?? ""} />;
}
