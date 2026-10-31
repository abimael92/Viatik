import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logout } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell/app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, className }: { alt: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test stub
    <img alt={alt} className={className} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: { href: string; children: React.ReactNode; className?: string; [key: string]: unknown }) => (
    <a href={href} className={className} {...rest}>{children}</a>
  ),
}));

vi.mock("@/app/actions/auth", () => ({
  logout: vi.fn(async () => ({ success: true })),
}));

// Radix menus need pointer events jsdom does not provide; render their content
// inline so the account menu's items are assertable.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
}));

vi.mock("@/lib/db/dexie", () => ({
  deleteDatabase: vi.fn(async () => {}),
}));

vi.mock("@/lib/sync/use-sync-status", () => ({
  useSyncStatus: () => ({
    status: "idle",
    pending: 0,
    retryablePending: 0,
    lastSyncAt: null,
    lastError: null,
    isOnline: true,
    conflicts: 0,
  }),
  useSyncRetryCountdown: () => ({ countdown: null, retryNow: vi.fn() }),
}));

vi.mock("@/features/notifications/components/notification-center", () => ({
  NotificationBell: () => <button type="button" aria-label="Notifications" />,
}));

vi.mock("@/lib/sync/sync-engine", () => ({
  syncNow: vi.fn(async () => {}),
}));

vi.mock("@/lib/db/database-provider", () => ({
  useDatabase: () => ({ outboxMutations: { toArray: () => Promise.resolve([]) } }),
}));

vi.mock("dexie", async (importOriginal) => {
  const actual = await importOriginal<typeof import("dexie")>();
  return {
    ...actual,
    liveQuery: (querier: () => Promise<unknown>) => ({
      subscribe(observer: { next: (value: unknown) => void }) {
        void Promise.resolve(querier()).then((value) => observer.next(value));
        return { unsubscribe() {} };
      },
    }),
  };
});

// jsdom in this environment exposes no usable `localStorage`; shim an
// in-memory one so the toggle's unqualified `localStorage` calls work.
const store = new Map<string, string>();
const storage = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
};

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
});

function renderShell() {
  return render(
    <AppShell userId="user-1" userName="Ana" userEmail="ana@example.com">
      <div>content</div>
    </AppShell>
  );
}

afterEach(() => {
  cleanup();
  storage.clear();
  document.documentElement.removeAttribute("data-sidebar");
});

describe("AppShell sidebar", () => {
  it("renders the sidebar search pill without a shortcut kbd", () => {
    renderShell();
    const search = screen.getAllByRole("button", { name: "Search" })[0];
    expect(search).toBeTruthy();
    expect(search.querySelector("kbd")).toBeNull();
    expect(search.textContent).not.toContain("Ctrl");
  });

  it("collapses and expands via the toggle, syncing data-sidebar, localStorage, and aria", () => {
    renderShell();

    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("app-sidebar");
    expect(document.getElementById("app-sidebar")).toBeTruthy();

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.sidebar).toBe("collapsed");
    expect(storage.getItem("viatik-sidebar")).toBe("collapsed");
    expect(screen.getByRole("button", { name: "Expand sidebar" }).getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(document.documentElement.dataset.sidebar).toBeUndefined();
    expect(storage.getItem("viatik-sidebar")).toBe("expanded");
    expect(screen.getByRole("button", { name: "Collapse sidebar" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps an accessible name on every nav item for the collapsed rail", () => {
    renderShell();
    const nav = screen.getAllByRole("navigation", { name: "Main navigation" })[0];
    for (const link of Array.from(nav.querySelectorAll("a, button"))) {
      const name = link.getAttribute("aria-label") ?? link.textContent;
      expect(name?.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("AppShell navigation and account menu", () => {
  it("renders four live tabs on mobile instead of a disabled Community slot", () => {
    renderShell();
    const mobileNav = screen.getByRole("navigation", { name: "Main navigation (mobile)" });
    const tabs = Array.from(mobileNav.querySelectorAll("a"));

    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["Home", "Trips", "Contacts", "Settings"]);
    expect(mobileNav.querySelectorAll("button[disabled]")).toHaveLength(0);
    expect(mobileNav.querySelector(".grid-cols-4")).toBeTruthy();
  });

  it("keeps the coming-soon Community entry in the desktop sidebar only", () => {
    renderShell();
    const sidebarNav = screen.getAllByRole("navigation", { name: "Main navigation" })[0];
    const community = Array.from(sidebarNav.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("Community"),
    );

    expect(community?.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("navigation", { name: "Main navigation (mobile)" }).textContent).not.toContain("Community");
  });

  it("moves sign-out into the profile menu instead of a sidebar block", () => {
    renderShell();
    const sidebar = document.getElementById("app-sidebar");
    expect(sidebar).toBeTruthy();
    expect(sidebar!.querySelector('button[aria-label="Sign out"]')).toBeNull();

    const accountTrigger = screen.getAllByRole("button", { name: "Open account menu" })[0];
    expect(accountTrigger.closest("#app-sidebar")).toBeTruthy();

    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.some((item) => item.textContent?.includes("Account settings"))).toBe(true);
    expect(menuItems.some((item) => item.textContent?.includes("Sign out"))).toBe(true);
  });

  it("signs out from the account menu item", async () => {
    renderShell();
    const signOutItem = screen.getAllByRole("menuitem").find((item) => item.textContent?.includes("Sign out"));

    fireEvent.click(signOutItem!);
    await waitFor(() => expect(vi.mocked(logout)).toHaveBeenCalledTimes(1));
  });
});
