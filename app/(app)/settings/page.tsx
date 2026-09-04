import { redirect } from "next/navigation";

import { SettingsClient } from "@/app/(app)/settings/settings-client";
import type { ProfileDetails } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, avatar_url, phone, birth_date, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, dietary_restrictions, allergies, passport_issuing_country, passport_expires_on, preferred_currency, preferred_language, viatik_id, discoverable"
    )
    .eq("id", data.user.id)
    .maybeSingle();
  const profileDetails: ProfileDetails | null = profile
    ? {
        fullName: profile.full_name ?? "",
        avatarUrl: profile.avatar_url ?? undefined,
        phone: profile.phone ?? undefined,
        birthDate: profile.birth_date ?? undefined,
        emergencyContactName: profile.emergency_contact_name ?? undefined,
        emergencyContactRelationship: profile.emergency_contact_relationship ?? undefined,
        emergencyContactPhone: profile.emergency_contact_phone ?? undefined,
        dietaryRestrictions: Array.isArray(profile.dietary_restrictions)
          ? profile.dietary_restrictions.map(String)
          : [],
        allergies: Array.isArray(profile.allergies) ? profile.allergies.map(String) : [],
        passportIssuingCountry: profile.passport_issuing_country ?? undefined,
        passportExpiresOn: profile.passport_expires_on ?? undefined,
        preferredCurrency: profile.preferred_currency ?? undefined,
        preferredLanguage: profile.preferred_language ?? undefined,
      }
    : null;
  return (
    <SettingsClient
      userId={data.user.id}
      phone={data.user.phone ?? null}
      fullName={profileDetails?.fullName ?? ""}
      viatikId={profile?.viatik_id ?? null}
      discoverable={profile?.discoverable ?? false}
      profile={profileDetails}
    />
  );
}
