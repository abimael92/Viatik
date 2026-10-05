"use server";

import type { ActionResult } from "@/app/actions/auth";
import type { LocalProfile } from "@/features/profile/domain/profile-types";
import { frontendCopy } from "@/lib/i18n/frontend-copy";
import { createClient } from "@/lib/supabase/server-client";

const whatsAppSaveFailed = frontendCopy.en.whatsAppNotificationsSaveFailed;

/**
 * Turns WhatsApp trip notifications on or off for the signed-in user only.
 * The dispatcher skips recipients with the flag off (`not_opted_in`).
 */
export async function setWhatsAppNotifications(enabled: boolean): Promise<ActionResult<{ enabled: boolean }>> {
  if (typeof enabled !== "boolean") return { success: false, error: whatsAppSaveFailed };
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { success: false, error: "Authentication required" };

    const { data: saved, error } = await supabase
      .from("profiles")
      .update({ whatsapp_notifications_enabled: enabled })
      .eq("id", data.user.id)
      .select("whatsapp_notifications_enabled")
      .maybeSingle();
    if (error || !saved) return { success: false, error: whatsAppSaveFailed };
    return { success: true, data: { enabled: saved.whatsapp_notifications_enabled } };
  } catch {
    return { success: false, error: whatsAppSaveFailed };
  }
}

/**
 * Returns the signed-in user's own profile (safety-relevant fields included),
 * or `null` when there is no session or no profile row. Used to seed the
 * local-only `profiles` cache so the Emergency Center works offline.
 */
export async function getMyProfile(): Promise<LocalProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, avatar_url, avatar_seed, phone, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, passport_issuing_country, passport_expires_on, preferred_currency, mute_trip_notifications, updated_at"
    )
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    id: data.user.id,
    fullName: profile.full_name ?? null,
    avatarUrl: profile.avatar_url ?? null,
    avatarSeed: profile.avatar_seed ?? null,
    phone: profile.phone ?? null,
    emergencyContactName: profile.emergency_contact_name ?? null,
    emergencyContactRelationship: profile.emergency_contact_relationship ?? null,
    emergencyContactPhone: profile.emergency_contact_phone ?? null,
    passportIssuingCountry: profile.passport_issuing_country ?? null,
    passportExpiresOn: profile.passport_expires_on ?? null,
    preferredCurrency: profile.preferred_currency ?? null,
    muteTripNotifications: Boolean(profile.mute_trip_notifications),
    updatedAt: profile.updated_at ?? new Date().toISOString(),
  };
}
