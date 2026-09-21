"use client";

import { useEffect, useState } from "react";

import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { feedRepository } from "@/features/feed/data/dexie-feed-repository";
import type { TripFeedItem } from "@/features/feed/domain/feed-types";
import type { FeedActorProfile } from "@/features/feed/lib/use-shared-trip-feed";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";

export interface RecentActivityData {
  loading: boolean;
  items: TripFeedItem[];
  profiles: Map<string, FeedActorProfile>;
}

/**
 * Subscribes to the whole local activity feed across every trip (newest-first)
 * plus the current user's profile and remote actor profiles. Used by the Trips
 * library's aggregated "Recent activity" section.
 */
export function useRecentActivity(userId: string): RecentActivityData {
  const [items, setItems] = useState<TripFeedItem[]>([]);
  const [profiles, setProfiles] = useState<Map<string, FeedActorProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const localProfile = useLocalProfile(userId);

  useEffect(() => feedRepository.watchAll((next) => {
    setItems(next);
    setLoading(false);
  }), []);

  useEffect(() => {
    const actorIds = Array.from(new Set(items.map((item) => item.actorId))).filter((id) => id && id !== userId);
    if (!actorIds.length) return;
    let cancelled = false;
    void collaborationRepository.listProfiles(actorIds).then((remoteProfiles) => {
      if (cancelled) return;
      setProfiles((current) => {
        const next = new Map(current);
        for (const profile of remoteProfiles) {
          next.set(profile.id, { id: profile.id, name: profile.fullName, avatarUrl: profile.avatarUrl, avatarSeed: profile.avatarSeed ?? null });
        }
        return next;
      });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [items, userId]);

  const profilesWithLocalUser = new Map(profiles);
  if (localProfile) {
    profilesWithLocalUser.set(userId, {
      id: userId,
      name: localProfile.fullName,
      avatarUrl: localProfile.avatarUrl,
      avatarSeed: localProfile.avatarSeed ?? null,
    });
  }

  return { loading, items, profiles: profilesWithLocalUser };
}
