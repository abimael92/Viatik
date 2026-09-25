import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  ActivityAttachmentsEditor,
  ActivityAttachmentsSection,
} from "@/features/activities/components/activity-attachments";
import type { ActivityAttachment } from "@/features/domain/entities";

const { retry } = vi.hoisted(() => ({ retry: vi.fn() }));

vi.mock("@/features/media/data/dexie-media-repository", () => ({
  mediaRepository: {
    watchByIds: (ids: string[], onChange: (media: unknown[]) => void) => {
      onChange(
        ids.includes("media-fail")
          ? [{ id: "media-fail", uploadStatus: "failed" }]
          : [],
      );
      return () => undefined;
    },
    retry,
  },
}));

vi.mock("@/lib/sync/use-sync-status", () => ({
  useSyncStatus: () => ({ isOnline: false }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: PropsWithChildren) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
  DropdownMenuContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: PropsWithChildren<{ onSelect?: () => void }>) => (
    <button type="button" role="menuitem" onClick={onSelect}>{children}</button>
  ),
}));

vi.mock("@/app/actions/places", () => ({
  searchActivityPlaces: vi.fn().mockResolvedValue({ suggestions: [], configured: true }),
  getPlaceDetails: vi.fn(),
}));

const attachments: ActivityAttachment[] = [
  {
    id: "link-1",
    kind: "link",
    url: "https://example.com/menu",
    title: "Dinner menu",
    description: null,
    siteName: "Example",
    previewImageMediaId: null,
  },
  {
    id: "pin-1",
    kind: "location",
    name: "Prado",
    formattedAddress: "Madrid",
    latitude: 40.4,
    longitude: -3.7,
    placeId: "place-1",
  },
];

describe("ActivityAttachmentsSection", () => {
  it("renders compact link and pin actions and omits empty state", () => {
    const { rerender } = render(<ActivityAttachmentsSection attachments={[]} />);
    expect(screen.queryByText("Attachments")).toBeNull();

    rerender(<ActivityAttachmentsSection attachments={attachments} />);
    const link = screen.getByRole("link", { name: "Open Dinner menu" });
    expect(link.getAttribute("href")).toBe("https://example.com/menu");
    expect(link.getAttribute("rel")).toBe("noreferrer");
    const maps = screen.getByRole("link", { name: "Open Prado in maps" });
    expect(maps.getAttribute("href")).toContain("query_place_id=place-1");
    expect(screen.getByLabelText("Activity attachments")).toBeTruthy();
  });
});

describe("ActivityAttachmentsEditor", () => {
  it("adds a validated link and exposes disclosure attributes", () => {
    const onChange = vi.fn();
    render(<ActivityAttachmentsEditor attachments={[]} pendingImages={[]} onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "Attachments" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(trigger.getAttribute("aria-controls")!)?.getAttribute("role")).toBe("region");

    fireEvent.click(screen.getByRole("menuitem", { name: "Link" }));
    fireEvent.change(screen.getByLabelText("Link URL"), { target: { value: "https://example.com/menu" } });
    fireEvent.change(screen.getByLabelText("Link title"), { target: { value: "Dinner menu" } });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));

    expect(onChange).toHaveBeenCalledWith(
      [expect.objectContaining({ kind: "link", title: "Dinner menu", url: "https://example.com/menu" })],
      [],
    );
  });

  it("keeps the location pin search after choosing it from the add menu", () => {
    render(<ActivityAttachmentsEditor attachments={[]} pendingImages={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Attachments" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Location pin" }));
    expect(screen.getByLabelText("Search for a place")).toBeTruthy();
  });

  it("rejects an invalid url", () => {
    render(<ActivityAttachmentsEditor attachments={[]} pendingImages={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Attachments" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Link" }));
    fireEvent.change(screen.getByLabelText("Link URL"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    expect(screen.getByRole("alert").textContent).toMatch(/valid http/i);
  });

  it("keeps unsaved photos local until the activity is saved", () => {
    render(
      <ActivityAttachmentsEditor
        attachments={[
          {
            id: "img-1",
            kind: "image",
            mediaId: "media-local",
            caption: null,
            altText: null,
          },
        ]}
        pendingImages={[{ id: "media-local", blob: new Blob(["photo"], { type: "image/jpeg" }), caption: null }]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("status").textContent).toMatch(/save when you save the activity/i);
    expect(screen.getByRole("status").textContent).not.toMatch(/uploading/i);
  });

  it("renders attachments as gallery cards without reorder controls", () => {
    render(
      <ActivityAttachmentsEditor
        attachments={attachments}
        pendingImages={[]}
        onChange={vi.fn()}
      />,
    );

    const gallery = screen.getByLabelText("Activity attachments");
    expect(gallery.className).toMatch(/grid/);
    expect(screen.queryByRole("button", { name: /Move attachment/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Dinner menu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Prado" })).toBeTruthy();
  });

  it("exposes a polite live region and retry for failed uploads", () => {
    render(
      <ActivityAttachmentsEditor
        attachments={[
          {
            id: "img-1",
            kind: "image",
            mediaId: "media-fail",
            caption: "Menu photo",
            altText: null,
          },
        ]}
        pendingImages={[]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("status").textContent).toMatch(/could not be uploaded/i);
    fireEvent.click(screen.getByRole("button", { name: "Retry upload" }));
    expect(retry).toHaveBeenCalledWith("media-fail");
  });
});
