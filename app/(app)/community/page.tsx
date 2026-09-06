import { redirect } from "next/navigation";

import { CommunityFeed } from "@/features/community/components/community-feed";
import { createClient } from "@/lib/supabase/server-client";

export const metadata = { title: "Community Itineraries — Viatik" };

export default async function CommunityPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return <CommunityFeed userId={data.user.id} />;
}
