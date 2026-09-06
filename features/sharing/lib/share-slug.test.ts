import { describe, expect, it } from "vitest";

import { generateShareSlug, isValidShareSlug } from "@/features/sharing/lib/share-slug";

describe("generateShareSlug", () => {
  it("produces a URL-safe slug of the requested length", () => {
    const slug = generateShareSlug();
    expect(slug).toMatch(/^[A-Za-z0-9]{12}$/);
  });

  it("produces distinct slugs", () => {
    const slugs = new Set(Array.from({ length: 50 }, () => generateShareSlug()));
    expect(slugs.size).toBe(50);
  });
});

describe("isValidShareSlug", () => {
  it("accepts generated slugs and rejects malformed input", () => {
    expect(isValidShareSlug(generateShareSlug())).toBe(true);
    expect(isValidShareSlug("abc")).toBe(false);
    expect(isValidShareSlug("a".repeat(40))).toBe(false);
    expect(isValidShareSlug("has spaces")).toBe(false);
    expect(isValidShareSlug(null)).toBe(false);
    expect(isValidShareSlug(undefined)).toBe(false);
  });
});
