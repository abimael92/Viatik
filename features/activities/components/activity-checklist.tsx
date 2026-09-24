"use client";

import { Archive, Check, ChevronDown, ChevronUp, ListChecks, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  activeActivityChecklistItems,
  activityChecklistProgress,
  archiveActivityChecklistItem,
  createActivityChecklistItem,
  MAX_ACTIVITY_CHECKLIST_ITEMS,
  normalizeActivityChecklist,
  removeActivityChecklistItem,
  restoreActivityChecklistItem,
  toggleActivityChecklistItem,
} from "@/features/activities/domain/activity-checklist";
import type { ActivityChecklistItem } from "@/features/domain/entities";
import type { ChecklistFeedAction } from "@/features/feed/lib/feed-builder";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

export function ActivityChecklistProgressPill({
  checklist,
  className,
}: {
  checklist: readonly ActivityChecklistItem[] | null | undefined;
  className?: string;
}) {
  const { t } = useI18n();
  const progress = activityChecklistProgress(checklist);
  if (progress.total === 0) return null;

  const ratio = progress.completed / progress.total;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground",
        className,
      )}
      aria-label={t("common.activityMustDosProgressAria", {
        completed: progress.completed,
        total: progress.total,
      })}
    >
      <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-border/80" aria-hidden>
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </span>
      {t("common.activityMustDosProgress", {
        completed: progress.completed,
        total: progress.total,
      })}
    </span>
  );
}

