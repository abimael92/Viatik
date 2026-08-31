"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MapPin, Clock } from "lucide-react";
import { motion } from "motion/react";

import type { Activity } from "@/features/domain/entities";
import { cn } from "@/lib/utils";

interface ActivityCardProps {
  activity: Activity;
  onSelect?: (activity: Activity) => void;
}

export function ActivityCard({ activity, onSelect }: ActivityCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id, data: activity });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow",
        "hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "z-50 rotate-2 scale-105 opacity-90 shadow-lg"
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={() => onSelect?.(activity)}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab text-muted-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-card-foreground truncate">{activity.title}</h4>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {activity.description || activity.location || activity.category}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {activity.startTime && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {new Date(activity.startTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            {activity.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {activity.location}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
