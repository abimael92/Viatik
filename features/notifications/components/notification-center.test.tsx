import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const markRead = vi.fn<(id: string) => Promise<void>>(async () => undefined);

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
      onChange([
        {
          id: "n-1",
          userId: "user-1",
          type: "friend_request",
          referenceId: "conn-1",
          isRead: false,
          message: "Ada wants to connect",
          createdAt: "2026-09-28T12:00:00.000Z",
        },
      ]);
      return () => undefined;
    },
    markRead: (id: string) => markRead(id),
    markAllRead: vi.fn(),
  },
}));

vi.mock("@/features/contacts/data/dexie-contact-repository", () => ({
  contactRepository: { watch: () => () => undefined },
}));

import { NotificationCenter } from "@/features/notifications/components/notification-center";

describe("NotificationCenter", () => {
  afterEach(() => {
    cleanup();
    markRead.mockClear();
  });

  it("sends friend request actions to the contact request inbox", () => {
    render(<NotificationCenter userId="user-1" />);

    const accept = screen.getByRole("link", { name: "Accept" });
    const decline = screen.getByRole("link", { name: "Decline" });
    expect(accept.getAttribute("href")).toBe("/contacts?view=requests");
    expect(decline.getAttribute("href")).toBe("/contacts?view=requests");

    fireEvent.click(accept);
    expect(markRead).toHaveBeenCalledWith("n-1");
  });
});
