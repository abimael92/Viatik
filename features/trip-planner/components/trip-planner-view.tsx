"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
import {
  tripIdeaRepository,
  tripSavingsPlanRepository,
} from "@/features/trip-planner/data/dexie-trip-planner-repository";
import type { NewTripIdea, TripIdea } from "@/features/trip-planner/domain/trip-planner-types";
import type { TripIdeaPatch } from "@/features/trip-planner/domain/repositories/trip-idea-repository";
import { TripIdeaCard } from "@/features/trip-planner/components/trip-idea-card";
import { TripIdeaForm } from "@/features/trip-planner/components/trip-idea-form";

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
  const profile = useLocalProfile(userId);
  const currency = userCurrency(profile?.preferredCurrency);
  const [ideas, setIdeas] = useState<TripIdea[] | null>(null);
  const [editingIdea, setEditingIdea] = useState<TripIdea | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => tripIdeaRepository.watchAll((items) => setIdeas(items)), []);

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
            Back to trips
          </Button>
          <p className="text-sm font-semibold text-viatik-magenta">Plan what comes next</p>
          <Heading
            level={1}
            id="trip-planner-heading"
            className="mt-1 text-3xl font-bold sm:text-4xl"
          >
            Want to go
          </Heading>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Save destinations, record prices you find, and make a private plan. Ideas are stored
            only on this device.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          Add trip idea
        </Button>
      </header>

      {ideas === null ? (
        <Card className="p-6 text-sm text-muted-foreground" aria-live="polite">
          Loading your local wishlist…
        </Card>
      ) : ideas.length === 0 ? (
        <Card className="border-dashed p-8 text-center">
          <Heading level={2} className="text-lg font-semibold">
            Your wishlist is ready
          </Heading>
          <p className="mt-2 text-sm text-muted-foreground">
            Save a destination to start comparing your own estimates.
          </p>
          <Button type="button" className="mt-5" onClick={openCreate}>
            Add your first idea
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
            <DialogTitle>{editingIdea ? "Edit trip idea" : "Save a trip idea"}</DialogTitle>
            <DialogDescription>
              Enter preferences and estimates in {editingIdea?.currency ?? currency}. This plan
              stays on this device.
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
    </section>
  );
}
