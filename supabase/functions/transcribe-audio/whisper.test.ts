// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { buildWhisperPrompt, normalizeLanguageHint, PROMPT_MAX_LENGTH, transcribeWithWhisper, WHISPER_URL } from "./whisper.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const audio = new Blob(["voice"], { type: "audio/webm" });

describe("transcribeWithWhisper", () => {
  it("sends the clip to whisper-1 with the language hint and returns the trimmed text", async () => {
    const fetchMock = vi.fn(async () => json({ text: "  Nos vemos en el mercado.  ", language: "spanish", duration: 4.2 }));

    const result = await transcribeWithWhisper(fetchMock as typeof fetch, {
      apiKey: "sk-test",
      audio,
      filename: "clip.webm",
      languageHint: "es",
    });

    expect(result).toEqual({ ok: true, text: "Nos vemos en el mercado.", language: "es", durationSeconds: 4.2 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(WHISPER_URL);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk-test");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("language")).toBe("es");
    expect(form.get("response_format")).toBe("verbose_json");
    expect((form.get("file") as File).name).toBe("clip.webm");
    expect(form.get("prompt")).toBeNull();
  });

  it("sends the vocabulary prompt when one is given", async () => {
    const fetchMock = vi.fn(async () => json({ text: "ok" }));

    await transcribeWithWhisper(fetchMock as typeof fetch, { apiKey: "k", audio, filename: "a.webm", languageHint: null, prompt: "Oaxaca" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as FormData).get("prompt")).toBe("Oaxaca");
  });

  it("omits the hint when there is none and maps the detected language name", async () => {
    const fetchMock = vi.fn(async () => json({ text: "Meet at nine.", language: "english", duration: 2 }));

    const result = await transcribeWithWhisper(fetchMock as typeof fetch, { apiKey: "k", audio, filename: "a.webm", languageHint: null });

    expect(result).toMatchObject({ ok: true, language: "en" });
    expect(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData).has("language")).toBe(false);
  });

  it.each([
    [400, "unsupported_format", false],
    [413, "too_large", false],
    [401, "provider_auth", true],
    [429, "provider_rate_limited", true],
    [503, "provider_unavailable", true],
  ])("maps HTTP %i to %s without exposing the provider body", async (status, errorCode, retryable) => {
    const fetchMock = vi.fn(async () => json({ error: { message: "secret details" } }, status));

    const result = await transcribeWithWhisper(fetchMock as typeof fetch, { apiKey: "k", audio, filename: "a.webm", languageHint: "en" });

    expect(result).toEqual({ ok: false, errorCode, retryable });
  });

  it("treats a malformed body and network failures as retryable", async () => {
    await expect(
      transcribeWithWhisper(vi.fn(async () => json({ nope: true })) as typeof fetch, { apiKey: "k", audio, filename: "a.webm", languageHint: null }),
    ).resolves.toEqual({ ok: false, errorCode: "invalid_response", retryable: true });
    await expect(
      transcribeWithWhisper(vi.fn(async () => { throw new TypeError("offline"); }) as typeof fetch, { apiKey: "k", audio, filename: "a.webm", languageHint: null }),
    ).resolves.toEqual({ ok: false, errorCode: "network", retryable: true });
  });

  it("accepts only two-letter language hints", () => {
    expect(normalizeLanguageHint(" ES ")).toBe("es");
    expect(normalizeLanguageHint("en")).toBe("en");
    expect(normalizeLanguageHint("es-MX")).toBeNull();
    expect(normalizeLanguageHint("")).toBeNull();
    expect(normalizeLanguageHint(null)).toBeNull();
  });

  it("builds a short, de-duplicated vocabulary prompt from trip context", () => {
    expect(buildWhisperPrompt(["Ruta  Maya ", "Yucatán, Mexico"])).toBe("Ruta Maya, Yucatán, Mexico");
    expect(buildWhisperPrompt(["Oaxaca", "oaxaca", null, "  "])).toBe("Oaxaca");
    expect(buildWhisperPrompt([null, undefined, ""])).toBeNull();
    expect(buildWhisperPrompt(["x".repeat(500)])).toHaveLength(PROMPT_MAX_LENGTH);
  });
});
