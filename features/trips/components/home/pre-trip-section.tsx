"use client";

import type { Trip } from "@/features/domain/entities";
import { DocumentRiskBanner } from "@/features/health/components/document-risk-banner";
import { DayOnePreview } from "@/features/trips/components/home/day-one-preview";
import { OpenTasksWidget } from "@/features/trips/components/home/open-tasks-widget";
import { isWithinDocumentWindow, type TimelineItem } from "@/features/trips/lib/home-trips";

/**
 * Planning content for a featured trip that is still `planned`: the document
 * risk banner (only when departure is within the document window), open tasks,
 * and the Day 1 itinerary preview. The readiness card stays inside the hero.
 */
export function PreTripSection({
  trip,
  timeline,
  userId,
}: {
  trip: Trip;
  timeline: TimelineItem[];
  userId: string;
}) {
  return (
    <>
      {isWithinDocumentWindow(trip.startDate) && (
        <DocumentRiskBanner
          userId={userId}
          destination={trip.destination}
          travelDate={trip.startDate}
        />
      )}
      <OpenTasksWidget tripId={trip.id} userId={userId} />
      <DayOnePreview trip={trip} items={timeline} />
    </>
  );
}
