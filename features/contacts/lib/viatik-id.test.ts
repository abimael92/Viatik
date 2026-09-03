import { describe, expect, it } from "vitest";

import { parseViatikId, viatikQrPayload } from "@/features/contacts/lib/viatik-id";

const id = "VTK-A1B2C3D4E5F60718";

describe("Viatik ID parsing", () => {
  it("accepts raw IDs and supported QR payloads", () => {
    expect(parseViatikId(id.toLowerCase())).toBe(id);
    expect(parseViatikId(`viatik://profile/${id}`)).toBe(id);
    expect(parseViatikId(`https://viatik.app/p/${id}?source=qr`)).toBe(id);
  });

  it("accepts profile UUIDs", () => {
    expect(parseViatikId("0193f6a2-5c80-4d1a-8f47-81b5e667f72a")).toBe("0193f6a2-5c80-4d1a-8f47-81b5e667f72a");
  });

  it("rejects untrusted or malformed payloads", () => {
    expect(parseViatikId(`https://example.com/p/${id}`)).toBeNull();
    expect(parseViatikId("not-an-id")).toBeNull();
    expect(parseViatikId("<script>alert(1)</script>")).toBeNull();
  });

  it("creates a scanner-safe payload", () => {
    expect(viatikQrPayload(id)).toBe(`viatik://profile/${id}`);
  });
});
