export const TRIP_COVER_GRADIENTS = [
  {
    id: "ocean",
    label: "Ocean",
    className: "bg-linear-to-br from-sky-500 via-blue-500 to-violet-600",
  },
  {
    id: "sunset",
    label: "Sunset",
    className: "bg-linear-to-br from-amber-400 via-rose-500 to-fuchsia-600",
  },
  {
    id: "aurora",
    label: "Aurora",
    className: "bg-linear-to-br from-emerald-400 via-cyan-500 to-indigo-600",
  },
  {
    id: "violet",
    label: "Violet",
    className: "bg-linear-to-br from-indigo-500 via-purple-500 to-pink-500",
  },
  {
    id: "ember",
    label: "Ember",
    className: "bg-linear-to-br from-orange-500 via-red-500 to-rose-700",
  },
  {
    id: "midnight",
    label: "Midnight",
    className: "bg-linear-to-br from-slate-700 via-indigo-900 to-slate-950",
  },
] as const;

export type TripCoverGradientId = (typeof TRIP_COVER_GRADIENTS)[number]["id"];

const PREFIX = "gradient:";

export function tripCoverGradientValue(id: TripCoverGradientId): string {
  return `${PREFIX}${id}`;
}

export function getTripCoverGradient(value?: string | null) {
  if (!value?.startsWith(PREFIX)) return undefined;
  const id = value.slice(PREFIX.length);
  return TRIP_COVER_GRADIENTS.find((gradient) => gradient.id === id);
}

export function isTripCoverImage(value?: string | null): value is string {
  return Boolean(value && !value.startsWith(PREFIX));
}
