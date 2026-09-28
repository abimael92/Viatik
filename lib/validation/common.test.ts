import { describe, expect, it } from "vitest";

import {
  contactNameSchema,
  phoneSchema,
  positiveAmountSchema,
  profileNameSchema,
  tripNameSchema,
  validateImageFile,
  validateNote,
  validatePhone,
  validatePositiveAmount,
  validateTaskTitle,
  validateTripName,
  validateWholeCount,
  COVER_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_MAX_BYTES,
} from "@/lib/validation/common";

describe("shared form validation", () => {
  it("accepts 7 to 15 phone digits and rejects anything outside that", () => {
    expect(phoneSchema.safeParse("555-0100").success).toBe(true);
    expect(phoneSchema.safeParse("+1 (555) 010-0199").success).toBe(true);
    expect(validatePhone("")).toEqual({ key: "errors.enterPhone" });
    expect(validatePhone("123456")).toEqual({ key: "errors.validPhone" });
    expect(validatePhone("1".repeat(16))).toEqual({ key: "errors.validPhone" });
  });

  it("checks profile, trip, and contact names against their own limits", () => {
    expect(profileNameSchema.safeParse("  Ada  ").success).toBe(true);
    expect(profileNameSchema.safeParse("A").success).toBe(false);
    expect(tripNameSchema.safeParse("A".repeat(80)).success).toBe(true);
    expect(validateTripName("A".repeat(81))).toMatchObject({ key: "errors.nameMax", variables: { max: 80 } });
    expect(contactNameSchema.safeParse("A".repeat(100)).success).toBe(true);
    expect(contactNameSchema.safeParse("A".repeat(101)).success).toBe(false);
    expect(tripNameSchema.safeParse("A").error?.issues[0]?.message).toBe("errors.nameMin");
  });

  it("limits profile photos to 2 MB and covers to 5 MB, and allows only jpeg, png, and webp", () => {
    expect(validateImageFile(null, { maxBytes: PROFILE_IMAGE_MAX_BYTES })).toBeNull();
    expect(validateImageFile(null, { maxBytes: PROFILE_IMAGE_MAX_BYTES, required: true })).toEqual({
      key: "errors.imageRequired",
    });
    expect(
      validateImageFile({ size: PROFILE_IMAGE_MAX_BYTES + 1, type: "image/png" }, { maxBytes: PROFILE_IMAGE_MAX_BYTES, sizeKey: "errors.imageTooLarge" }),
    ).toMatchObject({ key: "errors.imageTooLarge" });
    expect(
      validateImageFile({ size: COVER_IMAGE_MAX_BYTES + 1, type: "image/jpeg" }, { maxBytes: COVER_IMAGE_MAX_BYTES }),
    ).toMatchObject({ key: "errors.imageSizeExceeded", variables: { megabytes: 5 } });
    expect(validateImageFile({ size: 10, type: "image/gif" }, { maxBytes: COVER_IMAGE_MAX_BYTES })).toEqual({
      key: "errors.imageInvalidType",
      variables: { megabytes: 5 },
    });
  });

  it("requires a positive amount and a whole count inside the given range", () => {
    expect(positiveAmountSchema.safeParse("12.50").success).toBe(true);
    expect(validatePositiveAmount("0")).toEqual({ key: "errors.positiveAmount" });
    expect(validatePositiveAmount("nope")).toEqual({ key: "errors.positiveAmount" });
    expect(validateWholeCount(1, 1, 99)).toBeNull();
    expect(validateWholeCount(0, 1, 99)).toMatchObject({ key: "errors.wholeNumberRange", variables: { min: 1, max: 99 } });
    expect(validateWholeCount(0, 0, 99)).toBeNull();
    expect(validateWholeCount(1.5, 0, 99)?.key).toBe("errors.wholeNumberRange");
  });

  it("checks note and task text before a write", () => {
    expect(validateNote("  ")).toEqual({ key: "errors.noteRequired", variables: { max: 280 } });
    expect(validateNote("a".repeat(281))?.key).toBe("errors.noteTooLong");
    expect(validateTaskTitle("")?.key).toBe("errors.taskTitleRequired");
    expect(validateTaskTitle("a".repeat(121))?.key).toBe("errors.taskTitleTooLong");
  });
});
