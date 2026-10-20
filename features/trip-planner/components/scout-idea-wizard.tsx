"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, Compass, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";

import { generateScoutTripIdeas } from "@/app/actions/scout-trip-ideas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMinorUnits, getCurrencyExponent, parseMinorUnits } from "@/features/domain/money";
import {
  tripIdeaRepository,
  tripSavingsPlanRepository,
} from "@/features/trip-planner/data/dexie-trip-planner-repository";
import { mapScoutIdeaToTripIdea } from "@/features/trip-planner/domain/scout-trip-idea-mapping";
import type {
  ScoutTripIdeaSuggestion,
  ScoutTripIdeasInput,
} from "@/features/trip-planner/domain/scout-trip-ideas-schema";
import {
  buildGoogleFlightsUrl,
  buildGoogleHotelsUrl,
} from "@/features/trip-planner/domain/google-travel-links";

const VIBE_CHIPS = ["Beach and slow mornings", "A lively city break", "Nature and fresh air"];
const CREW_CHOICES = [
  { size: 1, label: "Just me" },
  { size: 2, label: "With my partner" },
  { size: 3, label: "Friends (3 total)" },
];

type Suggestion = ScoutTripIdeaSuggestion;

function estimateMinorUnits(amount: number, currency: string): bigint {
  return BigInt(amount) * 10n ** BigInt(getCurrencyExponent(currency));
}

