"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { useToast } from "@/components/ui/toast";
import { RevertToIdeaDialog } from "@/features/trip-planner/components/revert-to-idea-dialog";
import { tripIdeaRepository } from "@/features/trip-planner/data/dexie-trip-planner-repository";
import type { TripIdea } from "@/features/trip-planner/domain/trip-planner-types";
import { useI18n } from "@/lib/i18n/i18n-provider";

/**
 * Shown on the trip Settings tab only for trips that were planned from a local
 * idea, so the trip can be moved back to the wishlist.
 */
export function TripIdeaLinkSection({
  tripId,
  canSendBack,
}: {
  tripId: string;
  canSendBack: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { toast } = useToast();
  const [idea, setIdea] = useState<TripIdea | null | undefined>(undefined);
  const [revertOpen, setRevertOpen] = useState(false);

  useEffect(
    () => tripIdeaRepository.watchByTripId(tripId, (value) => setIdea(value ?? null)),
    [tripId]
  );

  if (!canSendBack || !idea) return null;

  return (
    <div className="rounded-2xl border bg-card p-5">
      <Heading level={3} className="text-base font-semibold">
        {t("copy.tripIdeaLinkedHeading")}
      </Heading>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("copy.tripIdeaLinkedDescription", { name: idea.name })}
      </p>
      <Button type="button" variant="outline" className="mt-4" onClick={() => setRevertOpen(true)}>
        <Undo2 aria-hidden />
        {t("copy.tripIdeaSetBack")}
      </Button>
      <RevertToIdeaDialog
        open={revertOpen}
        onOpenChange={setRevertOpen}
        onRevert={async ({ deleteTrip }) => {
          await tripIdeaRepository.sendTripBackToIdea(tripId, { deleteTrip });
          if (deleteTrip) {
            router.replace("/trips");
            return;
          }
          toast({
            title: t("copy.tripIdeaRevertedTitle"),
            description: t("copy.tripIdeaRevertedDescription"),
            variant: "success",
          });
        }}
      />
    </div>
  );
}
