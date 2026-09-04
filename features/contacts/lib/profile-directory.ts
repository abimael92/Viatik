import type { ViatikProfileLookup } from "@/features/domain/entities";

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
