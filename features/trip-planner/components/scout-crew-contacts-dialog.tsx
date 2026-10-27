"use client";

import Link from "next/link";
import { Check, LoaderCircle, Search, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import type { Contact } from "@/features/domain/entities";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const MAX_CONTACT_TRAVELERS = 19;

/**
 * Pick travelers from the user's Dexie contacts. Names and ids stay on the
 * device — only the resulting crew count ever leaves this dialog.
 */
export function ScoutCrewContactsDialog({
  ownerId,
  selectedIds,
  onChange,
  onClose,
}: {
  ownerId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => contactRepository.watch(ownerId, setContacts), [ownerId]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = contacts ?? [];
    return needle
      ? list.filter((contact) => contact.fullName.toLowerCase().includes(needle))
      : list;
  }, [contacts, query]);

  function toggle(id: string) {
    if (selected.has(id)) {
      onChange(selectedIds.filter((item) => item !== id));
      return;
    }
    if (selectedIds.length >= MAX_CONTACT_TRAVELERS) return;
    onChange([...selectedIds, id]);
  }

  const total = 1 + selectedIds.length;

  return (
    <Dialog open onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent
        nested
        overlayClassName="bg-black/20"
        className="max-h-[88dvh] overflow-y-auto pt-8 sm:top-[calc(50%-8px)] sm:max-w-lg"
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-viatik-blue text-white">
              <UsersRound aria-hidden />
            </div>
            <DialogTitle>{t("copy.scoutWizardContactsTitle")}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("copy.scoutWizardContactsSearch")}
            aria-label={t("copy.scoutWizardContactsSearch")}
            className="h-11 pl-9"
          />
        </div>

        {contacts === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            {t("copy.scoutWizardContactsLoading")}
          </p>
        ) : contacts.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-sm">{t("copy.scoutWizardContactsEmpty")}</p>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/contacts">{t("copy.scoutWizardContactsEmptyCta")}</Link>
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("copy.scoutWizardContactsNoMatch")}</p>
        ) : (
          <ul className="space-y-1.5" aria-label={t("copy.scoutWizardContactsTitle")}>
            {filtered.map((contact) => {
              const isSelected = selected.has(contact.id);
              const capped = !isSelected && selectedIds.length >= MAX_CONTACT_TRAVELERS;
              return (
                <li key={contact.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    disabled={capped}
                    onClick={() => toggle(contact.id)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                      isSelected && "border-primary bg-primary/5"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded border",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background"
                      )}
                    >
                      {isSelected && <Check className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {contact.fullName}
                    </span>
                    {contact.linkedProfileId && (
                      <Badge variant="muted" className="shrink-0 normal-case tracking-normal">
                        {t("copy.scoutWizardContactsViatikBadge")}
                      </Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t(
              total === 1
                ? "copy.scoutWizardContactsSummaryOne"
                : "copy.scoutWizardContactsSummaryMany",
              { count: selectedIds.length, total }
            )}
          </p>
          <Button type="button" className="min-h-11" onClick={onClose}>
            {t("copy.scoutWizardContactsDone")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
