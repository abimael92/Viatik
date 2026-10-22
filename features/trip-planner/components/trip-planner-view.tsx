"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Heading } from "@/components/ui/heading";
import { normalizeCurrencyCode } from "@/features/domain/money";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";
import { useI18n } from "@/lib/i18n/i18n-provider";
import {
  tripIdeaRepository,
  tripSavingsPlanRepository,
} from "@/features/trip-planner/data/dexie-trip-planner-repository";
import type { NewTripIdea, TripIdea } from "@/features/trip-planner/domain/trip-planner-types";
import type { TripIdeaPatch } from "@/features/trip-planner/domain/repositories/trip-idea-repository";
import { TripIdeaCard } from "@/features/trip-planner/components/trip-idea-card";
import { TripIdeaForm } from "@/features/trip-planner/components/trip-idea-form";
import { ScoutIdeaWizard } from "@/features/trip-planner/components/scout-idea-wizard";

function userCurrency(preferredCurrency?: string | null): string {
  try {
    return normalizeCurrencyCode(preferredCurrency ?? "USD");
  } catch {
    return "USD";
  }
}

function ideaPatch(input: NewTripIdea): TripIdeaPatch {
  return {
    name: input.name,
    origin: input.origin,
    destination: input.destination,
    placeId: input.placeId,
    latitude: input.latitude,
    longitude: input.longitude,
    timeZone: input.timeZone,
    startDate: input.startDate,
    endDate: input.endDate,
    targetMonth: input.targetMonth,
    durationDays: input.durationDays,
    adultCount: input.adultCount,
    childCount: input.childCount,
    interests: input.interests,
    notes: input.notes,
    targetTripCostMinor: input.targetTripCostMinor,
    categoryEstimates: input.categoryEstimates,
  };
}

export function TripPlannerView({
  userId,
  onBack,
  onTripCreated,
}: {
  userId: string;
  onBack: () => void;
  onTripCreated?: (ideaId: string, tripId: string) => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const profile = useLocalProfile(userId);
  const currency = userCurrency(profile?.preferredCurrency);
  const [ideas, setIdeas] = useState<TripIdea[] | null>(null);
  const [editingIdea, setEditingIdea] = useState<TripIdea | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => tripIdeaRepository.watchAll((items) => setIdeas(items)), []);
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  function openCreate() {
    setEditingIdea(undefined);
    setEditorOpen(true);
  }

  function openEdit(idea: TripIdea) {
    setEditingIdea(idea);
    setEditorOpen(true);
  }

  async function saveIdea(input: NewTripIdea) {
    if (editingIdea) await tripIdeaRepository.updateIdea(editingIdea.id, ideaPatch(input));
    else await tripIdeaRepository.create(input);
    setEditorOpen(false);
  }

  async function saveSavings(
    ideaId: string,
    input: { currentSavingsMinor: bigint; cadence: "monthly" | "weekly" | "once" }
  ) {
    const existing = await tripSavingsPlanRepository.getByIdea(ideaId);
    await tripSavingsPlanRepository.upsert({
      id: existing?.id ?? crypto.randomUUID(),
      tripIdeaId: ideaId,
      ...input,
    });
  }

  return (
    <section className="space-y-6" aria-labelledby="trip-planner-heading">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button type="button" variant="ghost" className="mb-2 -ml-3" onClick={onBack}>
            {t("copy.tripPlannerBackToTrips")}
          </Button>
          <p className="text-sm font-semibold text-viatik-magenta">{t("copy.tripPlannerEyebrow")}</p>
          <Heading
            level={1}
            id="trip-planner-heading"
            className="mt-1 text-3xl font-bold sm:text-4xl"
          >
            {t("copy.tripPlannerHeading")}
          </Heading>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {t("copy.tripPlannerDescription")}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            disabled={isOnline !== true}
            title={isOnline === false ? t("copy.scoutWizardNeedsConnection") : undefined}
            onClick={() => setWizardOpen(true)}
          >
            <Sparkles aria-hidden />
            {t("copy.scoutWizardTrigger")}
          </Button>
          <Button type="button" onClick={openCreate}>
            {t("copy.addTripIdea")}
          </Button>
        </div>
      </header>

      {ideas === null ? (
        <Card className="p-6 text-sm text-muted-foreground" aria-live="polite">
          {t("copy.tripPlannerLoading")}
        </Card>
      ) : ideas.length === 0 ? (
        <Card className="border-dashed p-8 text-center">
          <Heading level={2} className="text-lg font-semibold">
            {t("copy.tripPlannerEmptyHeading")}
          </Heading>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("copy.tripPlannerEmptyDescription")}
          </p>
          <Button type="button" className="mt-5" onClick={openCreate}>
            {t("copy.tripPlannerAddFirst")}
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {ideas.map((idea) => (
            <TripIdeaCard
              key={idea.id}
              idea={idea}
              onEdit={() => openEdit(idea)}
              onDelete={() => tripIdeaRepository.remove(idea.id)}
              onConvert={async () => {
                const trip = await tripIdeaRepository.convertToTrip(idea.id);
                if (onTripCreated) onTripCreated(idea.id, trip.id);
                else router.push(`/trips/${encodeURIComponent(trip.id)}`);
              }}
              onSaveSavings={(input) => saveSavings(idea.id, input)}
              onAddPriceCheck={async (input) => {
                await tripIdeaRepository.addPriceCheck(idea.id, input);
              }}
              onRemovePriceCheck={async (priceCheckId) => {
                await tripIdeaRepository.removePriceCheck(idea.id, priceCheckId);
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingIdea ? t("copy.tripPlannerEditTitle") : t("copy.tripPlannerCreateTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("copy.tripPlannerDialogDescription", {
                currency: editingIdea?.currency ?? currency,
              })}
            </DialogDescription>
          </DialogHeader>
          <TripIdeaForm
            key={editingIdea?.id ?? "new-idea"}
            idea={editingIdea}
            currency={editingIdea?.currency ?? currency}
            onSave={saveIdea}
            onCancel={() => setEditorOpen(false)}
          />
        </DialogContent>
      </Dialog>
      <ScoutIdeaWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onManualAdd={openCreate}
        currency={currency}
        isOnline={isOnline}
        defaultOrigin={ideas?.find((idea) => idea.origin.trim())?.origin ?? ""}
      />
    </section>
  );
}
