"use server";

import type { LocalProfile } from "@/features/profile/domain/profile-types";
import { createClient } from "@/lib/supabase/server-client";

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
      "full_name, avatar_url, avatar_seed, phone, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, passport_issuing_country, passport_expires_on, preferred_currency, updated_at"
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
    updatedAt: profile.updated_at ?? new Date().toISOString(),
  };
}
