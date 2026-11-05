import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logout } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell/app-shell";
import { openCommandPalette } from "@/components/pro/command-palette";

const mocks = vi.hoisted(() => ({
  logout: vi.fn(async () => ({ success: true })),
  deleteDatabase: vi.fn(async () => {}),
  toast: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
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
  logout: mocks.logout,
}));

vi.mock("@/components/pro/command-palette", () => ({
  openCommandPalette: vi.fn(),
}));

// Radix menus need pointer events jsdom does not provide; render their content
// inline so the account menu's items are assertable.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <button type="button" role="menuitem" className={className}>{children}</button>
  ),
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuRadioGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuRadioItem: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <button type="button" role="menuitemradio" aria-checked={false} className={className}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect} className={className}>
      {children}
    </button>
  ),
}));

vi.mock("@/lib/db/dexie", () => ({
  deleteDatabase: mocks.deleteDatabase,
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
  // Sign-out is reachable from two places, so both tests assert an exact call
  // count — clear recorded calls (implementations stay intact).
  vi.clearAllMocks();
  mocks.logout.mockResolvedValue({ success: true });
  mocks.deleteDatabase.mockResolvedValue(undefined);
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
  document.documentElement.removeAttribute("data-theme");
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
    expect(toggle.closest(".sidebar-brand-row")).toBeTruthy();
    expect(document.getElementById("app-sidebar")).toBeTruthy();

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.sidebar).toBe("collapsed");
    expect(storage.getItem("viatik-sidebar")).toBe("collapsed");
    const expandToggle = screen.getByRole("button", { name: "Expand sidebar" });
    expect(expandToggle.getAttribute("aria-expanded")).toBe("false");
    expect(expandToggle.closest(".sidebar-brand-row")).toBeTruthy();
    expect(expandToggle.classList.contains("sidebar-toggle-btn")).toBe(true);
    expect(expandToggle.classList.contains("size-11")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(document.documentElement.dataset.sidebar).toBeUndefined();
    expect(storage.getItem("viatik-sidebar")).toBe("expanded");
    expect(screen.getByRole("button", { name: "Collapse sidebar" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("moves collapsed theme, language, and search access into the account menu", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    const sidebar = document.getElementById("app-sidebar")!;
    expect(sidebar.querySelector(".theme-toggle")?.classList.contains("sidebar-expanded-only")).toBe(true);
    const sidebarSearch = sidebar.querySelector<HTMLButtonElement>('button[aria-label="Search"]');
    expect(sidebarSearch?.closest(".sidebar-expanded-only")).toBeTruthy();

    expect(screen.getByRole("menuitem", { name: "View options" }).classList.contains("min-h-11")).toBe(true);
    expect(screen.getByRole("menuitem", { name: "Toggle theme" }).classList.contains("min-h-11")).toBe(true);
    expect(screen.getByRole("menuitemradio", { name: "EN" }).classList.contains("min-h-11")).toBe(true);
    expect(screen.getByRole("menuitemradio", { name: "ES" }).classList.contains("min-h-11")).toBe(true);
    expect(screen.getByRole("menuitem", { name: "Search commands" }).classList.contains("min-h-11")).toBe(true);

    document.documentElement.setAttribute("data-theme", "light");
    fireEvent.click(screen.getByRole("menuitem", { name: "Toggle theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.click(screen.getByRole("menuitem", { name: "Search commands" }));
    expect(vi.mocked(openCommandPalette)).toHaveBeenCalledTimes(1);
  });

  it("keeps an accessible name on every nav item for the collapsed rail", () => {
    renderShell();
    const nav = screen.getAllByRole("navigation", { name: "Main navigation" })[0];
    for (const link of Array.from(nav.querySelectorAll("a, button"))) {
      const name = link.getAttribute("aria-label") ?? link.textContent;
      expect(name?.trim().length).toBeGreaterThan(0);
    }
  });

  it("groups the collapsed account, notifications, and sync controls together", async () => {
    renderShell();
    const cluster = screen.getByRole("group", { name: "Account, notifications, and sync" });
    expect(cluster.classList.contains("relative")).toBe(true);
    expect(cluster.classList.contains("w-14")).toBe(true);
    expect(cluster.classList.contains("h-28")).toBe(true);
    expect(cluster.classList.contains("border")).toBe(false);
    expect(cluster.classList.contains("bg-side-hover/25")).toBe(false);

    const accountButton = within(cluster).getByRole("button", { name: "Open account menu" });
    expect(accountButton.classList.contains("justify-center")).toBe(true);
    expect(accountButton.parentElement?.classList.contains("z-10")).toBe(true);
    const notificationButton = within(cluster).getByRole("button", { name: "Notifications" });
    expect(notificationButton.parentElement?.classList.contains("absolute")).toBe(true);
    expect(notificationButton.parentElement?.classList.contains("top-2")).toBe(true);
    expect(notificationButton.parentElement?.classList.contains("right-0")).toBe(true);
    await waitFor(() => {
      const syncButton = within(cluster).getByRole("button", { name: "Up to date" });
      expect(syncButton.classList.contains("size-[3.25rem]")).toBe(true);
      expect(syncButton.classList.contains("border-4")).toBe(true);
      expect(syncButton.classList.contains("border-success")).toBe(true);
      expect(syncButton.classList.contains("bg-transparent")).toBe(true);
      expect(syncButton.parentElement?.classList.contains("absolute")).toBe(true);
      expect(syncButton.parentElement?.classList.contains("top-1/2")).toBe(true);
      expect(syncButton.parentElement?.classList.contains("-translate-y-1/2")).toBe(true);
    });
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

  it("restores a destructive sign-out row at the bottom of the sidebar", () => {
    renderShell();
    const sidebar = document.getElementById("app-sidebar");
    expect(sidebar).toBeTruthy();

    const signOut = sidebar!.querySelector<HTMLButtonElement>('button[aria-label="Sign out"]');
    expect(signOut).toBeTruthy();
    expect(signOut!.className).toContain("text-destructive");

    const toggle = sidebar!.querySelector<HTMLButtonElement>('button[aria-controls="app-sidebar"]');
    expect(toggle).toBeTruthy();
    expect(toggle!.compareDocumentPosition(signOut!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps sign-out in the account menu so the mobile sheet still has it", () => {
    renderShell();
    const accountTrigger = screen.getAllByRole("button", { name: "Open account menu" })[0];
    expect(accountTrigger.closest("#app-sidebar")).toBeTruthy();

    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.some((item) => item.textContent?.includes("Account settings"))).toBe(true);
    expect(menuItems.some((item) => item.textContent?.includes("Sign out"))).toBe(true);
  });

  it("signs out from the sidebar row", async () => {
    renderShell();
    const signOut = document.getElementById("app-sidebar")!.querySelector<HTMLButtonElement>('button[aria-label="Sign out"]');

    fireEvent.click(signOut!);
    await waitFor(() => expect(vi.mocked(logout)).toHaveBeenCalledTimes(1));
  });

  it("signs out from the account menu item", async () => {
    renderShell();
    const signOutItem = screen.getAllByRole("menuitem").find((item) => item.textContent?.includes("Sign out"));

    fireEvent.click(signOutItem!);
    await waitFor(() => expect(vi.mocked(logout)).toHaveBeenCalledTimes(1));
  });

  it("shows a localized toast when logout rejects", async () => {
    mocks.logout.mockRejectedValue(new Error("Failed to fetch"));
    renderShell();
    fireEvent.click(document.getElementById("app-sidebar")!.querySelector<HTMLButtonElement>('button[aria-label="Sign out"]')!);

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({
      description: "We couldn't reach the server. Check your connection and try again.",
      variant: "error",
    }));
  });

  it("shows a localized toast when local database cleanup rejects", async () => {
    mocks.deleteDatabase.mockRejectedValue(new Error("Failed to fetch"));
    renderShell();
    fireEvent.click(document.getElementById("app-sidebar")!.querySelector<HTMLButtonElement>('button[aria-label="Sign out"]')!);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(
      `/login?error=${encodeURIComponent("We couldn't reach the server. Check your connection and try again.")}`
    ));
    expect(mocks.logout).toHaveBeenCalledOnce();
  });
});
