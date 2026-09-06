import { redirect } from "next/navigation";

import { HomePage } from "@/features/trips/components/home/home-page";
import { createClient } from "@/lib/supabase/server-client";

export default async function HomeRoute() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return <HomePage userId={data.user.id} />;
}
