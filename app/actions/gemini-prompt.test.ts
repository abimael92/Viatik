import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiKey: "test-gemini-key",
  getUser: vi.fn(),
}));

vi.mock("@/env.mjs", () => ({ env: { GEMINI_API_KEY: mocks.apiKey } }));
vi.mock("@/lib/supabase/server-client", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

import { generateGeminiText } from "@/app/actions/gemini-prompt";

describe("generateGeminiText", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("rejects empty and oversized prompts before provider access", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(generateGeminiText("  ")).resolves.toMatchObject({ success: false });
    await expect(generateGeminiText("x".repeat(4001))).resolves.toMatchObject({
      success: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires authentication before calling Gemini", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(generateGeminiText("Suggest a weekend trip.")).resolves.toEqual({
      success: false,
      error: "Sign in again to use Gemini.",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the prompt and server-only key to the requested Gemini model", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Try the coast." }] } }],
      }),
    } as Response);

    await expect(generateGeminiText("Suggest a weekend trip.")).resolves.toEqual({
      success: true,
      text: "Try the coast.",
    });

    const [url, request] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/models/gemini-1.5-flash:generateContent");
    expect(String(url)).not.toContain(mocks.apiKey);
    expect(new Headers(request?.headers).get("x-goog-api-key")).toBe(mocks.apiKey);
    expect(JSON.parse(String(request?.body))).toMatchObject({
      contents: [{ parts: [{ text: "Suggest a weekend trip." }] }],
    });
  });

  it("returns a safe error for provider failures and malformed output", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: false } as Response);
    await expect(generateGeminiText("Hello")).resolves.toMatchObject({
      success: false,
      error: "Gemini couldn't respond right now. Please try again.",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [] }),
    } as Response);
    await expect(generateGeminiText("Hello")).resolves.toMatchObject({
      success: false,
      error: "Gemini returned no text. Please try again.",
    });
  });
});
