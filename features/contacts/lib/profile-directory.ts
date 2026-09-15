import type { ConnectionSnapshot, ViatikProfileLookup } from "@/features/domain/entities";

/**
 * The signed-in user's own public fields, as exposed by the authenticated
 * layout/page. Used to build the requester-side snapshot when sending a request.
 */
export interface CurrentPublicProfile {
  profileId: string;
  fullName: string;
  viatikId?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  publicHandle?: string | null;
}

/** Builds a PUBLIC-ONLY snapshot for the current user from their own profile. */
export function profileToConnectionSnapshot(profile: CurrentPublicProfile): ConnectionSnapshot {
  return {
    profileId: profile.profileId,
    displayName: profile.fullName || "Viatik user",
    viatikId: profile.viatikId ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    avatarSeed: profile.avatarSeed ?? null,
    publicHandle: profile.publicHandle ?? null,
  };
}

/**
 * Columns that must never appear in a profile-directory row. Defense in depth:
 * the database never selects them, and the mapper refuses to build a lookup
 * from any payload that carries them.
 */
const FORBIDDEN_KEY_FRAGMENTS = ["email", "phone", "address", "passport"];

/**
 * Maps a `profile_directory` RPC row (snake_case) into the domain
 * `ViatikProfileLookup`. The directory returns `display_name`; no private
 * fields are present. If a private field ever slips through, this throws
 * rather than propagate it.
 */
export function mapProfileDirectoryRow(row: Record<string, unknown>): ViatikProfileLookup {
  for (const key of Object.keys(row)) {
    const normalized = key.toLowerCase().replace(/_/g, "");
    if (FORBIDDEN_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
      throw new Error("Profile directory row exposed a private field.");
    }
  }

  const profileId = firstString(row.profile_id, row.profileId);
  const viatikId = firstString(row.viatik_id, row.viatikId);
  if (!profileId || !viatikId) {
    throw new Error("Profile directory row is missing its identity fields.");
  }

  return {
    profileId,
    viatikId,
    fullName: firstString(row.display_name, row.displayName) || "",
    avatarUrl: firstNullableString(row.avatar_url, row.avatarUrl),
    avatarSeed: firstNullableString(row.avatar_seed, row.avatarSeed),
    publicHandle: firstNullableString(row.public_handle, row.publicHandle),
    preferredCurrency: firstNullableString(row.preferred_currency, row.preferredCurrency),
    preferredLanguage: firstNullableString(row.preferred_language, row.preferredLanguage),
  };
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (value != null) return String(value);
  }
  return "";
}

function firstNullableString(...values: unknown[]): string | null {
  const found = values.find((value) => value != null);
  return found == null ? null : String(found);
}
