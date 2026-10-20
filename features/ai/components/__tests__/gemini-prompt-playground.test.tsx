import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock("@/app/actions/gemini-prompt", () => ({
  generateGeminiText: mocks.generate,
}));

import { GeminiPromptPlayground } from "@/features/ai/components/gemini-prompt-playground";

describe("GeminiPromptPlayground", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("shows a generated response and loading state", async () => {
    let resolveAction!: (result: { success: true; text: string }) => void;
    mocks.generate.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      })
    );

    render(<GeminiPromptPlayground />);
    fireEvent.change(screen.getByRole("textbox", { name: "Your prompt" }), {
      target: { value: "Suggest a weekend trip." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate response" }));

    expect((screen.getByRole("button", { name: "Generating..." }) as HTMLButtonElement).disabled).toBe(
      true
    );
    resolveAction({ success: true, text: "Try the coast." });

    expect(await screen.findByText("Try the coast.")).toBeTruthy();
    expect(mocks.generate).toHaveBeenCalledWith("Suggest a weekend trip.");
  });

  it("displays a safe error and preserves the entered prompt", async () => {
    mocks.generate.mockResolvedValue({
      success: false,
      error: "Gemini couldn't respond right now. Please try again.",
    });

    render(<GeminiPromptPlayground />);
    const prompt = screen.getByRole("textbox", { name: "Your prompt" });
    fireEvent.change(prompt, { target: { value: "Help me plan a trip." } });
    fireEvent.click(screen.getByRole("button", { name: "Generate response" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Gemini couldn't respond right now. Please try again."
    );
    expect((prompt as HTMLTextAreaElement).value).toBe("Help me plan a trip.");
    expect(
      (screen.getByRole("button", { name: "Generate response" }) as HTMLButtonElement).disabled
    ).toBe(false);
  });
});
