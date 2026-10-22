"use server";

import { z } from "zod";

import { env } from "@/env.mjs";
import { createClient } from "@/lib/supabase/server-client";

const GEMINI_MODELS = ["gemini-1.5-flash", "gemini-2.5-flash", "gemini-2.0-flash"] as const;
const promptSchema = z.string().trim().min(1).max(4000);
const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(z.object({ text: z.string().optional() }).passthrough()).optional(),
          })
          .optional(),
      })
    )
    .optional(),
});

export type GeminiTextResult =
  | { success: true; text: string }
  | { success: false; error: string };

export async function generateGeminiText(input: unknown): Promise<GeminiTextResult> {
  const parsedPrompt = promptSchema.safeParse(input);
  if (!parsedPrompt.success) {
    return { success: false, error: "Enter a prompt of 1 to 4,000 characters." };
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return { success: false, error: "Sign in again to use Gemini." };
    }

    if (!env.GEMINI_API_KEY) {
      return { success: false, error: "Gemini is not configured on this server." };
    }

    let response: Response | null = null;
    for (const model of GEMINI_MODELS) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: parsedPrompt.data }] }],
            generationConfig: { maxOutputTokens: 1024 },
          }),
          signal: AbortSignal.timeout(30_000),
          cache: "no-store",
        }
      );
      if (response.status !== 404) break;
    }

    if (!response || !response.ok) {
      return {
        success: false,
        error: "Gemini couldn't respond right now. Please try again.",
      };
    }

    const parsedResponse = geminiResponseSchema.safeParse(await response.json());
    const text = parsedResponse.success
      ? parsedResponse.data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? "")
          .join("")
          .trim()
      : "";

    if (!text) {
      return { success: false, error: "Gemini returned no text. Please try again." };
    }

    return { success: true, text: text.slice(0, 12_000) };
  } catch {
    return { success: false, error: "Gemini couldn't respond right now. Please try again." };
  }
}
