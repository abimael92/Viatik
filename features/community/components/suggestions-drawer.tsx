"use client";

import { useState } from "react";
import { ListChecks, MapPin, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { AddSuggestionDialog } from "@/features/community/components/add-suggestion-dialog";
import { publicTemplates, type PublicTripTemplate } from "@/features/community/data/public-templates";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Swipeable bottom-sheet of community trip suggestions. Hidden until the
 * floating trigger is tapped; then it slides up and can be swiped down (via the
 * grab handle) or dismissed to close. Tapping a suggestion opens the "Add this
 * trip" dialog so the user can set dates and edit before adding.
 */
export function SuggestionsDrawer({
  userId,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
  inline = false,
}: {
  userId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  inline?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [selected, setSelected] = useState<PublicTripTemplate | null>(null);
  const { t } = useI18n();
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  return (
    <>
      {/* Floating trigger — only visible when the sheet is closed and a custom
          trigger hasn't been provided by the parent. */}
      {showTrigger && (
        <AnimatePresence>
          {!open && (
            <motion.button
              key="suggestions-trigger"
              type="button"
              onClick={() => setOpen(true)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="fixed bottom-20 left-0 right-0 z-40 mx-auto flex w-fit items-center gap-2 rounded-full border bg-card/95 px-4 py-2.5 text-sm font-semibold shadow-lg backdrop-blur transition-colors hover:bg-card lg:bottom-6"
            >
              <Sparkles className="size-4 text-viatik-magenta" aria-hidden />
              {t("common.travelIdeas")}
            </motion.button>
          )}
        </AnimatePresence>
      )}

      {/* Dimmed backdrop behind the sheet. */}
      <AnimatePresence>
        {open && !inline && (
          <motion.div
            key="suggestions-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/40"
            aria-hidden
          />
        )}
      </AnimatePresence>

      {/* The sheet itself — slides up/down, swipable to close. */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="suggestions-sheet"
            drag="y"
            dragConstraints={{ top: 0, bottom: 120 }}
            dragElastic={{ top: 0.05, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) setOpen(false);
            }}
            initial={{ y: inline ? 16 : "100%", opacity: inline ? 0 : 1 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: inline ? 16 : "100%", opacity: inline ? 0 : 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className={cn(
              "mx-auto w-full max-w-6xl",
              inline ? "relative z-10" : "fixed inset-x-0 bottom-0 z-50"
            )}
          >
            <div className={cn(
              "overflow-hidden bg-card shadow-2xl",
              inline ? "rounded-2xl border" : "rounded-t-2xl border-t"
            )}>
            {/* Grab handle — swipe down to close. */}
            <div className="flex justify-center pt-2.5">
              <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
            </div>

            <div className="flex items-center justify-between px-5 pb-1 pt-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-viatik-magenta">
                <Sparkles className="size-4" aria-hidden />
                {t("common.travelIdeasFromCommunity")}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("common.closeSuggestions")}
                className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <div className="flex gap-3 overflow-x-auto px-5 pb-6 pt-2">
              {publicTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setSelected(template);
                    setOpen(false);
                  }}
                  className="group w-56 shrink-0 overflow-hidden rounded-xl border bg-card text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-viatik-magenta/50"
                >
                  <div className={cn("relative flex h-20 items-end p-3", template.gradient)}>
                    <span className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent" aria-hidden />
                    <div className="relative">
                      <p className="text-sm font-bold text-white drop-shadow-sm">{template.name}</p>
                      <p className="flex items-center gap-1 text-xs text-white/85">
                        <MapPin className="size-3" aria-hidden /> {template.destination}
                      </p>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-1 text-xs text-muted-foreground">{template.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {template.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold capitalize text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <ListChecks className="size-3" aria-hidden />
                      {template.source.activities.length} {t("common.activities")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddSuggestionDialog
        template={selected}
        open={selected !== null}
        onOpenChange={(value) => {
          if (!value) setSelected(null);
        }}
        userId={userId}
      />
    </>
  );
}
