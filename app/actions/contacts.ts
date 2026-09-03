"use server";

import type { ViatikProfileLookup } from "@/features/domain/entities";
import { parseViatikId } from "@/features/contacts/lib/viatik-id";
import { logger } from "@/lib/observability/logger";
import { createClient } from "@/lib/supabase/server-client";

export type ProfileLookupResult =
  | { success: true; profile: ViatikProfileLookup }
  | { success: false; error: string };

export async function lookupViatikProfile(value: string): Promise<ProfileLookupResult> {
  const viatikId = parseViatikId(value);
  if (!viatikId) return { success: false, error: "Enter a valid Viatik ID or scan a Viatik profile code." };

  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { success: false, error: "Sign in again before linking a contact." };
    const { data, error } = await supabase.rpc("lookup_profile_for_linking", { p_identifier: viatikId });
    if (error) {
      logger.warn("Unable to look up Viatik profile", { code: error.code });
      return { success: false, error: "We couldn't look up that Viatik ID right now." };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { success: false, error: "No Viatik account was found for that ID." };
    return {
      success: true,
      profile: {
        profileId: String(row.profile_id),
        viatikId: String(row.viatik_id),
        fullName: String(row.full_name),
        avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
        publicHandle: row.public_handle == null ? null : String(row.public_handle),
        preferredCurrency: row.preferred_currency == null ? null : String(row.preferred_currency),
        preferredLanguage: row.preferred_language == null ? null : String(row.preferred_language),
      },
    };
  } catch (error) {
    logger.error("Unexpected Viatik profile lookup error", error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: "We couldn't look up that Viatik ID right now." };
  }
}
