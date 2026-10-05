"use client";

import { Captions, CaptionsOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MediaTranscript } from "@/features/domain/entities-media";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

export function TranscriptToggle({
  open,
  controls,
  onToggle,
}: {
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const label = open ? t("copy.hideTranscript") : t("copy.showTranscript");
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={label}
      title={label}
      className={cn(
        "min-w-11 shrink-0 px-2.5 text-muted-foreground hover:text-foreground sm:px-3",
        open && "bg-viatik-magenta/10 text-foreground hover:bg-viatik-magenta/15"
      )}
    >
      {open ? <CaptionsOff aria-hidden /> : <Captions aria-hidden />}
      <span className="hidden text-xs sm:inline">{label}</span>
    </Button>
  );
}

/** Collapsible, read-only transcript. Collapsed content is inert so it stays out of the tab order. */
export function TranscriptPanel({
  id,
  open,
  transcript,
}: {
  id: string;
  open: boolean;
  transcript: MediaTranscript | null;
}) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="overflow-hidden">
        <div className="mt-1 rounded-lg border-l-2 border-viatik-magenta/60 bg-muted/50 px-3 py-2.5 text-sm">
          <TranscriptBody transcript={transcript} />
        </div>
      </div>
    </div>
  );
}

function TranscriptBody({ transcript }: { transcript: MediaTranscript | null }) {
  const { t } = useI18n();

  if (!transcript) return <p className="text-muted-foreground">{t("copy.transcriptNotYet")}</p>;

  switch (transcript.status) {
    case "pending":
    case "processing":
      return (
        <div aria-live="polite" aria-busy="true" className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("copy.transcriptPending")}</p>
          <div className="space-y-1.5" aria-hidden>
            <div className="h-2.5 w-11/12 animate-pulse rounded bg-muted-foreground/20 motion-reduce:animate-none" />
            <div className="h-2.5 w-3/4 animate-pulse rounded bg-muted-foreground/20 motion-reduce:animate-none" />
          </div>
        </div>
      );
    case "skipped":
      return <p className="text-muted-foreground">{t("copy.transcriptLimitReached")}</p>;
    case "done":
      if (transcript.text?.trim()) {
        return (
          <div className="space-y-1.5">
            {transcript.language ? (
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("copy.transcriptAutoLabel", { language: transcript.language.toUpperCase() })}
              </p>
            ) : null}
            <p className="whitespace-pre-line leading-relaxed text-foreground" lang={transcript.language ?? undefined}>
              {transcript.text.trim()}
            </p>
          </div>
        );
      }
      return <p className="text-muted-foreground">{t("copy.transcriptUnavailable")}</p>;
    default:
      return <p className="text-muted-foreground">{t("copy.transcriptUnavailable")}</p>;
  }
}
