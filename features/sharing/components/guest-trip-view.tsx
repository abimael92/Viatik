"use client";

import { CalendarDays, Clock, Image as ImageIcon, MapPin, Share2 } from "lucide-react";
import { useMemo, useState } from "react";

import type { SharedTripSnapshot } from "@/features/sharing/domain/share-types";
import { cn } from "@/lib/utils";

type GuestTab = "itinerary" | "map" | "photos";

/**
 * Read-only companion view rendered for unauthenticated guests at /share/[slug].
 * Data is fetched server-side and gated by the link's permission flags, so only
 * the sections the owner enabled are shown here.
 */
export function GuestTripView({ snapshot }: { snapshot: SharedTripSnapshot }) {
  const { share, name, destination, startDate, endDate, coverImageUrl, activities, media } = snapshot;

  const tabs: Array<{ key: GuestTab; label: string; enabled: boolean }> = useMemo(
    () => [
      { key: "itinerary", label: "Itinerary", enabled: share.allowItinerary },
      { key: "map", label: "Map", enabled: share.allowMap },
      { key: "photos", label: "Photos", enabled: share.allowGallery },
    ],
    [share],
  );

  const [tab, setTab] = useState<GuestTab>(() => {
    const first = tabs.find((t) => t.enabled);
    return first ? first.key : "itinerary";
  });

  const activeTab = tabs.find((t) => t.key === tab && t.enabled)?.key ?? tabs.find((t) => t.enabled)?.key ?? "itinerary";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="relative overflow-hidden border-b">
        {coverImageUrl && (
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${coverImageUrl})` }}
          />
        )}
        <div className="absolute inset-0 bg-linear-to-b from-black/60 to-black/40" />
        <div className="relative px-6 py-10 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/70">
            {destination ?? "Viatik trip"}
          </p>
          <h1 className="mt-1 max-w-2xl text-3xl font-bold text-white sm:text-4xl">{name}</h1>
          {(startDate || endDate) && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-white/80">
              <CalendarDays className="size-4" aria-hidden />
              {startDate ? formatDay(startDate) : ""}
              {startDate && endDate ? " – " : ""}
              {endDate ? formatDay(endDate) : ""}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        {tabs.filter((t) => t.enabled).length > 0 && (
          <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-b">
            {tabs
              .filter((t) => t.enabled)
              .map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-current={activeTab === key ? "page" : undefined}
                  className={cn(
                    "min-h-11 rounded-t-lg px-4 text-sm font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    activeTab === key
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
          </nav>
        )}

        <div className="mt-6">
          {activeTab === "itinerary" && <ItineraryTab activities={activities} />}
          {activeTab === "map" && <MapTab activities={activities} />}
          {activeTab === "photos" && <PhotosTab media={media} />}
        </div>

        <p className="mt-10 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Share2 className="size-3.5" aria-hidden />
          Shared with you from Viatik · Read-only view
        </p>
      </main>
    </div>
  );
}

function ItineraryTab({ activities }: { activities: SharedTripSnapshot["activities"] }) {
  const days = useMemo(() => {
    const map = new Map<string, SharedTripSnapshot["activities"]>();
    for (const activity of activities) {
      const list = map.get(activity.dayDate) ?? [];
      list.push(activity);
      map.set(activity.dayDate, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [activities]);

  if (days.length === 0) {
    return <EmptyState icon={CalendarDays} title="No itinerary yet" message="The itinerary hasn't been published for this trip." />;
  }

  return (
    <div className="space-y-6">
      {days.map(([dayDate, dayActivities]) => (
        <section key={dayDate}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {formatDay(dayDate)}
          </h2>
          <ul className="mt-3 space-y-2">
            {dayActivities.map((activity) => (
              <li key={activity.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{activity.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {activity.description || activity.category}
                    </p>
                  </div>
                  {activity.startTime && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden />
                      {new Date(activity.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                {activity.location && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" aria-hidden /> {activity.location}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MapTab({ activities }: { activities: SharedTripSnapshot["activities"] }) {
  const located = activities.filter((a) => a.latitude != null && a.longitude != null);
  if (located.length === 0) {
    return <EmptyState icon={MapPin} title="No pinned places yet" message="No map locations have been shared for this trip." />;
  }
  return (
    <ul className="space-y-2">
      {located.map((activity) => {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.title)}@${activity.latitude},${activity.longitude}`;
        return (
          <li key={activity.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
            <div className="min-w-0">
              <p className="font-semibold">{activity.title}</p>
              <p className="truncate text-sm text-muted-foreground">
                {activity.location ?? `${activity.latitude?.toFixed(4)}, ${activity.longitude?.toFixed(4)}`}
              </p>
            </div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open map
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function PhotosTab({ media }: { media: SharedTripSnapshot["media"] }) {
  if (media.length === 0) {
    return <EmptyState icon={ImageIcon} title="No photos yet" message="Photos haven't been shared for this trip." />;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {media.map((photo) => (
        <figure key={photo.id} className="group relative aspect-square overflow-hidden rounded-2xl border bg-muted">
          {photo.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.url}
              alt={photo.caption ?? "Trip photo"}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-6" aria-hidden />
            </div>
          )}
          {photo.caption && (
            <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-2 text-xs text-white">
              {photo.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, title, message }: { icon: typeof CalendarDays; title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-10 text-center">
      <Icon className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
