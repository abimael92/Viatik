"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { generateGeminiText } from "@/app/actions/gemini-prompt";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { localizeThrownError, localizeUserError } from "@/lib/i18n/localize-error";

const MAX_PROMPT_LENGTH = 4000;

export function GeminiPromptPlayground() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const result = await generateGeminiText(prompt);
      if (result.success) setResponse(result.text);
      else setError(localizeUserError(result.error, t, "errors.geminiFailed"));
    } catch (cause) {
      setError(localizeThrownError(cause, t, "errors.geminiFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t("copy.geminiAskTitle")}</CardTitle>
        <CardDescription>{t("copy.geminiAskDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="gemini-prompt">{t("copy.geminiPromptLabel")}</Label>
            <textarea
              id="gemini-prompt"
              className="min-h-36 w-full resize-y rounded-lg border border-input bg-background px-3 py-3 text-sm leading-6 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={MAX_PROMPT_LENGTH}
              placeholder={t("copy.geminiPromptPlaceholder")}
              aria-describedby="gemini-prompt-count"
              required
            />
            <p id="gemini-prompt-count" className="text-right text-xs text-muted-foreground">
              {prompt.length}/{MAX_PROMPT_LENGTH}
            </p>
          </div>
          <Button
            type="submit"
            variant="ai"
            disabled={loading || !prompt.trim()}
            aria-busy={loading}
          >
            {loading ? t("copy.geminiGenerating") : t("copy.geminiGenerate")}
          </Button>
        </form>

        {loading ? (
          <p className="mt-5 text-sm text-muted-foreground" role="status" aria-live="polite">
            {t("copy.geminiThinking")}
          </p>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {response ? (
          <section className="mt-5 rounded-xl border border-border bg-muted/40 p-4">
            <h2 className="mb-2 text-sm font-semibold">{t("copy.geminiResponseHeading")}</h2>
            <p className="whitespace-pre-wrap text-sm leading-6" role="status" aria-live="polite">
              {response}
            </p>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
