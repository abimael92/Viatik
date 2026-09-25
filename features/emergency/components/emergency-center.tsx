"use client";

import Link from "next/link";
import { FileText, Lock, Phone, ShieldAlert } from "lucide-react";
import { useState, type ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VaultEntryCategory } from "@/features/vault/domain/vault-types";
import {
  useEmergencyCenterData,
  type EmergencyCenterData,
} from "@/features/emergency/lib/use-emergency-center-data";
import { telHref } from "@/features/emergency/lib/emergency-numbers";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

const CATEGORY_KEYS: Record<VaultEntryCategory, TranslationKey> = {
  passport: "common.passport",
  insurance: "copy.travelInsurance",
  visa: "copy.visa",
  other: "common.other",
};

const EMERGENCY_LABEL_KEYS: Record<string, TranslationKey> = {
  "General emergency": "copy.generalEmergency",
  Police: "copy.police",
  Medical: "copy.medical",
  Fire: "copy.fire",
  "Medical & fire": "copy.medicalAndFire",
};

/**
 * Emergency Center & Safety Hub. One-tap access to the user's emergency
 * contact, destination local emergency numbers, and critical vault documents.
 *
 * All data is read from the local-first Dexie layer + local profile mirror, so
 * the hub works fully offline. The trigger is supplied by the caller via a
 * render prop so it can match each surface (home quick action vs. trip
 * workspace) exactly.
 */
export function EmergencyCenter({
  ownerId,
  tripId,
  destination,
  vaultHref,
  settingsHref = "/settings",
  trigger,
}: {
  ownerId: string;
  tripId: string | null;
  destination: string | null;
  /** Deep-link to the trip vault tab (used for locked-vault and doc shortcuts). */
  vaultHref: string;
  /** Deep-link to settings where the emergency contact can be added/edited. */
  settingsHref?: string;
  trigger: (open: () => void) => ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const data = useEmergencyCenterData({ ownerId, tripId, destination, refreshKey });

  const openModal = () => {
    // Re-evaluate the vault session on each open so an unlock since the last
    // view is picked up.
    setRefreshKey((value) => value + 1);
    setOpen(true);
  };

  return (
    <>
      {trigger(openModal)}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
                <ShieldAlert className="size-5" />
              </span>
              <div>
                <DialogTitle>{t("copy.emergencyCenter")}</DialogTitle>
                <DialogDescription>{t("copy.emergencyCenterDescription")}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5">
            <LocalNumbersSection data={data} />
            <EmergencyContactSection data={data} settingsHref={settingsHref} />
            <CriticalDocsSection data={data} vaultHref={vaultHref} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LocalNumbersSection({ data }: { data: EmergencyCenterData }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="ec-numbers-heading" className="rounded-2xl border border-destructive/30 bg-card p-4">
      <div className="flex items-center gap-2">
        <Phone className="size-5 text-destructive" aria-hidden />
        <h3 id="ec-numbers-heading" className="text-sm font-semibold">
          {t("copy.localEmergencyNumbers")}
        </h3>
        {data.destination.country && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {data.destination.country}
          </span>
        )}
      </div>
      <div className="mt-3 grid gap-2">
        {data.destination.numbers.map((entry, index) => {
          const labelKey = EMERGENCY_LABEL_KEYS[entry.label];
          return (
            <a
              key={`${entry.number}-${index}`}
              href={telHref(entry.number)}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "justify-between border-destructive/20 hover:border-destructive/40"
              )}
            >
              <span className="text-sm text-muted-foreground">
                {labelKey ? t(labelKey) : entry.label}
              </span>
              <span className="font-mono text-base font-bold tabular-nums">{entry.number}</span>
            </a>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("copy.emergencyNumbersDisclaimer")}</p>
    </section>
  );
}

function EmergencyContactSection({
  data,
  settingsHref,
}: {
  data: EmergencyCenterData;
  settingsHref: string;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="ec-contact-heading" className="rounded-2xl border border-destructive/30 bg-card p-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-5 text-destructive" aria-hidden />
        <h3 id="ec-contact-heading" className="text-sm font-semibold">
          {t("common.emergencyContact")}
        </h3>
      </div>
      {data.loading ? (
        <div className="mt-3 h-12 animate-pulse rounded-lg bg-muted" />
      ) : data.emergencyContact ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-semibold">{data.emergencyContact.name}</p>
            {data.emergencyContact.relationship && (
              <p className="text-sm text-muted-foreground">{data.emergencyContact.relationship}</p>
            )}
          </div>
          <a
            href={telHref(data.emergencyContact.phone)}
            className={cn(buttonVariants({ variant: "primary", size: "lg" }), "justify-center")}
          >
            <Phone className="size-5" />
            {t("copy.callNumber", { phone: data.emergencyContact.phone })}
          </a>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed p-4">
          <p className="text-sm text-muted-foreground">{t("copy.addEmergencyContactOffline")}</p>
          <Link href={settingsHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
            {t("copy.addInSettings")}
          </Link>
        </div>
      )}
    </section>
  );
}

function CriticalDocsSection({
  data,
  vaultHref,
}: {
  data: EmergencyCenterData;
  vaultHref: string;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="ec-docs-heading" className="rounded-2xl border border-destructive/30 bg-card p-4">
      <div className="flex items-center gap-2">
        <FileText className="size-5 text-destructive" aria-hidden />
        <h3 id="ec-docs-heading" className="text-sm font-semibold">
          {t("copy.criticalDocuments")}
        </h3>
      </div>
      {data.criticalDocs === null ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-dashed p-4">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{t("copy.unlockVaultDocs")}</p>
          </div>
          <Link href={vaultHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("copy.unlockVault")}
          </Link>
        </div>
      ) : data.criticalDocs.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("copy.noCriticalDocs")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {data.criticalDocs.map((doc) => (
            <li key={doc.entryId}>
              <Link
                href={vaultHref}
                className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5 transition-colors hover:bg-muted"
              >
                <span className="min-w-0 truncate text-sm font-medium">{doc.title}</span>
                <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  {t(CATEGORY_KEYS[doc.category])}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
