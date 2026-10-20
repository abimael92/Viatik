import { GeminiPromptPlayground } from "@/features/ai/components/gemini-prompt-playground";

export default function GeminiPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-viatik-blue">AI Playground</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Gemini</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Try a prompt with Gemini. Generation is handled on the server so your API key stays
          private.
        </p>
      </header>
      <GeminiPromptPlayground />
    </main>
  );
}
