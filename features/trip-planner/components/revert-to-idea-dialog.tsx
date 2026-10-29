"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/i18n-provider";

/**
 * Turning a converted idea back into an editable idea always asks what should
 * happen to the trip that was created from it, because deleting that trip is
 * visible to everyone it was shared with.
 */
export function RevertToIdeaDialog({
  open,
  onOpenChange,
  onRevert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRevert: (options: { deleteTrip: boolean }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState<"keep" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revert(deleteTrip: boolean) {
    setError(null);
    setPending(deleteTrip ? "delete" : "keep");
    try {
      await onRevert({ deleteTrip });
      onOpenChange(false);
    } catch {
      setError(t("copy.tripIdeaRevertError"));
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending === null) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("copy.tripIdeaRevertTitle")}</DialogTitle>
          <DialogDescription>{t("copy.tripIdeaRevertDescription")}</DialogDescription>
        </DialogHeader>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="space-y-3">
          <div className="rounded-xl border border-border/60 p-4">
            <p className="text-sm font-semibold">{t("copy.tripIdeaRevertKeepTrip")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("copy.tripIdeaRevertKeepTripHint")}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={pending !== null}
              onClick={() => void revert(false)}
            >
              {pending === "keep" ? t("copy.tripIdeaReverting") : t("copy.tripIdeaRevertKeepConfirm")}
            </Button>
          </div>
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-semibold text-destructive">
              {t("copy.tripIdeaRevertDeleteTrip")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("copy.tripIdeaRevertDeleteTripHint")}
            </p>
            <Button
              type="button"
              variant="destructive"
              className="mt-3"
              disabled={pending !== null}
              onClick={() => void revert(true)}
            >
              {pending === "delete"
                ? t("copy.tripIdeaReverting")
                : t("copy.tripIdeaRevertDeleteConfirm")}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={pending !== null}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