export function ScoutIdeaWizard({
  open,
  onOpenChange,
  onManualAdd,
  currency,
  isOnline,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManualAdd: () => void;
  currency: string;
  isOnline: boolean | null;
}) {
  const [step, setStep] = useState(0);
  const [vibe, setVibe] = useState("");
  const [crewSize, setCrewSize] = useState<number | null>(null);
  const [savingsAmount, setSavingsAmount] = useState("");
  const [savingsCadence, setSavingsCadence] = useState<"weekly" | "monthly">("monthly");
  const [consented, setConsented] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  function reset() {
    setStep(0);
    setVibe("");
    setCrewSize(null);
    setSavingsAmount("");
    setSavingsCadence("monthly");
    setConsented(false);
    setSuggestions([]);
    setError(null);
    setLoading(false);
    setSavingIndex(null);
  }

  function close(openNext: boolean) {
    onOpenChange(openNext);
    if (!openNext) reset();
  }

  async function askScout() {
    setError(null);
    if (isOnline !== true) {
      setError("Scout needs a connection. You can still add an idea manually.");
      return;
    }
    if (!consented) {
      setError("Please confirm before sending your answers to Scout.");
      return;
    }
    if (!crewSize) {
      setError("Choose who is joining you.");
      return;
    }

    let savingsCapacityMinor: bigint;
    try {
      savingsCapacityMinor = parseMinorUnits(savingsAmount, currency);
      if (savingsCapacityMinor === 0n) throw new Error("Enter a savings amount greater than zero.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enter a valid savings amount.");
      return;
    }

    setLoading(true);
    try {
      const result = await generateScoutTripIdeas({
        vibe,
        crewSize,
        savingsCapacityMinor: savingsCapacityMinor.toString(),
        savingsCadence,
        currency: currency as ScoutTripIdeasInput["currency"],
        consentToAI: true,
      } satisfies ScoutTripIdeasInput);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSuggestions(Object.values(result.suggestions));
    } catch {
      setError("Scout couldn't connect just now. You can still add an idea manually.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSuggestion(suggestion: Suggestion, index: number) {
    setError(null);
    setSavingIndex(index);
    try {
      const mapped = mapScoutIdeaToTripIdea({
        suggestion,
        vibe,
        crewSize: crewSize ?? 1,
        currency,
        cadence: savingsCadence,
      });
      const saved = await tripIdeaRepository.create(mapped.idea);
      const plan = await tripSavingsPlanRepository.getByIdea(saved.id);
      await tripSavingsPlanRepository.upsert({
        id: plan?.id ?? crypto.randomUUID(),
        tripIdeaId: saved.id,
        currentSavingsMinor: 0n,
        cadence: mapped.cadence,
      });
      close(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't save this idea. Please try again."
      );
    } finally {
      setSavingIndex(null);
    }
  }

  const completedQuestion = suggestions.length > 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Image
              src="/Scout.png"
              alt=""
              width={48}
              height={48}
              className="size-12 rounded-full object-cover"
            />
            <div>
              <DialogTitle>Let Scout help you brainstorm!</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {completedQuestion
                  ? "A few trip sparks, picked just for you."
                  : `Question ${step + 1} of 3`}
              </p>
            </div>
          </div>
        </DialogHeader>

        {isOnline === false ? (
          <div className="space-y-4 rounded-xl border border-border bg-muted/50 p-4">
            <p role="status" className="text-sm">
              Scout needs to be online. Your answers stay on this screen; you can add a trip idea
              manually instead.
            </p>
            <Button
              type="button"
              className="min-h-11"
              onClick={() => {
                close(false);
                onManualAdd();
              }}
            >
              Add an idea manually
            </Button>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="space-y-5">
            {step === 0 && (
              <section className="space-y-4" aria-labelledby="scout-vibe-question">
                <h3 id="scout-vibe-question" className="text-lg font-semibold">
                  Hey! What kind of trip are you craving?
                </h3>
                <p className="text-sm text-muted-foreground">
                  A relaxing beach resort, a fast-paced city adventure, or escaping into nature?
                </p>
                <div className="flex flex-wrap gap-2">
                  {VIBE_CHIPS.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant={vibe === option ? "default" : "outline"}
                      aria-pressed={vibe === option}
                      className="min-h-11"
                      onClick={() => {
                        setVibe(option);
                        setConsented(false);
                      }}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scout-vibe">Or tell me in your own words</Label>
                  <Input
                    id="scout-vibe"
                    value={vibe}
                    maxLength={240}
                    onChange={(event) => {
                      setVibe(event.target.value);
                      setConsented(false);
                    }}
                    placeholder="A cozy food trip with a little adventure..."
                  />
                </div>
              </section>
            )}

            {step === 1 && (
              <section className="space-y-4" aria-labelledby="scout-crew-question">
                <h3 id="scout-crew-question" className="text-lg font-semibold">
                  Who&apos;s coming along?
                </h3>
                <p className="text-sm text-muted-foreground">
                  Solo, with a partner, or a few friends? I usually find 2-3 travelers keeps plans
                  flexible.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {CREW_CHOICES.map((option) => (
                    <Button
                      key={option.size}
                      type="button"
                      variant={crewSize === option.size ? "default" : "outline"}
                      aria-pressed={crewSize === option.size}
                      className="min-h-12 whitespace-normal"
                      onClick={() => {
                        setCrewSize(option.size);
                        setConsented(false);
                      }}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-4" aria-labelledby="scout-wallet-question">
                <h3 id="scout-wallet-question" className="text-lg font-semibold">
                  Let&apos;s talk budget.
                </h3>
                <p className="text-sm text-muted-foreground">
                  How much feel-good progress can you save toward this trip each week or month?
                </p>
                <div className="space-y-2">
                  <Label htmlFor="scout-savings">Comfortable savings amount ({currency})</Label>
                  <Input
                    id="scout-savings"
                    inputMode="decimal"
                    value={savingsAmount}
                    onChange={(event) => {
                      setSavingsAmount(event.target.value);
                      setConsented(false);
                    }}
                    placeholder={currency === "JPY" ? "25000" : "250"}
                  />
                </div>
                <div className="flex gap-2" aria-label="Savings schedule">
                  {(["weekly", "monthly"] as const).map((cadence) => (
                    <Button
                      key={cadence}
                      type="button"
                      variant={savingsCadence === cadence ? "default" : "outline"}
                      aria-pressed={savingsCadence === cadence}
                      className="min-h-11 capitalize"
                      onClick={() => {
                        setSavingsCadence(cadence);
                        setConsented(false);
                      }}
                    >
                      {cadence}
                    </Button>
                  ))}
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={consented}
                    onChange={(event) => setConsented(event.target.checked)}
                    className="mt-1 size-4 accent-primary"
                  />
                  <span>
                    I agree to send my trip vibe, crew size, savings amount and schedule, and
                    currency to OpenAI so Scout can suggest ideas. My exact savings amount is not
                    stored; only my weekly/monthly cadence is saved to the local plan. My account
                    details are not sent.
                  </span>
                </label>
              </section>
            )}

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex justify-between gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={step === 0 || loading}
                onClick={() => {
                  setError(null);
                  setStep((current) => current - 1);
                }}
              >
                <ArrowLeft aria-hidden /> Back
              </Button>
              {step < 2 ? (
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={(step === 0 && vibe.trim().length < 2) || (step === 1 && !crewSize)}
                  onClick={() => {
                    setError(null);
                    setStep((current) => current + 1);
                  }}
                >
                  Next <ArrowRight aria-hidden />
                </Button>
              ) : (
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={loading || !consented || isOnline !== true}
                  onClick={askScout}
                >
                  {loading ? (
                    <LoaderCircle aria-hidden className="animate-spin" />
                  ) : (
                    <Sparkles aria-hidden />
                  )}
                  {loading ? "Scout is thinking..." : "Find my trip ideas"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div aria-live="polite" className="sr-only">
              Scout found {suggestions.length} trip ideas.
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {suggestions.map((suggestion, index) => {
              const flightMinor = estimateMinorUnits(
                suggestion.estimated_flight_cost_per_person,
                currency
              );
              const dailyMinor = estimateMinorUnits(
                suggestion.estimated_daily_budget_per_person,
                currency
              );
              const travelers = BigInt(crewSize ?? 1);
              const groupTotal =
                (flightMinor + dailyMinor * BigInt(suggestion.ideal_duration_days)) * travelers;
              return (
                <Card key={`${suggestion.destination}-${index}`} className="space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-viatik-blue/10 text-viatik-blue">
                      <Compass aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold">{suggestion.destination}</h3>
                      <p className="text-sm text-muted-foreground">
                        {suggestion.best_season} - {suggestion.ideal_duration_days} days
                      </p>
                    </div>
                  </div>
                  <p className="text-sm">{suggestion.scout_pitch}</p>
                  <p className="rounded-lg bg-muted/60 p-3 text-sm">
                    <strong>Scout&apos;s season tip:</strong> {suggestion.best_season}
                  </p>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg border border-border p-3">
                      <dt className="text-muted-foreground">Flight / traveler</dt>
                      <dd className="mt-1 font-semibold">
                        {formatMinorUnits(flightMinor, currency)}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <dt className="text-muted-foreground">Daily / traveler</dt>
                      <dd className="mt-1 font-semibold">
                        {formatMinorUnits(dailyMinor, currency)}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-sm font-semibold">
                    Approx. trip goal for {crewSize} {crewSize === 1 ? "traveler" : "travelers"}:{" "}
                    {formatMinorUnits(groupTotal, currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    These are AI-generated historical estimates. Use the links below to check live
                    prices. They are not guaranteed fares or booking offers.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Opening a search sends this destination to Google.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild type="button" variant="outline" className="min-h-11">
                      <a
                        href={buildGoogleFlightsUrl({
                          origin: "",
                          destination: suggestion.destination,
                          startDate: null,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Check flights
                      </a>
                    </Button>
                    <Button asChild type="button" variant="outline" className="min-h-11">
                      <a
                        href={buildGoogleHotelsUrl(suggestion.destination)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Check hotels
                      </a>
                    </Button>
                  </div>
                  <Button
                    type="button"
                    className="min-h-11 w-full"
                    disabled={savingIndex !== null}
                    onClick={() => void saveSuggestion(suggestion, index)}
                  >
                    {savingIndex === index ? (
                      <LoaderCircle aria-hidden className="animate-spin" />
                    ) : null}
                    Save this trip idea
                  </Button>
                </Card>
              );
            })}
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setSuggestions([]);
                setError(null);
                setStep(0);
              }}
            >
              <ArrowLeft aria-hidden /> Try different answers
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
