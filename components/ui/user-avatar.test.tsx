import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_AVATAR_STYLE, parseAvatarSeed, randomAvatarSeed, UserAvatar } from "@/components/ui/user-avatar";

describe("parseAvatarSeed", () => {
  it("falls back to the default style and a stable seed", () => {
    expect(parseAvatarSeed(null)).toEqual({ style: DEFAULT_AVATAR_STYLE, seed: "viatik" });
    expect(parseAvatarSeed("")).toEqual({ style: DEFAULT_AVATAR_STYLE, seed: "viatik" });
    expect(parseAvatarSeed("plainseed")).toEqual({ style: DEFAULT_AVATAR_STYLE, seed: "plainseed" });
  });

  it("parses a style-prefixed seed", () => {
    expect(parseAvatarSeed("bottts|abc123")).toEqual({ style: "bottts", seed: "abc123" });
    expect(parseAvatarSeed("avataaars|xyz")).toEqual({ style: "avataaars", seed: "xyz" });
  });

  it("falls back to default style for an unknown style prefix, keeping the raw seed", () => {
    expect(parseAvatarSeed("notreal|abc")).toEqual({ style: DEFAULT_AVATAR_STYLE, seed: "notreal|abc" });
  });

  it("generates a randomizable seed scoped to a style", () => {
    const seed = randomAvatarSeed("adventurer");
    expect(parseAvatarSeed(seed).style).toBe("adventurer");
    expect(parseAvatarSeed(seed).seed.length).toBeGreaterThan(0);
  });
});

describe("UserAvatar", () => {
  it("renders an uploaded image when a src is provided", () => {
    const { container } = render(<UserAvatar seed="adventurer|x" src="https://example.com/a.png" name="Ada" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.com/a.png");
  });

  it("renders a DiceBear data URI from a seed when no image is provided", () => {
    const { container } = render(<UserAvatar seed="adventurer|ada" name="Ada" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  });

  it("shows initials as a last-resort fallback", () => {
    const { container } = render(<UserAvatar seed={null} src={null} name="Ada Lovelace" />);
    expect(container.textContent).toContain("AL");
    expect(screen.getByLabelText("Ada Lovelace")).toBeTruthy();
  });

  it("shows a presence badge when a status is provided", () => {
    const { container } = render(<UserAvatar seed="x" name="Ada" status="online" />);
    expect(container.querySelector("[aria-hidden]")).toBeTruthy();
  });
});
