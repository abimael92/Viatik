"use server";

import { z } from "zod";

import { logger } from "@/lib/observability/logger";
import { toE164, twilioWhatsAppProvider } from "@/lib/notifications/whatsapp";
import { createClient } from "@/lib/supabase/server-client";

export type NotifyTripStartedResult =
  | { success: true; sent: number; failed: number; skipped: number; configured: boolean }
  | { success: false; error: string };

const tripIdSchema = z.string().uuid();

/**
 * Sends a WhatsApp "trip started" message to each traveler's contact phone.
 * Authorization is enforced by RLS: only trips and travelers the signed-in user
 * can read are returned, and only the trip owner may trigger the broadcast.
 */
export async function notifyTripStarted(tripId: string): Promise<NotifyTripStartedResult> {
  const parsed = tripIdSchema.safeParse(tripId);
  if (!parsed.success) return { success: false, error: "Invalid trip." };

  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { success: false, error: "Sign in again to notify travelers." };

    const { data: trip } = await supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, owner_id, status")
      .eq("id", parsed.data)
      .is("deleted_at", null)
      .maybeSingle();
    if (!trip || trip.owner_id !== auth.user.id) return { success: false, error: "Trip not found." };

    const { data: travelers } = await supabase
      .from("trip_travelers")
      .select("contacts(phone)")
      .eq("trip_id", trip.id)
      .is("deleted_at", null);

    const phones = new Set<string>();
    let skipped = 0;
    for (const row of (travelers ?? []) as unknown as { contacts: { phone: string | null } | null }[]) {
      const phone = toE164(row.contacts?.phone);
      if (phone) phones.add(phone);
      else skipped += 1;
    }

    if (!twilioWhatsAppProvider.isConfigured()) {
      logger.warn("WhatsApp provider not configured; trip-start notification skipped");
      return { success: true, sent: 0, failed: 0, skipped: phones.size + skipped, configured: false };
    }

    const place = trip.destination ? ` to ${trip.destination}` : "";
    const body = `${trip.name} has started! Your trip${place} is now active in Viatik.`;
    const results = await Promise.all(
      [...phones].map((phone) => twilioWhatsAppProvider.send(phone, body).catch(() => "failed" as const)),
    );
    return {
      success: true,
      sent: results.filter((result) => result === "sent").length,
      failed: results.filter((result) => result === "failed").length,
      skipped,
      configured: true,
    };
  } catch (error) {
    logger.error("Unable to send trip-start notifications", error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: "We couldn't notify travelers right now." };
  }
}
