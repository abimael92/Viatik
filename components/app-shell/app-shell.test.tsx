import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
