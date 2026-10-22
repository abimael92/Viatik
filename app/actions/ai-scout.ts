"use server";

import { env } from "@/env.mjs";
import type {
  AiScoutContext,
  AiScoutResult,
  ScoutProvider,
} from "@/features/ai/domain/ai-scout-types";
import {
  createHttpScoutProvider,
  generateScoutSuggestions,
} from "@/features/ai/lib/ai-scout-generator";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"] as const;

function createGeminiScoutProvider(apiKey: string): ScoutProvider {
  return {
    async generate(prompt: string, context: AiScoutContext): Promise<unknown[]> {
      const instruction =
        `Destination: ${context.destination || "City"}. Currency: ${context.currency || "USD"}.\n` +
        `${prompt}\n` +
        `Return JSON with a "suggestions" array of 6-8 activity objects, each having: ` +
        `title, category (food|culture|outdoors|nightlife|sightseeing), categoryTag, description, ` +
        `durationLabel, timeOfDay (morning|afternoon|evening|any), timeTier (quick-hit|half-session|deep-dive), ` +
        `transitNote, location, estimatedCost (decimal in ${context.currency || "USD"}), and costTier ($ to $$$$).`;

      for (const model of GEMINI_MODELS) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            signal: AbortSignal.timeout(15_000),
            cache: "no-store",
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: instruction }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1600,
                responseMimeType: "application/json",
              },
            }),
          }
        );
        if (response.status === 404) continue;
        if (!response.ok) throw new Error(`Gemini scout responded with ${response.status}`);

        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text =
          data.candidates?.[0]?.content?.parts
            ?.map((part) => part.text ?? "")
            .join("")
            .trim() ?? "";
        const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim()) as unknown;
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === "object") {
          const suggestions = (parsed as { suggestions?: unknown }).suggestions;
          if (Array.isArray(suggestions)) return suggestions;
        }
        throw new Error("Unexpected Gemini scout payload");
      }
      throw new Error("No Gemini model available");
    },
  };
}

/**
 * Generate AI Activity Scout suggestions for `prompt`.
 *
 * When `AI_SCOUT_ENDPOINT` is configured, this calls the remote LLM through the
 * HTTP provider (API key stays server-side); otherwise when `GEMINI_API_KEY` is
 * set it calls Gemini; otherwise it uses the deterministic offline heuristic.
 * `generateScoutSuggestions` also falls back to the offline engine on any
 * provider failure. The return value is a validated `AiScoutResult` — the shape
 * the drawer renders, never a raw provider payload.
 */
export async function scoutActivitySuggestions(
  prompt: string,
  context: AiScoutContext,
): Promise<AiScoutResult> {
  const provider = env.AI_SCOUT_ENDPOINT
    ? createHttpScoutProvider({
        endpoint: env.AI_SCOUT_ENDPOINT,
        apiKey: env.AI_SCOUT_API_KEY,
      })
    : env.GEMINI_API_KEY
      ? createGeminiScoutProvider(env.GEMINI_API_KEY)
      : undefined;
  return generateScoutSuggestions(prompt, context, provider);
}
