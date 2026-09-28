import { z } from "zod";

import type { TranslationKey } from "@/lib/i18n/translations";

export const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const COVER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_NAME_MIN = 2;
export const PROFILE_NAME_MAX = 60;
export const TRIP_NAME_MIN = 2;
export const TRIP_NAME_MAX = 80;
export const CONTACT_NAME_MIN = 2;
export const CONTACT_NAME_MAX = 100;
export const ADULT_COUNT_MIN = 1;
export const ADULT_COUNT_MAX = 99;
export const CHILD_COUNT_MIN = 0;
export const CHILD_COUNT_MAX = 99;
export const NOTE_MAX_LENGTH = 280;
export const TASK_TITLE_MAX_LENGTH = 120;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ValidationIssue = {
  key: TranslationKey;
  variables?: Record<string, string | number>;
};

function readIssue(
  schema: z.ZodType,
  value: unknown,
  variables?: Record<string, string | number>,
): ValidationIssue | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return null;
  return { key: parsed.error.issues[0]?.message as TranslationKey, variables };
}

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** 7–15 digits. Empty input is a missing phone, not a malformed one. */
export const phoneSchema = z
  .string()
  .trim()
  .superRefine((value, context) => {
    const digits = phoneDigits(value);
    if (!digits) {
      context.addIssue({ code: "custom", message: "errors.enterPhone" });
      return;
    }
    if (digits.length < 7 || digits.length > 15) {
      context.addIssue({ code: "custom", message: "errors.validPhone" });
    }
  });

export type PhoneNumber = z.infer<typeof phoneSchema>;

export function validatePhone(value: string): ValidationIssue | null {
  return readIssue(phoneSchema, value);
}

export const profileNameSchema = z
  .string()
  .trim()
  .min(PROFILE_NAME_MIN, { error: "errors.nameRange" })
  .max(PROFILE_NAME_MAX, { error: "errors.nameRange" });

export type ProfileName = z.infer<typeof profileNameSchema>;

export const displayNameSchema = z
  .string()
  .trim()
  .min(PROFILE_NAME_MIN, { error: "errors.displayNameRange" })
  .max(PROFILE_NAME_MAX, { error: "errors.displayNameRange" });

export type DisplayName = z.infer<typeof displayNameSchema>;

export const tripNameSchema = z
  .string()
  .trim()
  .min(TRIP_NAME_MIN, { error: "errors.nameMin" })
  .max(TRIP_NAME_MAX, { error: "errors.nameMax" });

export type TripName = z.infer<typeof tripNameSchema>;

export const contactNameSchema = z
  .string()
  .trim()
  .min(CONTACT_NAME_MIN, { error: "errors.nameMin" })
  .max(CONTACT_NAME_MAX, { error: "errors.nameMax" });

export type ContactName = z.infer<typeof contactNameSchema>;

export function validateProfileName(value: string): ValidationIssue | null {
  return readIssue(profileNameSchema, value);
}

export function validateDisplayName(value: string): ValidationIssue | null {
  return readIssue(displayNameSchema, value);
}

export function validateTripName(value: string): ValidationIssue | null {
  return readIssue(tripNameSchema, value, { min: TRIP_NAME_MIN, max: TRIP_NAME_MAX });
}

export function validateContactName(value: string): ValidationIssue | null {
  return readIssue(contactNameSchema, value, { min: CONTACT_NAME_MIN, max: CONTACT_NAME_MAX });
}

export function validateOnboardingName(value: string): ValidationIssue | null {
  return readIssue(
    z.string().trim().min(PROFILE_NAME_MIN, { error: "errors.nameMin" }).max(PROFILE_NAME_MAX, { error: "errors.nameMax" }),
    value,
    { min: PROFILE_NAME_MIN, max: PROFILE_NAME_MAX },
  );
}

export function validateMaxText(value: string, max: number): ValidationIssue | null {
  return readIssue(z.string().trim().max(max, { error: "errors.nameMax" }), value, { max });
}

export function imageFileSchema(maxBytes: number, sizeKey: TranslationKey = "errors.imageSizeExceeded") {
  return z
    .object({
      size: z.number().nonnegative(),
      type: z.string(),
    })
    .superRefine((file, context) => {
      if (file.size > maxBytes) {
        context.addIssue({ code: "custom", message: sizeKey });
        return;
      }
      if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
        context.addIssue({ code: "custom", message: "errors.imageInvalidType" });
      }
    });
}

export type ImageFileInput = z.infer<ReturnType<typeof imageFileSchema>>;

export function validateImageFile(
  file: { size: number; type: string } | null | undefined,
  options: { maxBytes: number; required?: boolean; sizeKey?: TranslationKey },
): ValidationIssue | null {
  if (!file) return options.required ? { key: "errors.imageRequired" } : null;
  const megabytes = Math.round(options.maxBytes / (1024 * 1024));
  return readIssue(imageFileSchema(options.maxBytes, options.sizeKey), file, { megabytes });
}

export const positiveAmountSchema = z.string().trim().refine((value) => {
  const amount = Number(value.replace(/,/g, ""));
  return value.length > 0 && Number.isFinite(amount) && amount > 0;
}, { error: "errors.positiveAmount" });

export type PositiveAmount = z.infer<typeof positiveAmountSchema>;

export function validatePositiveAmount(value: string): ValidationIssue | null {
  return readIssue(positiveAmountSchema, value);
}

export function wholeCountSchema(min: number, max: number) {
  return z
    .number()
    .int({ error: "errors.wholeNumberRange" })
    .min(min, { error: "errors.wholeNumberRange" })
    .max(max, { error: "errors.wholeNumberRange" });
}

export function validateWholeCount(value: number, min: number, max: number): ValidationIssue | null {
  return readIssue(wholeCountSchema(min, max), value, { min, max });
}

export const noteSchema = z
  .string()
  .trim()
  .min(1, { error: "errors.noteRequired" })
  .max(NOTE_MAX_LENGTH, { error: "errors.noteTooLong" });

export type NoteContent = z.infer<typeof noteSchema>;

export function validateNote(value: string): ValidationIssue | null {
  return readIssue(noteSchema, value, { max: NOTE_MAX_LENGTH });
}

export const taskTitleSchema = z
  .string()
  .trim()
  .min(1, { error: "errors.taskTitleRequired" })
  .max(TASK_TITLE_MAX_LENGTH, { error: "errors.taskTitleTooLong" });

export type TaskTitle = z.infer<typeof taskTitleSchema>;

export function validateTaskTitle(value: string): ValidationIssue | null {
  return readIssue(taskTitleSchema, value, { max: TASK_TITLE_MAX_LENGTH });
}

export const resolutionSchema = z.string().trim().min(1, { error: "errors.resolutionRequired" });

export type ResolutionText = z.infer<typeof resolutionSchema>;

export function validateResolution(value: string): ValidationIssue | null {
  return readIssue(resolutionSchema, value);
}