/** On-the-go Home actions for existing activity checklist items. */
export function ActivityChecklistQuickActions({
  checklist,
  onChange,
}: {
  checklist: readonly ActivityChecklistItem[];
  onChange: (
    next: ActivityChecklistItem[],
    event?: { action: ChecklistFeedAction; itemTitle: string },
  ) => void;
}) {
  const { t } = useI18n();
  const [showSkipped, setShowSkipped] = useState(false);
  const active = activeActivityChecklistItems(checklist);
  const skipped = checklist.filter((item) => item.archived);

  if (checklist.length === 0) return null;

  return (
    <div className="space-y-2">
      {active.length > 0 ? (
        <ul className="space-y-1" aria-label={t("common.activityMustDoList")}>
          {active.map((item) => (
            <li key={item.id} className="flex min-h-11 items-center gap-2 rounded-lg px-1 hover:bg-muted/60">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5">
                <span className="relative inline-flex size-5 shrink-0">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => {
                      const next = normalizeActivityChecklist(toggleActivityChecklistItem(checklist, item.id));
                      onChange(next, {
                        action: item.completed ? "reopened_checklist_item" : "completed_checklist_item",
                        itemTitle: item.title,
                      });
                    }}
                    className="peer size-5 appearance-none rounded-md border border-border bg-background transition-colors checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={item.title}
                  />
                  <Check
                    className="pointer-events-none absolute inset-0 m-auto size-3.5 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
                    aria-hidden
                  />
                </span>
                <span className={cn("min-w-0 flex-1 text-sm", item.completed && "text-muted-foreground line-through")}>
                  {item.title}
                </span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 text-muted-foreground"
                aria-label={t("common.activityMustDoArchive", { name: item.title })}
                title={t("common.activityMustDoArchiveTitle")}
                onClick={() =>
                  onChange(normalizeActivityChecklist(archiveActivityChecklistItem(checklist, item.id)), {
                    action: "skipped_checklist_item",
                    itemTitle: item.title,
                  })
                }
              >
                <Archive aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 text-destructive"
                aria-label={t("common.activityMustDoDelete", { name: item.title })}
                onClick={() =>
                  onChange(normalizeActivityChecklist(removeActivityChecklistItem(checklist, item.id)), {
                    action: "deleted_checklist_item",
                    itemTitle: item.title,
                  })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">
          {skipped.length > 0
            ? t("common.activityMustDosAllArchived")
            : t("common.activityMustDosAllDone")}
        </p>
      )}

      {skipped.length > 0 && (
        <div className="space-y-1 border-t border-border/40 pt-2">
          <button
            type="button"
            className="flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-1 text-left text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={showSkipped}
            onClick={() => setShowSkipped((value) => !value)}
          >
            <span>{t("common.activityMustDosArchived", { count: skipped.length })}</span>
            <ChevronDown className={cn("size-3.5 transition-transform", showSkipped && "rotate-180")} aria-hidden />
          </button>
          {showSkipped && (
            <ul className="space-y-1" aria-label={t("common.activityMustDosArchivedList")}>
              {skipped.map((item) => (
                <li key={item.id} className="flex min-h-11 items-center gap-2 rounded-lg px-1">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground line-through">{item.title}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0"
                    aria-label={t("common.activityMustDoRestore", { name: item.title })}
                    onClick={() =>
                      onChange(normalizeActivityChecklist(restoreActivityChecklistItem(checklist, item.id)), {
                        action: "restored_checklist_item",
                        itemTitle: item.title,
                      })
                    }
                  >
                    <RotateCcw aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0 text-destructive"
                    aria-label={t("common.activityMustDoDelete", { name: item.title })}
                    onClick={() =>
                      onChange(normalizeActivityChecklist(removeActivityChecklistItem(checklist, item.id)), {
                        action: "deleted_checklist_item",
                        itemTitle: item.title,
                      })
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function ActivityChecklistEditor({
  checklist,
  onChange,
}: {
  checklist: ActivityChecklistItem[];
  onChange: (next: ActivityChecklistItem[]) => void;
}) {
  const { t } = useI18n();
  const atLimit = checklist.length >= MAX_ACTIVITY_CHECKLIST_ITEMS;

  function updateTitle(id: string, title: string) {
    onChange(checklist.map((item) => (item.id === id ? { ...item, title } : item)));
  }

  function removeItem(id: string) {
    onChange(checklist.filter((item) => item.id !== id));
  }

  function moveItem(id: string, direction: -1 | 1) {
    const index = checklist.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= checklist.length) return;
    const next = [...checklist];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  }

  function addItem() {
    if (atLimit) return;
    const item = createActivityChecklistItem(t("common.activityMustDoNew"));
    if (!item) return;
    onChange([...checklist, item]);
  }

  return (
    <fieldset className="space-y-3 rounded-xl border p-3">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
        <ListChecks className="size-4 text-primary" aria-hidden />
        {t("common.activityMustDos")}
      </legend>
      <p className="text-xs text-muted-foreground">
        {t("common.activityMustDosEditorHelp")}
      </p>

      {checklist.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          {t("common.activityMustDosEmpty")}
        </p>
      ) : (
        <ul className="space-y-2" aria-label={t("common.activityMustDoList")}>
          {checklist.map((item, index) => (
            <li key={item.id} className="flex items-center gap-2">
              <div className="flex shrink-0 flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t("common.activityMustDoMoveUp", { count: index + 1 })}
                  disabled={index === 0}
                  onClick={() => moveItem(item.id, -1)}
                >
                  <ChevronUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t("common.activityMustDoMoveDown", { count: index + 1 })}
                  disabled={index === checklist.length - 1}
                  onClick={() => moveItem(item.id, 1)}
                >
                  <ChevronDown aria-hidden />
                </Button>
              </div>
              <Label htmlFor={`checklist-title-${item.id}`} className="sr-only">
                {t("common.activityMustDoTitle", { count: index + 1 })}
              </Label>
              <Input
                id={`checklist-title-${item.id}`}
                value={item.title}
                onChange={(event) => updateTitle(item.id, event.target.value)}
                placeholder={t("common.activityMustDoPlaceholder")}
                className={cn("min-h-11", item.archived && "text-muted-foreground line-through")}
              />
              {item.archived && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {t("common.activityMustDoSkipped")}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                aria-label={t("common.activityMustDoRemove", { count: index + 1 })}
                onClick={() => removeItem(item.id)}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" className="w-full" disabled={atLimit} onClick={addItem}>
        <Plus aria-hidden />
        {atLimit ? t("common.activityMustDosLimit") : t("common.activityMustDoAdd")}
      </Button>
    </fieldset>
  );
}
