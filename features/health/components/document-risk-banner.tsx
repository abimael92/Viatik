"use client";

import { FileWarning } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { TRAVEL_DOCUMENT_TYPE_LABELS } from "@/features/health/domain/health-types";
import type { TravelDocument } from "@/features/health/domain/health-types";
import { healthRepository } from "@/features/health/data/dexie-health-repository";
import {
  formatCountdown,
  summarizeDocuments,
  validateDocument,
} from "@/features/health/lib/document-validator";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Compact, self-contained alert for the trip Overview / Home hub. Watches the
 * user's travel documents and, when any risks failing border checks for this
 * trip's destination and travel date, surfaces a prominent warning.
 */
export function DocumentRiskBanner({
  userId,
  destination,
  travelDate,
}: {
  userId: string;
  destination?: string | null;
  travelDate?: string | null;
}) {
  const { t } = useI18n();
  const [documents, setDocuments] = useState<TravelDocument[]>([]);
  useEffect(() => healthRepository.watchByUser(userId, setDocuments), [userId]);

  const summary = useMemo(
    () => summarizeDocuments(documents, { destination, travelDate }),
    [documents, destination, travelDate],
  );

  if (documents.length === 0 || (summary.invalid.length === 0 && summary.warning.length === 0)) {
    return null;
  }

  const blocking = summary.invalid.length > 0;
  const lines = [...summary.invalid, ...summary.warning].slice(0, 3);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4",
        blocking ? "border-destructive/30 bg-destructive/10" : "border-amber-500/30 bg-amber-500/10",
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          blocking ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600",
        )}
      >
        <FileWarning className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {blocking ? t("copy.docsMayFail") : t("copy.docsNeedAttention")}
        </p>
        <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
          {lines.map((document) => {
            const result = validateDocument(document, { destination, travelDate });
            return (
              <li key={document.id}>
                {TRAVEL_DOCUMENT_TYPE_LABELS[document.type]} · {formatCountdown(result.daysRemaining)}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
