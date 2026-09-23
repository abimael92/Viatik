import { HealthFitness } from "@capacitor/health-fitness";

import type {
  DailyHealthSteps,
  HealthPermissionResult,
  HealthProvider,
} from "@/lib/health/health-service";
import { isIsoDay, validateStepCount } from "@/features/steps/domain/step-types";

/**
 * Android Health Connect provider backed by Capacitor's unified health plugin.
 * The adapter returns only a validated daily aggregate; Dexie remains the
 * local source of truth and stores the result as an automatic step count.
 */
export class HealthConnectAdapter implements HealthProvider {
  readonly platform = "android" as const;

  async requestPermissions(): Promise<HealthPermissionResult> {
    try {
      await HealthFitness.requestHealthPermissions({
        customPermissions: JSON.stringify([{ Variable: "STEPS", AccessType: "READ" }]),
        allVariables: JSON.stringify({ IsActive: false, AccessType: "READ" }),
        fitnessVariables: JSON.stringify({ IsActive: false, AccessType: "READ" }),
        healthVariables: JSON.stringify({ IsActive: false, AccessType: "READ" }),
        profileVariables: JSON.stringify({ IsActive: false, AccessType: "READ" }),
        workoutVariables: JSON.stringify({ IsActive: false, AccessType: "READ" }),
      });
      return { platform: "android", state: "authorized", readSteps: true };
    } catch {
      return { platform: "android", state: "denied", readSteps: false };
    }
  }

  async queryDailySteps(date: string | Date): Promise<DailyHealthSteps> {
    const dayDate = typeof date === "string" ? date : localDayFromDate(date);
    if (!isIsoDay(dayDate)) throw new Error("Enter a valid calendar day.");

    const start = localDateAtMidnight(dayDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const { results } = await HealthFitness.getData({
      parameters: JSON.stringify({
        Variable: "STEPS",
        StartDate: pluginDate(start),
        EndDate: pluginDate(end),
        TimeUnit: "DAY",
        OperationType: "SUM",
        TimeUnitLength: 1,
        AdvancedQueryReturnType: "ALL_DATA",
        AdvancedQueryResultType: "RAW_DATA",
      }),
    });

    const steps = sumStepResults(results);
    const validationError = validateStepCount(steps);
    if (validationError) throw new Error(validationError);
    return { dayDate, steps };
  }
}

export const healthConnectAdapter = new HealthConnectAdapter();

function sumStepResults(encodedResults?: string): number {
  if (!encodedResults) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(encodedResults);
  } catch {
    throw new Error("Health Connect returned an invalid steps response.");
  }

  const records = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.data)
      ? parsed.data
      : isRecord(parsed) && Array.isArray(parsed.results)
        ? parsed.results
        : [parsed];
  const total = records.reduce((sum, record) => {
    if (!isRecord(record)) return sum;
    const value = record.Value ?? record.value ?? record.Total ?? record.total ?? record.Sum ?? record.sum;
    return typeof value === "number" && Number.isFinite(value) ? sum + value : sum;
  }, 0);
  return Math.round(total);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function localDateAtMidnight(dayDate: string): Date {
  const [year, month, day] = dayDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function localDayFromDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function pluginDate(date: Date): string {
  return `${date.toISOString().split(".")[0]}Z`;
}
