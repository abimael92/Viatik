import type { Activity, Trip } from "@/features/domain/entities";
import type { TripCloneSource } from "@/features/community/lib/duplicate-trip";

/**
 * A browsable public itinerary template shown in the Community hub. `source`
 * carries the Trip + activities that `buildTripClone`/`persistTripClone`
 * duplicate into the current user's account.
 */
export interface PublicTripTemplate {
  id: string;
  name: string;
  description: string;
  destination: string;
  authorName: string;
  likesCount: number;
  forkCount: number;
  gradient: string;
  baseCurrency: string;
  tags: string[];
  /** Sum of activity estimated costs + a small buffer, shown as a template budget. */
  budgetMinor: bigint;
  source: TripCloneSource;
}

interface TemplateActivity {
  time?: string;
  title: string;
  location?: string;
  category: string;
}

interface TemplateDay {
  title: string;
  activities: TemplateActivity[];
}

interface TemplateSpec {
  id: string;
  name: string;
  description: string;
  destination: string;
  authorName: string;
  likes: number;
  forks: number;
  gradient: string;
  baseCurrency: string;
  timeZone: string;
  tags: string[];
  startDate: string; // yyyy-mm-dd
  durationDays: number;
  days: TemplateDay[];
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function buildSource(spec: TemplateSpec): TripCloneSource {
  const author = `${spec.id}-author`;
  const trip: Trip = {
    id: `${spec.id}-trip`,
    ownerId: author,
    name: spec.name,
    description: spec.description,
    destination: spec.destination,
    latitude: null,
    longitude: null,
    placeId: null,
    timeZone: spec.timeZone,
    startDate: spec.startDate,
    endDate: addDays(spec.startDate, spec.durationDays - 1),
    status: "planned",
    startedAt: null,
    completedAt: null,
    coverImageUrl: null,
    adultCount: 2,
    childCount: 0,
    baseCurrency: spec.baseCurrency,
    isPublic: true,
    shareSlug: `${spec.id}-template`,
    likesCount: spec.likes,
    forkCount: spec.forks,
    authorName: spec.authorName,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };

  const activities: Activity[] = [];
  let counter = 1;
  spec.days.forEach((day, dayIndex) => {
    day.activities.forEach((activity) => {
      const dayDate = addDays(spec.startDate, dayIndex);
      activities.push({
        id: `${spec.id}-act-${counter++}`,
        tripId: trip.id,
        dayDate,
        title: activity.title,
        description: null,
        location: activity.location ?? null,
        category: activity.category,
        startTime: activity.time ? `${dayDate}T${activity.time}:00` : null,
        endTime: null,
        position: counter * 1024,
        estimatedCostMinor: 0n,
        createdBy: author,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
      });
    });
  });

  return { trip, activities, expenses: [], shares: [] };
}

const SPECS: TemplateSpec[] = [
  {
    id: "kyoto-spring",
    name: "Kyoto in Spring",
    description: "Temples, markets and cherry blossoms across five unhurried days.",
    destination: "Kyoto, Japan",
    authorName: "Mika Sato",
    likes: 1284,
    forks: 412,
    gradient: "bg-linear-to-br from-pink-400 via-rose-500 to-red-600",
    baseCurrency: "USD",
    timeZone: "Asia/Tokyo",
    tags: ["culture", "food", "slow-travel"],
    startDate: "2026-04-05",
    durationDays: 5,
    days: [
      {
        title: "Arrival & Old Town",
        activities: [
          { time: "14:00", title: "Check in near Gion", category: "logistics" },
          { time: "16:00", title: "Wander Pontocho Alley", location: "Pontocho", category: "sightseeing" },
          { time: "19:00", title: "Kaiseki dinner tasting", location: "Gion", category: "food" },
        ],
      },
      {
        title: "Fushimi Inari",
        activities: [
          { time: "08:00", title: "Hike Fushimi Inari gates", location: "Fushimi Inari", category: "outdoors" },
          { time: "12:00", title: "Street food at Nishiki Market", location: "Nishiki", category: "food" },
          { time: "15:00", title: "Kiyomizu-dera temple", location: "Higashiyama", category: "culture" },
        ],
      },
      {
        title: "Bamboo Forest",
        activities: [
          { time: "09:00", title: "Arashiyama Bamboo Grove", location: "Arashiyama", category: "outdoors" },
          { time: "11:30", title: "Tenryu-ji temple gardens", category: "culture" },
          { time: "17:00", title: "Monkey Park Iwatayama", location: "Arashiyama", category: "outdoors" },
        ],
      },
    ],
  },
  {
    id: "lisbon-citybreak",
    name: "Lisbon City Break",
    description: "Tram rides, pastéis de nata and sunset miradouros over a long weekend.",
    destination: "Lisbon, Portugal",
    authorName: "João Costa",
    likes: 976,
    forks: 355,
    gradient: "bg-linear-to-br from-amber-400 via-orange-500 to-rose-600",
    baseCurrency: "EUR",
    timeZone: "Europe/Lisbon",
    tags: ["city", "food", "weekend"],
    startDate: "2026-05-18",
    durationDays: 3,
    days: [
      {
        title: "Old Lisbon",
        activities: [
          { time: "10:00", title: "Alfama walking tour", location: "Alfama", category: "sightseeing" },
          { time: "13:30", title: "Pastéis de nata at Pastéis de Belém", location: "Belém", category: "food" },
          { time: "18:30", title: "Sunset at Miradouro da Senhora do Monte", category: "sightseeing" },
        ],
      },
      {
        title: "Belém & Tram 28",
        activities: [
          { time: "09:30", title: "Ride historic Tram 28", category: "sightseeing" },
          { time: "11:00", title: "Jerónimos Monastery", location: "Belém", category: "culture" },
          { time: "16:00", title: "Sintra day-trip option", location: "Sintra", category: "outdoors" },
        ],
      },
    ],
  },
  {
    id: "patagonia-trek",
    name: "Patagonia Trek",
    description: "Torres del Paine base circuit — a self-guided trekking template.",
    destination: "Torres del Paine, Chile",
    authorName: "Carla Fuentes",
    likes: 2108,
    forks: 867,
    gradient: "bg-linear-to-br from-emerald-400 via-teal-500 to-sky-600",
    baseCurrency: "USD",
    timeZone: "America/Punta_Arenas",
    tags: ["adventure", "outdoors", "trekking"],
    startDate: "2026-11-02",
    durationDays: 6,
    days: [
      {
        title: "Base & Refugio",
        activities: [
          { time: "09:00", title: "Transfer to park entrance", category: "logistics" },
          { time: "12:00", title: "Hike to Base Torres viewpoint", category: "outdoors" },
          { time: "19:00", title: "Dinner at Refugio Central", category: "food" },
        ],
      },
      {
        title: "French Valley",
        activities: [
          { time: "07:30", title: "French Valley traverse", category: "outdoors" },
          { time: "13:00", title: "Picnic at Camping Francés", category: "food" },
          { time: "17:00", title: "Evening glacier viewpoint", category: "outdoors" },
        ],
      },
      {
        title: "Glacier Grey",
        activities: [
          { time: "08:00", title: "Glacier Grey trek", category: "outdoors" },
          { time: "15:00", title: "Iceberg boat excursion", category: "adventure" },
        ],
      },
    ],
  },
  {
    id: "tokyo-food-trip",
    name: "Tokyo Food Trip",
    description: "Izakayas, tsukemen and depachika — a gourmet-focused city template.",
    destination: "Tokyo, Japan",
    authorName: "Kenji Watanabe",
    likes: 1543,
    forks: 512,
    gradient: "bg-linear-to-br from-fuchsia-500 via-purple-500 to-indigo-600",
    baseCurrency: "USD",
    timeZone: "Asia/Tokyo",
    tags: ["food", "city", "nightlife"],
    startDate: "2026-06-12",
    durationDays: 4,
    days: [
      {
        title: "Shibuya & Shinjuku",
        activities: [
          { time: "11:00", title: "Tsukemen at Rokurinsha", location: "Tokyo Station", category: "food" },
          { time: "15:00", title: "Shibuya Crossing & Hachiko", location: "Shibuya", category: "sightseeing" },
          { time: "20:00", title: "Izakaya hopping in Omoide Yokocho", location: "Shinjuku", category: "nightlife" },
        ],
      },
      {
        title: "Tsukiji & Ginza",
        activities: [
          { time: "06:30", title: "Tsukiji outer market breakfast", location: "Tsukiji", category: "food" },
          { time: "10:00", title: "Ginza depachika food halls", location: "Ginza", category: "food" },
          { time: "18:30", title: "Sushi omakase dinner", location: "Ginza", category: "food" },
        ],
      },
    ],
  },
];

export const publicTemplates: PublicTripTemplate[] = SPECS.map((spec) => {
  const source = buildSource(spec);
  const budgetMinor = BigInt(
    Math.max(1, source.activities.length * 8500)
  );
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    destination: spec.destination,
    authorName: spec.authorName,
    likesCount: spec.likes,
    forkCount: spec.forks,
    gradient: spec.gradient,
    baseCurrency: spec.baseCurrency,
    tags: spec.tags,
    budgetMinor,
    source,
  };
});

export function getPublicTemplate(id: string): PublicTripTemplate | undefined {
  return publicTemplates.find((template) => template.id === id);
}

export const communityCategories = [
  "All",
  "city",
  "culture",
  "food",
  "adventure",
  "outdoors",
  "weekend",
  "nightlife",
] as const;
