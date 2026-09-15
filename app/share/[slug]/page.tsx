import { notFound } from "next/navigation";

import { GuestTripView } from "@/features/sharing/components/guest-trip-view";
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
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-6xl" aria-hidden>📷</p>
        <h1 className="mt-4 text-xl font-bold">This share link is no longer active</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The trip owner may have turned it off or the trip is no longer available.
        </p>
      </main>
    );
  }

  return <GuestTripView snapshot={result.snapshot} />;
}
