import { GeminiPageHeader } from "@/features/ai/components/gemini-page-header";
import { GeminiPromptPlayground } from "@/features/ai/components/gemini-prompt-playground";

export default function GeminiPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <GeminiPageHeader />
      <GeminiPromptPlayground />
    </main>
  );
}
