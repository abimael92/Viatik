"use server";

import type { ViatikProfileLookup } from "@/features/domain/entities";
import { mapProfileDirectoryRow } from "@/features/contacts/lib/profile-directory";
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

    // Add a timeout to the RPC call to prevent hanging
    const timeoutMs = 8000;
    const rpcPromise = supabase.rpc("lookup_profile_for_linking", { p_identifier: viatikId });
    const timeoutPromise = new Promise<{ data: null; error: { code: string; message: string } }>((_, reject) =>
      setTimeout(() => reject(new Error("RPC timeout")), timeoutMs)
    );

    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);

    if (error) {
      logger.warn("Unable to look up Viatik profile", { code: error.code });
      if (error.code === "42900" || error.message.toLowerCase().includes("rate limit")) {
        return { success: false, error: "Too many lookups. Wait a moment and try again." };
      }
      if (error.message?.includes("timeout") || error.message?.includes("RPC timeout")) {
        return { success: false, error: "The lookup took too long. Please try again." };
      }
      return { success: false, error: "We couldn't look up that Viatik ID right now." };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { success: false, error: "No Viatik account was found for that ID." };
    return { success: true, profile: mapProfileDirectoryRow(row as Record<string, unknown>) };
  } catch (error) {
    logger.error("Unexpected Viatik profile lookup error", error instanceof Error ? error : new Error(String(error)));
    if (error instanceof Error && error.message?.includes("timeout")) {
      return { success: false, error: "The lookup took too long. Please try again." };
    }
    return { success: false, error: "We couldn't look up that Viatik ID right now." };
  }
}
