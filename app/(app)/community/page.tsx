import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server-client";

export const metadata = { title: "Community — Viatik" };

// Community is not yet available; the nav exposes it as "Coming soon" and the
// route redirects so it stays unreachable until launch.
export default async function CommunityPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  redirect("/home");
}
