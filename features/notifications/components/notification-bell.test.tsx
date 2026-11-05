import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/notifications/data/dexie-notification-repository", () => ({
  notificationRepository: {
    watch: (_userId: string, onChange: (items: unknown[]) => void) => {
      onChange([{ isRead: false, type: "trip_added", referenceId: "trip-1" }]);
      return () => undefined;
    },
  },
}));

vi.mock("@/features/contacts/data/dexie-contact-repository", () => ({
  contactRepository: {
    watch: (_userId: string, onChange: (items: unknown[]) => void) => {
      onChange([
        { connectionStatus: "pending", connectionDirection: "inbound", connectionId: "conn-9" },
        { connectionStatus: "accepted", connectionDirection: null, connectionId: "conn-1" },
      ]);
      return () => undefined;
    },
  },
}));

import { NotificationBell } from "@/features/notifications/components/notification-center";

describe("NotificationBell", () => {
  it("colors the bell and shows a count that includes a pending friend request", () => {
    render(<NotificationBell userId="user-1" />);

    const link = screen.getByRole("link", { name: "2 unread notifications" });
    expect(link.getAttribute("href")).toBe("/notifications");
    expect(link.className).toContain("text-viatik-magenta");
    expect(link.className).toContain("bg-viatik-magenta/20");
    expect(link.textContent).toContain("2");
  });

  it("shows only the unread count over the avatar without shrinking the hit target", () => {
    render(<NotificationBell userId="user-1" compact />);

    const link = screen.getByRole("link", { name: "2 unread notifications" });
    expect(link.className).toContain("size-11");
    expect(link.className).toContain("rounded-full");
    expect(link.querySelector("svg")).toBeNull();
    expect(screen.getByText("2").className).toContain("right-0");
    expect(screen.getByText("2").className).toContain("top-6");
    expect(screen.getByText("2").className).not.toContain("ring-2");
  });
});
