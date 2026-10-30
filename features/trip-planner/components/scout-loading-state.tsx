"use client";

import Image from "next/image";
import { BedDouble, Compass, MapPin, Plane, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useI18n } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

const ORBIT_ICONS = [Plane, BedDouble, MapPin, Compass] as const;

/**
 * Scout's mascot ringed by the brand gradient, with the trip icons orbiting it.
 * Transform-only animation so it stays cheap, and it degrades to a still frame
 * when the traveler asked for reduced motion.
 */
function ScoutOrbit({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="relative grid size-16 shrink-0 place-items-center">
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, var(--color-viatik-blue), var(--color-viatik-magenta), var(--color-viatik-red), var(--color-viatik-blue))",
          maskImage: "radial-gradient(circle, transparent 60%, black 63%)",
          WebkitMaskImage: "radial-gradient(circle, transparent 60%, black 63%)",
        }}
        animate={reducedMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
      />

      <motion.span
        aria-hidden
        className="absolute inset-2 rounded-full bg-viatik-magenta/25 blur-md"
        animate={
          reducedMotion
            ? undefined
            : { scale: [0.9, 1.15, 0.9], opacity: [0.45, 0.9, 0.45] }
        }
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="relative size-12 overflow-hidden rounded-full bg-card ring-1 ring-border/60"
        animate={reducedMotion ? undefined : { y: [0, -2, 0] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <Image
          src="/Scout.png"
          alt=""
          width={48}
          height={48}
          className="size-full object-cover"
          priority
        />
      </motion.div>

      {!reducedMotion && (
        <motion.span
          aria-hidden
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
        >
          {ORBIT_ICONS.map((Icon, index) => {
            const angle = (index / ORBIT_ICONS.length) * Math.PI * 2;
            const radius = 30;
            return (
              <motion.span
                key={index}
                className="absolute grid size-5 place-items-center rounded-full border border-border/60 bg-card text-viatik-blue shadow-sm"
                style={{
                  left: `calc(50% + ${Math.cos(angle) * radius}px - 10px)`,
                  top: `calc(50% + ${Math.sin(angle) * radius}px - 10px)`,
                }}
                animate={{ rotate: -360 }}
                transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
              >
                <Icon className="size-2.5" />
              </motion.span>
            );
          })}
        </motion.span>
      )}
    </div>
  );
}

/** Placeholder result card with a brand-tinted shimmer. */
export function ScoutSkeletonCard({
  index,
  reducedMotion,
}: {
  index: number;
  reducedMotion: boolean;
}) {
  return (
    <motion.div
      aria-hidden
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: reducedMotion ? 0 : index * 0.08 }}
      className="relative w-[86vw] shrink-0 snap-center overflow-hidden rounded-2xl border border-border/60 bg-card p-4 sm:w-auto"
    >
      <div className="flex items-center gap-3">
        <motion.div
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-viatik-blue/10 text-viatik-blue"
          animate={reducedMotion ? undefined : { rotate: [0, 12, -12, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: index * 0.2 }}
        >
          <Compass className="size-4" />
        </motion.div>
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/2 rounded bg-gradient-to-r from-viatik-blue/15 to-viatik-magenta/15" />
          <div className="h-2.5 w-1/3 rounded bg-viatik-magenta/10" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-2.5 w-full rounded bg-viatik-blue/10" />
        <div className="h-2.5 w-3/4 rounded bg-viatik-blue/10" />
      </div>
      <div className="mt-3 h-5 w-20 rounded-full bg-viatik-magenta/10" />
      {!reducedMotion && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-viatik-magenta/15 to-transparent"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "linear", delay: index * 0.12 }}
        />
      )}
    </motion.div>
  );
}

/**
 * Scout's search screen: mascot, rotating stage line, brand progress bar and
 * shimmering result placeholders.
 */
export function ScoutLoadingState({
  stageKeys,
  stageIndex,
  skeletonCount,
  reducedMotion,
}: {
  stageKeys: readonly TranslationKey[];
  stageIndex: number;
  skeletonCount: number;
  reducedMotion: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-viatik-blue/10 via-viatik-magenta/10 to-viatik-red/10 p-4">
        <div className="flex items-center gap-4">
          <ScoutOrbit reducedMotion={reducedMotion} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles aria-hidden className="size-3.5 shrink-0 text-viatik-magenta" />
              {t("copy.scoutWizardThinking")}
            </p>
            <div className="mt-1 min-h-4">
              <AnimatePresence mode="wait">
                <motion.p
                  key={stageIndex}
                  initial={reducedMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.28 }}
                  className="text-xs text-muted-foreground"
                >
                  {t(stageKeys[stageIndex] ?? stageKeys[0]!)}
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full w-1/3 rounded-full bg-viatik-gradient shadow-[0_0_12px_rgba(168,85,247,0.6)]"
                animate={reducedMotion ? undefined : { x: ["-100%", "250%"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </div>
        </div>
      </div>

      {Array.from({ length: skeletonCount }).map((_, index) => (
        <ScoutSkeletonCard key={index} index={index} reducedMotion={reducedMotion} />
      ))}
    </div>
  );
}
