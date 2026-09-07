"use server";

import { env } from "@/env.mjs";
import type { AiScoutContext, AiScoutResult } from "@/features/ai/domain/ai-scout-types";
import {
  createHttpScoutProvider,
  generateScoutSuggestions,
} from "@/features/ai/lib/ai-scout-generator";

/**
 * Generate AI Activity Scout suggestions for `prompt`.
 *
 * When `AI_SCOUT_ENDPOINT` is configured, this calls the remote LLM through the
 * HTTP provider (API key stays server-side); otherwise it uses the deterministic
 * offline heuristic. `generateScoutSuggestions` also falls back to the offline
 * engine on any provider failure. The return value is a validated
 * `AiScoutResult` — the shape the drawer renders, never a raw provider payload.
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
    : undefined;
  return generateScoutSuggestions(prompt, context, provider);
}
