export const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
export const WHISPER_MODEL = "whisper-1";
/** OpenAI rejects uploads larger than 25 MB. */
export const WHISPER_MAX_BYTES = 25 * 1024 * 1024;
export const TRANSCRIPT_MAX_LENGTH = 20_000;
/** Whisper reads at most 224 prompt tokens; proper nouns are all the hint needs. */
export const PROMPT_MAX_LENGTH = 200;

/** A 10-minute dictation usually transcribes in well under a minute. */
const TIMEOUT_MS = 120_000;
const LANGUAGE_CODE = /^[a-z]{2}$/;

/** verbose_json reports the detected language by name, not by ISO-639-1 code. */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  english: "en",
  spanish: "es",
  portuguese: "pt",
  french: "fr",
  german: "de",
  italian: "it",
};

export type WhisperResult =
  | { ok: true; text: string; language: string | null; durationSeconds: number | null }
  | { ok: false; errorCode: string; retryable: boolean };

export function normalizeLanguageHint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return LANGUAGE_CODE.test(code) ? code : null;
}

/**
 * Vocabulary hint from trip context (for example "Oaxaca Food Tour, Oaxaca, Mexico")
 * so place names are spelled correctly. No framing words, which would bias the language.
 */
export function buildWhisperPrompt(parts: readonly unknown[]): string | null {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") continue;
    const term = part.replace(/\s+/g, " ").trim();
    if (!term || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    terms.push(term);
  }
  const prompt = terms.join(", ").slice(0, PROMPT_MAX_LENGTH).trim();
  return prompt || null;
}

function detectedLanguage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().toLowerCase();
  return LANGUAGE_NAMES[name] ?? normalizeLanguageHint(name);
}

function failure(status: number): WhisperResult {
  if (status === 400 || status === 415) return { ok: false, errorCode: "unsupported_format", retryable: false };
  if (status === 413) return { ok: false, errorCode: "too_large", retryable: false };
  if (status === 401 || status === 403) return { ok: false, errorCode: "provider_auth", retryable: true };
  if (status === 429) return { ok: false, errorCode: "provider_rate_limited", retryable: true };
  return { ok: false, errorCode: status >= 500 ? "provider_unavailable" : `provider_${status}`, retryable: status >= 500 };
}

/**
 * POST the clip to OpenAI `audio/transcriptions`. Provider error bodies are
 * never returned; callers only see a short error code.
 */
export async function transcribeWithWhisper(
  fetchImpl: typeof fetch,
  request: { apiKey: string; audio: Blob; filename: string; languageHint: string | null; prompt?: string | null },
): Promise<WhisperResult> {
  const form = new FormData();
  form.append("file", request.audio, request.filename);
  form.append("model", WHISPER_MODEL);
  form.append("response_format", "verbose_json");
  if (request.languageHint) form.append("language", request.languageHint);
  if (request.prompt) form.append("prompt", request.prompt);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${request.apiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return failure(response.status);
    }
    const body = (await response.json().catch(() => null)) as { text?: unknown; language?: unknown; duration?: unknown } | null;
    if (!body || typeof body.text !== "string") return { ok: false, errorCode: "invalid_response", retryable: true };
    const duration = typeof body.duration === "number" && Number.isFinite(body.duration) && body.duration >= 0 ? body.duration : null;
    return {
      ok: true,
      text: body.text.trim().slice(0, TRANSCRIPT_MAX_LENGTH),
      language: request.languageHint ?? detectedLanguage(body.language),
      durationSeconds: duration,
    };
  } catch {
    return { ok: false, errorCode: controller.signal.aborted ? "timeout" : "network", retryable: true };
  } finally {
    clearTimeout(timeout);
  }
}
