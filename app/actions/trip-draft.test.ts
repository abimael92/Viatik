import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { OPENAI_API_KEY: "test-key" as string | undefined },
  generateText: vi.fn(),
  createOpenAI: vi.fn(() => vi.fn(() => "openai-model")),
  getUser: vi.fn(),
}));

vi.mock("@/env.mjs", () => ({ env: mocks.env }));
vi.mock("ai", () => ({
  Output: { object: vi.fn((value) => value) },
  generateText: mocks.generateText,
}));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: mocks.createOpenAI }));
vi.mock("@/lib/supabase/server-client", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

import { draftTripIdea } from "@/app/actions/trip-draft";

const validDraft = {
  destination: "Kyoto, Japan",
  start_date: "2027-04-10",
  end_date: "2027-04-14",
  target_month: null,
  duration: 5,
  travelers: { adults: 2, children: 0 },
  notes: "Gardens and food",
};

describe("draftTripIdea", () => {
  beforeEach(() => {
    mocks.env.OPENAI_API_KEY = "test-key";
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.generateText.mockResolvedValue({ output: validDraft });
    vi.clearAllMocks();
  });

  it("requires authentication before invoking the model", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(draftTripIdea("Kyoto for five days")).resolves.toEqual({
      success: false,
      reason: "authentication",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("rejects oversized or empty input before invoking the model", async () => {
    await expect(draftTripIdea(" ")).resolves.toEqual({ success: false, reason: "invalid-input" });
    await expect(draftTripIdea("x".repeat(1001))).resolves.toEqual({
      success: false,
      reason: "invalid-input",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("returns a structured, non-financial draft without persistence", async () => {
    const result = await draftTripIdea("Kyoto in April, five days, two adults");

    expect(result).toEqual({ success: true, draft: validDraft });
    expect(mocks.createOpenAI).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(mocks.generateText).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toMatch(/price|cost|saving|budget/i);
  });

  it("rejects invalid dates and traveler bounds from model output", async () => {
    mocks.generateText.mockResolvedValueOnce({ output: { ...validDraft, end_date: "2027-02-30" } });
    await expect(draftTripIdea("Kyoto in April")).resolves.toEqual({
      success: false,
      reason: "invalid-output",
    });

    mocks.generateText.mockResolvedValueOnce({
      output: { ...validDraft, travelers: { adults: 21, children: 0 } },
    });
    await expect(draftTripIdea("Kyoto for 21 adults")).resolves.toEqual({
      success: false,
      reason: "invalid-output",
    });
  });

  it("returns a safe failure when the provider errors or is not configured", async () => {
    mocks.generateText.mockRejectedValueOnce(new Error("provider failure"));
    await expect(draftTripIdea("Kyoto in April")).resolves.toEqual({
      success: false,
      reason: "unavailable",
    });

    mocks.env.OPENAI_API_KEY = undefined;
    await expect(draftTripIdea("Kyoto in April")).resolves.toEqual({
      success: false,
      reason: "unconfigured",
    });
  });
});
