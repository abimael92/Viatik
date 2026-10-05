"use client";

import { MessageCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { setWhatsAppNotifications } from "@/app/actions/profile";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { localizeUserError } from "@/lib/i18n/localize-error";
import { cn } from "@/lib/utils";

export function WhatsAppNotificationsCard({ initialEnabled }: { initialEnabled: boolean }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setStatus(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await setWhatsAppNotifications(next);
        if (result.success) {
          setEnabled(result.data.enabled);
          setStatus(t(result.data.enabled ? "copy.whatsAppNotificationsOn" : "copy.whatsAppNotificationsOff"));
          return;
        }
        setEnabled(!next);
        setError(localizeUserError(result.error, t, "copy.whatsAppNotificationsSaveFailed"));
      } catch {
        setEnabled(!next);
        setError(t("copy.whatsAppNotificationsSaveFailed"));
      }
    });
  }

  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="whatsapp-notifications-heading">
      <div className="flex items-start gap-3">
        <MessageCircle className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="whatsapp-notifications-heading" className="font-semibold">
            {t("copy.whatsAppNotifications")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("copy.whatsAppNotificationsHelp")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="whatsapp-notifications-heading"
          aria-describedby="whatsapp-notifications-disclaimer"
          onClick={toggle}
          disabled={pending}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200",
            "before:absolute before:-inset-2 before:content-['']",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-wait disabled:opacity-70",
            enabled ? "bg-success hover:bg-success/90" : "bg-muted-foreground/30 hover:bg-muted-foreground/40"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block size-5 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none",
              enabled ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>
      <p id="whatsapp-notifications-disclaimer" className="mt-4 rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
        {t("copy.whatsAppNotificationsDisclaimer")}
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : status ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {status}
        </p>
      ) : null}
    </section>
  );
}
