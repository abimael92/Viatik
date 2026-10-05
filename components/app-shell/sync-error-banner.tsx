"use client";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function SyncErrorBanner({
  error,
  countdown,
  onRetry,
}: {
  error: string | null;
  countdown: number | null;
  onRetry: () => void;
}) {
  const { t } = useI18n();

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 border-b border-border/40 bg-destructive/10 px-4 py-3 text-sm text-destructive backdrop-blur-md"
    >
      <span>{t("sync.error")}</span>
      <details open className="max-w-2xl text-xs text-destructive/80">
        <summary className="cursor-pointer">{t("copy.technicalDetails")}</summary>
        <code className="mt-1 block wrap-break-word text-left">
          {error || t("sync.noErrorDetails")}
        </code>
      </details>
      {countdown !== null && (
        <span aria-live="polite">{t("common.resyncIn", { count: countdown })}</span>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={onRetry}
        className="min-h-11 border-destructive/40 bg-destructive/10 px-5 font-semibold text-destructive shadow-sm transition-all hover:bg-destructive/20 hover:text-destructive active:scale-[0.98]"
      >
        {t("common.retry")}
      </Button>
    </div>
  );
}
