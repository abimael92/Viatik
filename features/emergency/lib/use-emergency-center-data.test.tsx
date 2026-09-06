import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LocalProfile } from "@/features/profile/domain/profile-types";
import type { VaultEntry, VaultEntryValues } from "@/features/vault/domain/vault-types";
import { useEmergencyCenterData } from "@/features/emergency/lib/use-emergency-center-data";

const state = vi.hoisted(() => ({
  profile: null as LocalProfile | null,
  setEntries: null as ((entries: VaultEntry[]) => void) | null,
  unlocked: false,
  decrypted: {} as Record<string, VaultEntryValues>,
}));

vi.mock("@/features/profile/lib/use-local-profile", () => ({
  useLocalProfile: vi.fn(() => state.profile),
}));

vi.mock("@/features/vault/data/dexie-vault-repository", () => ({
  vaultRepository: {
    watchEntries: vi.fn((_tripId, _ownerId, cb) => {
      state.setEntries = cb;
      return () => {};
    }),
  },
}));

vi.mock("@/lib/security/web-crypto-vault", () => ({
  webCryptoVault: {
    getSession: vi.fn(() => ({ ownerId: "u1", keyVersion: 1, key: {}, createdAt: 0 })),
    isUnlocked: vi.fn(() => state.unlocked),
    decrypt: vi.fn(async (entry: VaultEntry) => state.decrypted[entry.id] ?? { title: "?", username: null, secret: "", notes: null }),
  },
}));

function Probe({ ownerId, tripId, destination }: { ownerId: string; tripId: string; destination: string | null }) {
  const data = useEmergencyCenterData({ ownerId, tripId, destination });
  return (
    <div>
      <span data-testid="contact">{data.emergencyContact ? `${data.emergencyContact.name}:${data.emergencyContact.phone}` : "none"}</span>
      <span data-testid="number">{data.destination.numbers[0].number}</span>
      <span data-testid="unlocked">{String(data.vaultUnlocked)}</span>
      <span data-testid="docs">{data.criticalDocs === null ? "null" : data.criticalDocs.map((d) => d.title).join(",")}</span>
    </div>
  );
}

const baseProfile: LocalProfile = {
  id: "u1",
  fullName: "Jordan Lee",
  avatarUrl: null,
  avatarSeed: null,
  phone: "+1 555 0000",
  emergencyContactName: "Mom",
  emergencyContactRelationship: "Parent",
  emergencyContactPhone: "+1 555 0001",
  passportIssuingCountry: "US",
  passportExpiresOn: "2030-05-01",
  updatedAt: "2026-01-01T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.profile = null;
  state.setEntries = null;
  state.unlocked = false;
  state.decrypted = {};
});

describe("useEmergencyCenterData", () => {
  it("derives the emergency contact and destination numbers from local data", () => {
    state.profile = baseProfile;
    render(<Probe ownerId="u1" tripId="trip-1" destination="Lisbon, Portugal" />);

    expect(screen.getByTestId("contact").textContent).toBe("Mom:+1 555 0001");
    expect(screen.getByTestId("number").textContent).toBe("112");
  });

  it("returns no emergency contact when the profile lacks one", () => {
    state.profile = { ...baseProfile, emergencyContactName: null, emergencyContactPhone: null };
    render(<Probe ownerId="u1" tripId="trip-1" destination="Tokyo, Japan" />);

    expect(screen.getByTestId("contact").textContent).toBe("none");
    expect(screen.getByTestId("number").textContent).toBe("110");
  });

  it("returns null critical docs while the vault is locked", () => {
    state.profile = baseProfile;
    state.unlocked = false;
    render(<Probe ownerId="u1" tripId="trip-1" destination={null} />);

    expect(screen.getByTestId("unlocked").textContent).toBe("false");
    expect(screen.getByTestId("docs").textContent).toBe("null");
  });

  it("filters critical documents when the vault is unlocked", async () => {
    state.profile = baseProfile;
    state.unlocked = true;
    state.decrypted = {
      "e-passport": { title: "Passport", username: null, secret: "x", notes: null, category: "passport" },
      "e-other": { title: "Hotel safe", username: null, secret: "x", notes: null, category: "other" },
      "e-visa": { title: "Schengen visa", username: null, secret: "x", notes: null, category: "visa" },
    };

    render(<Probe ownerId="u1" tripId="trip-1" destination={null} />);
    act(() => {
      state.setEntries?.([
        { id: "e-passport", tripId: "trip-1", ownerId: "u1", ciphertext: "", initializationVector: "", keyVersion: 1, createdAt: "", updatedAt: "", deletedAt: null },
        { id: "e-other", tripId: "trip-1", ownerId: "u1", ciphertext: "", initializationVector: "", keyVersion: 1, createdAt: "", updatedAt: "", deletedAt: null },
        { id: "e-visa", tripId: "trip-1", ownerId: "u1", ciphertext: "", initializationVector: "", keyVersion: 1, createdAt: "", updatedAt: "", deletedAt: null },
      ]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("unlocked").textContent).toBe("true");
      expect(screen.getByTestId("docs").textContent).toContain("Passport");
    });
    expect(screen.getByTestId("docs").textContent).toContain("Schengen visa");
    expect(screen.getByTestId("docs").textContent).not.toContain("Hotel safe");
  });
});
