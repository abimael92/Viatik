"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Accessible progressive-disclosure primitive. The trigger toggles
 * `aria-expanded`/`aria-controls` and the panel animates open/closed.
 * The default trigger is a quiet ghost button (>=44px target) so solid
 * fills stay reserved for primary actions.
 */
export function Collapsible({
  title,
  id,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const buttonId = `${id}-trigger`;
  const panelId = `${id}-panel`;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/40 bg-background/60 backdrop-blur-md">
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          {title}
          {badge}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
