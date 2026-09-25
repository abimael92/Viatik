"use client";

import { ArrowDown, ArrowUp, HandCoins, ReceiptText, Scale } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Heading } from "@/components/ui/heading";
import { useToast } from "@/components/ui/toast";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import type { ProfileSummary } from "@/features/domain/entities";
import { formatMinorUnits, type CurrencyCode, type MinorUnits } from "@/features/domain/money";
import { SettleUpSheet } from "@/features/expenses/components/settle-up-sheet";
import { useTripBalances } from "@/features/expenses/lib/use-trip-balances";
import type { PairwiseDebt } from "@/features/expenses/lib/trip-balances";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";
import { useI18n } from "@/lib/i18n/i18n-provider";

function isMemberUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Splitwise-style settlement for a trip. Pairwise nets come from the
 * immutable ledger (expenses minus settlements). Settle Up appends a
 * repayment and never mutates a past expense.
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
  const { t } = useI18n();
  const { toast } = useToast();
  const { loading, balances, pairwiseDebts, members } = useTripBalances(tripId, currency);
  const localProfile = useLocalProfile(userId);
  const [authorizedProfiles, setAuthorizedProfiles] = useState<ProfileSummary[]>([]);
  const [selectedDebt, setSelectedDebt] = useState<PairwiseDebt | null>(null);
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
            {t("copy.settlement")}
          </Heading>
          <p className="text-sm text-muted-foreground">
            {t("copy.whoOwesWhomHelp")}
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
          <DebtsCard
            debts={pairwiseDebts}
            identity={identity}
            onSettle={setSelectedDebt}
          />
        </div>
      )}

      <SettleUpSheet
        key={selectedDebt ? `${selectedDebt.payerId}-${selectedDebt.receiverId}-${selectedDebt.amountMinor}` : "closed"}
        open={selectedDebt !== null}
        tripId={tripId}
        userId={userId}
        debt={selectedDebt}
        payerName={selectedDebt ? identity(selectedDebt.payerId).name : ""}
        receiverName={selectedDebt ? identity(selectedDebt.receiverId).name : ""}
        onClose={() => setSelectedDebt(null)}
        onSaved={() =>
          toast({
            title: t("copy.settlementLogged"),
            description: t("copy.settlementLoggedHelp"),
            variant: "success",
          })
        }
        onError={(message) =>
          toast({ title: t("copy.unableSaveSettlement"), description: message, variant: "error" })
        }
      />
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
  const { t } = useI18n();
  const standing = Object.entries(balances)
    .filter(([, balance]) => balance !== 0n)
    .sort((a, b) => Number(b[1] - a[1]));

  return (
    <section aria-labelledby="settlement-standing-heading" className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Scale className="size-4 text-muted-foreground" aria-hidden />
        <h3 id="settlement-standing-heading" className="text-sm font-semibold">{t("copy.travelerStanding")}</h3>
      </div>

      {standing.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("copy.everyoneSettled")}
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

function DebtsCard({
  debts,
  identity,
  onSettle,
}: {
  debts: PairwiseDebt[];
  identity: IdentityLookup;
  onSettle: (debt: PairwiseDebt) => void;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="settlement-transfers-heading" className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <ReceiptText className="size-4 text-muted-foreground" aria-hidden />
        <h3 id="settlement-transfers-heading" className="text-sm font-semibold">{t("copy.whoOwesWhom")}</h3>
      </div>

      {debts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("copy.noTransfers")}
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {debts.map((debt) => {
            const from = identity(debt.payerId);
            const to = identity(debt.receiverId);
            const canSettle = isMemberUuid(debt.payerId) && isMemberUuid(debt.receiverId);
            return (
              <li
                key={`${debt.payerId}-${debt.receiverId}`}
                className="flex flex-col gap-3 rounded-lg border bg-background px-3 py-2.5 sm:flex-row sm:items-center"
              >
                <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm">
                  <IdentityLabel identity={from} />
                  <span className="text-muted-foreground">{t("copy.owes")}</span>
                  <IdentityLabel identity={to} />
                </p>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                    {formatMinorUnits(debt.amountMinor, debt.currency)} {debt.currency}
                  </span>
                  {canSettle && (
                    <Button type="button" variant="primary" onClick={() => onSettle(debt)}>
                      {t("copy.settleUp")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
