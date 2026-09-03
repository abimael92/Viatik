import { redirect } from "next/navigation";

import { TripWorkspace } from "@/features/trips/components/trip-workspace";
import { createClient } from "@/lib/supabase/server-client";

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const [{ tripId }, supabase] = await Promise.all([params, createClient()]);
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return <TripWorkspace tripId={tripId} userId={data.user.id} />;
}
