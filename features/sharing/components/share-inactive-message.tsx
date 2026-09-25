"use client";

import { useI18n } from "@/lib/i18n/i18n-provider";

/** Client-only inactive share-link message so the server share page can stay a server component. */
export function ShareInactiveMessage() {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-6xl" aria-hidden>
        📷
      </p>
      <h1 className="mt-4 text-xl font-bold">{t("copy.shareInactiveTitle")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("copy.shareInactiveBody")}</p>
    </main>
  );
}
