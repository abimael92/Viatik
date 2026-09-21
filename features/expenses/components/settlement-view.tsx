"use client";

import { ArrowDown, ArrowUp, HandCoins, ReceiptText, Scale } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { UserAvatar } from "@/components/ui/user-avatar";
import { Heading } from "@/components/ui/heading";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import type { ProfileSummary } from "@/features/domain/entities";
import { formatMinorUnits, type CurrencyCode, type MinorUnits } from "@/features/domain/money";
import { useSettlement } from "@/features/expenses/lib/use-settlement";
import type { SettlementTransfer } from "@/features/expenses/lib/settlement";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";

/**
 * Splitwise-style settlement for a trip. Shows each traveler's net standing
 * and a step-by-step, debt-minimized list of the fewest cash transfers needed
 * to settle everyone up. All data is read from the local-first Dexie layer, so
 * it works fully offline.
 */
export function SettlementView({
  tripId,
  userId,
  currency,
}: {
  tripId: string;
  userId: string;
  currency: CurrencyCode;
}) {
  const { loading, balances, transfers, members } = useSettlement(tripId, currency);
  const localProfile = useLocalProfile(userId);
  const [authorizedProfiles, setAuthorizedProfiles] = useState<ProfileSummary[]>([]);
  const memberIds = useMemo(
    () => [...new Set(members.map((member) => member.userId).filter((id): id is string => Boolean(id)))],
    [members]
  );

  useEffect(() => {
    if (memberIds.length === 0) return;
    let cancelled = false;
    void collaborationRepository.listProfiles(memberIds).then((profiles) => {
      if (!cancelled) setAuthorizedProfiles(profiles);
    }).catch(() => {
      if (!cancelled) setAuthorizedProfiles([]);
    });
    return () => {
      cancelled = true;
    };
  }, [memberIds]);

  const identity = useMemo(() => {
    const memberIdSet = new Set(memberIds);
    const profileById = new Map(authorizedProfiles.filter((profile) => memberIdSet.has(profile.id)).map((profile) => [profile.id, profile]));
    return (memberId: string): SettlementIdentity => {
      const authorizedProfile = profileById.get(memberId);
      if (memberId === userId && localProfile) {
        return {
          name: localProfile.fullName?.trim() || authorizedProfile?.fullName?.trim() || "Traveler",
          avatarUrl: localProfile.avatarUrl,
          avatarSeed: localProfile.avatarSeed,
        };
      }
      return {
        name: authorizedProfile?.fullName?.trim() || "Traveler",
        avatarUrl: authorizedProfile?.avatarUrl ?? null,
        avatarSeed: authorizedProfile?.avatarSeed ?? null,
      };
    };
  }, [authorizedProfiles, localProfile, memberIds, userId]);

  return (
    <section aria-labelledby="settlement-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <HandCoins className="size-5" />
        </span>
        <div>
          <Heading level={2} id="settlement-heading" className="text-xl font-bold">
            Settlement
          </Heading>
          <p className="text-sm text-muted-foreground">
            Net balances and the fewest transfers to settle up.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-2xl border bg-card" />
          <div className="h-24 animate-pulse rounded-2xl border bg-card" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <StandingCard balances={balances} identity={identity} currency={currency} />
          <TransfersCard transfers={transfers} identity={identity} currency={currency} />
        </div>
      )}
    </section>
  );
}

type SettlementIdentity = {
  name: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
};

type IdentityLookup = (memberId: string) => SettlementIdentity;

function StandingCard({
  balances,
  identity,
  currency,
}: {
  balances: Record<string, MinorUnits>;
  identity: IdentityLookup;
  currency: CurrencyCode;
}) {
  const standing = Object.entries(balances)
    .filter(([, balance]) => balance !== 0n)
    .sort((a, b) => Number(b[1] - a[1]));

  return (
    <section aria-labelledby="settlement-standing-heading" className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Scale className="size-4 text-muted-foreground" aria-hidden />
        <h3 id="settlement-standing-heading" className="text-sm font-semibold">Traveler standing</h3>
      </div>

      {standing.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Everyone is settled up. Add expenses to see balances.
        </p>
      ) : (
        <ul className="mt-3 divide-y">
          {standing.map(([memberId, balance]) => {
            const owed = balance > 0n;
            const person = identity(memberId);
            return (
              <li key={memberId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  {owed ? (
                    <ArrowDown className="size-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <ArrowUp className="size-4 shrink-0 text-destructive" aria-hidden />
                  )}
                  <IdentityLabel identity={person} />
                </span>
                <span
                  className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${owed ? "text-success" : "text-destructive"}`}
                >
                  {owed ? "+" : "−"}
                  {formatMinorUnits(balance < 0n ? -balance : balance, currency)} {currency}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function IdentityLabel({ identity }: { identity: SettlementIdentity }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 align-middle">
      <UserAvatar
        seed={identity.avatarSeed}
        src={identity.avatarUrl}
        name={identity.name}
        size="sm"
        className="size-6"
        aria-label={identity.name}
      />
      <span className="truncate font-semibold">{identity.name}</span>
    </span>
  );
}

function TransfersCard({
  transfers,
  identity,
  currency,
}: {
  transfers: SettlementTransfer[];
  identity: IdentityLookup;
  currency: CurrencyCode;
}) {
  return (
    <section aria-labelledby="settlement-transfers-heading" className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <ReceiptText className="size-4 text-muted-foreground" aria-hidden />
        <h3 id="settlement-transfers-heading" className="text-sm font-semibold">Optimal settlement</h3>
      </div>

      {transfers.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No transfers needed — everyone is already settled.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {transfers.map((transfer, index) => {
            const from = identity(transfer.fromUserId);
            const to = identity(transfer.toUserId);
            return (
              <li
                key={`${transfer.fromUserId}-${transfer.toUserId}-${index}`}
                className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm">
                  <IdentityLabel identity={from} />
                  <span className="text-muted-foreground">owes</span>
                  <IdentityLabel identity={to} />
                </p>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                  {formatMinorUnits(transfer.amountMinor, currency)} {currency}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
