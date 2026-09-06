"use client";

import { useEffect, useState } from "react";

import { getMyProfile } from "@/app/actions/profile";
import type { LocalProfile } from "@/features/profile/domain/profile-types";
import { profileRepository } from "@/features/profile/data/dexie-profile-repository";

/**
 * Subscribes to the local profile mirror and refreshes it from Supabase once
 * on mount. Reads always come from Dexie (offline-first); the refresh is a
 * best-effort upsert that silently keeps the cached copy when offline.
 */
export function useLocalProfile(ownerId: string): LocalProfile | null {
  const [profile, setProfile] = useState<LocalProfile | null>(null);

  useEffect(() => profileRepository.watch(ownerId, setProfile), [ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    void (async () => {
      try {
        const remote = await getMyProfile();
        if (cancelled || !remote) return;
        await profileRepository.upsert(remote);
      } catch {
        // Offline or transient error: keep whatever is already cached locally.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  return profile;
}
