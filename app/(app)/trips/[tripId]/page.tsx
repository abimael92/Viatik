import { redirect } from "next/navigation";

import { TripWorkspace } from "@/features/trips/components/trip-workspace";
import { loginPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server-client";

const VALID_TABS = [
  "overview",
  "feed",
  "journal",
  "itinerary",
  "tasks",
  "map",
  "money",
  "expenses",
  "finance",
  "packing",
  "health",
  "photos",
  "gallery",
  "people",
  "travelers",
  "vault",
  "polls",
  "settings",
] as const;

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ tab?: string; action?: string; activityId?: string }>;
}) {
  const [{ tripId }, { tab, action, activityId }, supabase] = await Promise.all([params, searchParams, createClient()]);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const query = new URLSearchParams();
    if (tab) query.set("tab", tab);
    if (action) query.set("action", action);
    if (activityId) query.set("activityId", activityId);
    const search = query.toString();
    redirect(loginPath(`/trips/${encodeURIComponent(tripId)}${search ? `?${search}` : ""}`));
  }
  const initialTab = VALID_TABS.includes(tab as (typeof VALID_TABS)[number]) ? (tab as (typeof VALID_TABS)[number]) : "overview";
  return (
    <TripWorkspace
      tripId={tripId}
      userId={data.user.id}
      initialTab={initialTab}
      initialAction={action}
      initialActivityId={activityId}
      initialMoneyToolsOpen={action === "money-tools"}
    />
  );
}
