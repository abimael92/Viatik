"use server";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { isValid, parseISO } from "date-fns";
import { z } from "zod";

import { env } from "@/env.mjs";
import { createClient } from "@/lib/supabase/server-client";
import { getTripDurationError } from "@/features/trips/lib/trip-duration";

const sentenceSchema = z.string().trim().min(1).max(1000);

const tripIdeaDraftSchema = z
  .object({
    destination: z.string().max(120).nullable(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    target_month: z.string().nullable(),
    duration: z.number().int().min(1).max(60).nullable(),
    travelers: z
      .object({
        adults: z.number().int().min(1).max(20).nullable(),
        children: z.number().int().min(0).max(20).nullable(),
      })
      .strict(),
    notes: z.string().max(500),
  })
  .strict();

export type TripIdeaDraft = z.infer<typeof tripIdeaDraftSchema>;

export type DraftTripIdeaResult =
  | { success: true; draft: TripIdeaDraft }
  | {
      success: false;
      reason: "authentication" | "unconfigured" | "invalid-input" | "invalid-output" | "unavailable";
    };

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value));
}

function normalizeDraft(value: unknown): TripIdeaDraft | null {
  const parsed = tripIdeaDraftSchema.safeParse(value);
  if (!parsed.success) return null;

  const draft = parsed.data;
  if (
    (draft.start_date !== null && !isDateOnly(draft.start_date)) ||
    (draft.end_date !== null && !isDateOnly(draft.end_date)) ||
    (draft.target_month !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.target_month))
  ) {
    return null;
  }
  if (draft.start_date && draft.end_date && getTripDurationError(draft.start_date, draft.end_date)) {
    return null;
  }

  return {
    ...draft,
    destination: draft.destination?.trim() || null,
    start_date: draft.start_date || null,
    end_date: draft.end_date || null,
    target_month: draft.start_date ? null : draft.target_month,
    notes: draft.notes.trim(),
  };
}

export async function draftTripIdea(sentence: string): Promise<DraftTripIdeaResult> {
  const parsedSentence = sentenceSchema.safeParse(sentence);
  if (!parsedSentence.success) return { success: false, reason: "invalid-input" };

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { success: false, reason: "authentication" };
  } catch {
    return { success: false, reason: "authentication" };
  }

  if (!env.OPENAI_API_KEY) return { success: false, reason: "unconfigured" };

  try {
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    const { output } = await generateText({
      model: openai("gpt-6.1-sol"),
      output: Output.object({ schema: tripIdeaDraftSchema }),
      prompt: `Extract only trip details explicitly stated in this sentence. Do not infer or invent a year, exact dates, traveler counts, destination details, or notes. If a month has no explicit year, leave target_month null. Keep absent or ambiguous values null. Notes may only restate non-financial preferences from the sentence. Never return prices, budgets, costs, savings, financial estimates, or currency.\n\nSentence: ${parsedSentence.data}`,
      maxOutputTokens: 700,
      abortSignal: AbortSignal.timeout(20_000),
    });
    const draft = normalizeDraft(output);
    return draft ? { success: true, draft } : { success: false, reason: "invalid-output" };
  } catch {
    return { success: false, reason: "unavailable" };
  }
}
