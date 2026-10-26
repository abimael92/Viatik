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
  open: controlledOpen,
  onOpenChange,
  badge,
  className,
  triggerClassName,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Controlled mode: the caller owns the open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  badge?: React.ReactNode;
  className?: string;
  triggerClassName?: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const buttonId = `${id}-trigger`;
  const panelId = `${id}-panel`;

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md", className)}>
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          triggerClassName,
        )}
      >
        <span className="flex items-center gap-2">
          {title}
          {badge}
        </span>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform duration-200",
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
