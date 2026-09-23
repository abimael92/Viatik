export const MAX_DAILY_STEPS = 200_000;

export interface DailyStepCount {
  id: string;
  tripId: string;
  userId: string;
  dayDate: string;
  steps: number;
  source: "automatic" | "manual";
  createdAt: string;
  updatedAt: string;
}

export interface DailyStepCountRepository {
  listByTrip(userId: string, tripId: string): Promise<DailyStepCount[]>;
  watchByTrip(
    userId: string,
    tripId: string,
    onChange: (records: DailyStepCount[]) => void
  ): () => void;
  upsert(input: {
    userId: string;
    tripId: string;
    dayDate: string;
    steps: number;
  }): Promise<DailyStepCount>;
  increment(input: {
    userId: string;
    tripId: string;
    dayDate: string;
    steps: number;
  }): Promise<DailyStepCount>;
}

export function validateStepCount(value: number): string | null {
  if (!Number.isInteger(value) || value < 0) return "Enter a whole number of steps.";
  if (value > MAX_DAILY_STEPS) return `Steps must be ${MAX_DAILY_STEPS.toLocaleString()} or fewer.`;
  return null;
}

export function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
