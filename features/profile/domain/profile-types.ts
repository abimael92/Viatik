/**
 * Local-only mirror of the signed-in user's own profile.
 *
 * The authoritative copy lives in Supabase (`profiles`); this table is a
 * per-device cache so safety-critical fields like the emergency contact remain
 * readable offline. It is intentionally NOT part of the sync/outbox system —
 * it is seeded once while online and refreshed on app open.
 */
export interface LocalProfile {
  /** Mirrors the Supabase `auth.users.id` (also the Dexie row key). */
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  passportIssuingCountry: string | null;
  passportExpiresOn: string | null;
  updatedAt: string;
}

/** True when the profile has a fully-populated emergency contact to call. */
export function hasEmergencyContact(profile: Pick<LocalProfile, "emergencyContactName" | "emergencyContactPhone">): boolean {
  return Boolean(profile.emergencyContactName && profile.emergencyContactPhone);
}
