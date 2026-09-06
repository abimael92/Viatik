"use client";

import { useEffect, useMemo, useState } from "react";

import { vaultRepository } from "@/features/vault/data/dexie-vault-repository";
import type { VaultEntry, VaultEntryValues } from "@/features/vault/domain/vault-types";
import { CRITICAL_VAULT_CATEGORIES, type VaultEntryCategory } from "@/features/vault/domain/vault-types";
import { webCryptoVault } from "@/lib/security/web-crypto-vault";
import { hasEmergencyContact } from "@/features/profile/domain/profile-types";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";
import {
  resolveEmergencyNumbers,
  type DestinationEmergency,
} from "@/features/emergency/lib/emergency-numbers";

export interface EmergencyContact {
  name: string;
  relationship: string | null;
  phone: string;
}

export interface CriticalVaultDoc {
  entryId: string;
  title: string;
  category: VaultEntryCategory;
}

export interface EmergencyCenterData {
  /** True while the local profile (and thus the emergency contact) is unknown. */
  loading: boolean;
  emergencyContact: EmergencyContact | null;
  /** Destination-aware local emergency numbers (falls back to 112). */
  destination: DestinationEmergency;
  /** Whether the trip vault is currently unlocked for the owner. */
  vaultUnlocked: boolean;
  /**
   * Critical documents (passport/insurance/visa) for the trip. `null` when the
   * vault is locked, so callers can show a prompt instead of a stale list.
   */
  criticalDocs: CriticalVaultDoc[] | null;
}

/**
 * Aggregates the Emergency Center's data entirely from the local-first Dexie
 * layer plus the local profile mirror — no network reads at render time.
 *
 * `refreshKey` should be bumped whenever the vault may have been (un)locked so
 * the critical-documents list is recomputed against the current session.
 */
export function useEmergencyCenterData({
  ownerId,
  tripId,
  destination,
  refreshKey = 0,
}: {
  ownerId: string;
  tripId: string | null;
  destination: string | null;
  refreshKey?: number;
}): EmergencyCenterData {
  const profile = useLocalProfile(ownerId);
  const [entries, setEntries] = useState<VaultEntry[]>([]);

  useEffect(() => {
    if (!tripId) return;
    return vaultRepository.watchEntries(tripId, ownerId, setEntries);
  }, [tripId, ownerId]);

  const criticalDocs = useCriticalDocs(tripId ? entries : [], ownerId, refreshKey);

  const emergencyContact = useMemo<EmergencyContact | null>(() => {
    if (!profile || !hasEmergencyContact(profile)) return null;
    return {
      name: profile.emergencyContactName ?? "",
      relationship: profile.emergencyContactRelationship,
      phone: profile.emergencyContactPhone ?? "",
    };
  }, [profile]);

  const destinationNumbers = useMemo(() => resolveEmergencyNumbers(destination), [destination]);

  return {
    loading: profile === null,
    emergencyContact,
    destination: destinationNumbers,
    vaultUnlocked: criticalDocs !== null,
    criticalDocs,
  };
}

/** Decrypts the current entries and filters to critical categories, if unlocked. */
function useCriticalDocs(
  entries: VaultEntry[],
  ownerId: string,
  refreshKey: number
): CriticalVaultDoc[] | null {
  const [decrypted, setDecrypted] = useState<Map<string, VaultEntryValues>>(new Map());

  useEffect(() => {
    const session = webCryptoVault.getSession(ownerId);
    if (!session) return;
    let cancelled = false;
    void (async () => {
      const next = new Map<string, VaultEntryValues>();
      for (const entry of entries) {
        if (cancelled) return;
        try {
          next.set(entry.id, await webCryptoVault.decrypt(entry, session));
        } catch {
          // Skip entries we can't decrypt (corrupt or wrong key version).
        }
      }
      if (!cancelled) setDecrypted(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, ownerId, refreshKey]);

  // Re-evaluated each render; the parent bumps `refreshKey` when the modal
  // opens so a freshly unlocked vault is reflected here.
  if (!webCryptoVault.isUnlocked(ownerId)) return null;

  return [...decrypted.entries()]
    .map(([entryId, values]) => ({
      entryId,
      title: values.title,
      category: values.category ?? "other",
    }))
    .filter((doc) => CRITICAL_VAULT_CATEGORIES.includes(doc.category));
}
