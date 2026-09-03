import { redirect } from "next/navigation";

import { TripDashboard } from "@/features/trips/components/trip-dashboard";
import { createClient } from "@/lib/supabase/server-client";

export default async function TripsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return <TripDashboard userId={data.user.id} />;
}
