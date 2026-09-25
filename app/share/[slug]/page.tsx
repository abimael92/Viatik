import { notFound } from "next/navigation";

import { GuestTripView } from "@/features/sharing/components/guest-trip-view";
import { ShareInactiveMessage } from "@/features/sharing/components/share-inactive-message";
import { loadSharedTripSnapshot } from "@/features/sharing/lib/shared-trip";
import { getServiceClient } from "@/lib/supabase/service-client";

/**
 * Public, read-only guest view for a trip share link. No authentication
 * required — a trip owner shares this URL with family back home so they can
 * follow the live itinerary, map, and gallery. Data is read server-side via
 * the service client and gated by the link's permission flags.
 */
export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await loadSharedTripSnapshot(slug, getServiceClient());

  if (result.status === "not_found") notFound();
  if (result.status === "inactive") {
    return <ShareInactiveMessage />;
  }

  return <GuestTripView snapshot={result.snapshot} />;
}
