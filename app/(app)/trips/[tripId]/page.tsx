import { redirect } from "next/navigation";

import { TripWorkspace } from "@/features/trips/components/trip-workspace";
import { createClient } from "@/lib/supabase/server-client";

const VALID_TABS = [
  "overview",
  "feed",
  "journal",
  "itinerary",
  "map",
  "expenses",
  "finance",
  "gallery",
  "travelers",
  "vault",
  "settings",
] as const;

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ tripId }, { tab }, supabase] = await Promise.all([params, searchParams, createClient()]);
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const initialTab = VALID_TABS.includes(tab as (typeof VALID_TABS)[number]) ? (tab as (typeof VALID_TABS)[number]) : "overview";
  return <TripWorkspace tripId={tripId} userId={data.user.id} initialTab={initialTab} />;
}
