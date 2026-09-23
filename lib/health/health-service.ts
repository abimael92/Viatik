import { Capacitor } from "@capacitor/core";

import type {
  DailyStepCount,
  DailyStepCountRepository,
} from "@/features/steps/domain/step-types";
import { isIsoDay, validateStepCount } from "@/features/steps/domain/step-types";
import { stepRepository } from "@/features/steps/data/dexie-step-repository";
import { healthConnectAdapter } from "@/lib/health/health-connect-adapter";
import { healthKitAdapter } from "@/lib/health/healthkit-adapter";

export type HealthPlatform = "ios" | "android" | "web";

export type HealthPermissionState = "authorized" | "denied" | "unavailable";

export interface HealthPermissionResult {
  platform: HealthPlatform;
  state: HealthPermissionState;
  readSteps: boolean;
}

/**
 * One already-normalized daily aggregate from a native health provider.
 * Provider adapters must aggregate native samples before returning this value;
 * raw health samples never cross this service boundary.
 */
export interface DailyHealthSteps {
  dayDate: string;
  steps: number;
}

export interface HealthProvider {
  readonly platform: HealthPlatform;
  requestPermissions(): Promise<HealthPermissionResult>;
  queryDailySteps(date: string): Promise<DailyHealthSteps>;
}

export interface SyncDailyStepsInput {
  userId: string;
  tripId: string;
  dates: string[];
}

const webProvider: HealthProvider = {
  platform: "web",
  async requestPermissions() {
    return { platform: "web", state: "unavailable", readSteps: false };
  },
  async queryDailySteps() {
    throw new Error("Automatic health steps are not supported on the web.");
  },
};

function platformProvider(): HealthProvider {
  switch (Capacitor.getPlatform()) {
    case "ios":
      return healthKitAdapter;
    case "android":
      return healthConnectAdapter;
    default:
      return webProvider;
  }
}

export class HealthService {
  private readonly provider: HealthProvider;
  private readonly repository: DailyStepCountRepository;

  constructor(provider?: HealthProvider, repository: DailyStepCountRepository = stepRepository) {
    this.provider = provider ?? platformProvider();
    this.repository = repository;
  }

  requestPermissions(): Promise<HealthPermissionResult> {
    return this.provider.requestPermissions();
  }

  async queryDailySteps(date: string): Promise<DailyHealthSteps> {
    if (!isIsoDay(date)) throw new Error("Enter a valid calendar day.");
    const result = await this.provider.queryDailySteps(date);
    if (result.dayDate !== date || !isIsoDay(result.dayDate)) {
      throw new Error("The health provider returned an invalid calendar day.");
    }
    const validationError = validateStepCount(result.steps);
    if (validationError) throw new Error(validationError);
    return result;
  }

  /**
   * Pulls normalized daily totals from the native provider and writes them to
   * the existing local repository. This method intentionally has no remote
   * sync path; Dexie remains the local source of truth.
   */
  async syncToDexie(input: SyncDailyStepsInput): Promise<DailyStepCount[]> {
    if (!input.userId || !input.tripId) throw new Error("A user and trip are required.");

    const dates = [...new Set(input.dates)];
    const dailySteps = await Promise.all(dates.map((date) => this.queryDailySteps(date)));
    return Promise.all(
      dailySteps.map(({ dayDate, steps }) =>
        this.repository.upsert({
          userId: input.userId,
          tripId: input.tripId,
          dayDate,
          steps,
        })
      )
    );
  }
}

export function createHealthService(
  provider?: HealthProvider,
  repository: DailyStepCountRepository = stepRepository
): HealthService {
  return new HealthService(provider, repository);
}
