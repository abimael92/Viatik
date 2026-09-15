"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ContactRound, LogOut, Map, Menu, Settings, X } from "lucide-react";
import { useState, useTransition } from "react";

import { logout } from "@/app/actions/auth";
import { SyncStatusPill } from "@/components/app-shell/sync-status-pill";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { deleteDatabase } from "@/lib/db/dexie";
import { syncNow } from "@/lib/sync/sync-engine";
import { useSyncStatus } from "@/lib/sync/use-sync-status";
import { cn } from "@/lib/utils";

const links = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/trips", label: "Trips", icon: Map },
  { href: "/contacts", label: "Contacts", icon: ContactRound },
  { href: "/community", label: "Community", icon: Compass, comingSoon: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  children,
  userId,
  userName,
  userEmail,
  avatarSeed,
  avatarUrl,
}: {
  children: React.ReactNode;
  userId: string;
  userName: string;
  userEmail?: string;
  avatarSeed?: string | null;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const sync = useSyncStatus();

  function signOut() {
    startTransition(async () => {
      const result = await logout();
      if (!result.success) return;
      await deleteDatabase(userId);
      router.replace("/login");
    });
  }

  const navigation = (
    <nav aria-label="Main navigation" className="space-y-1">
      {links.map(({ href, label, icon: Icon, comingSoon }) => {
        if (comingSoon) {
          return (
            <button
              key={href}
              type="button"
              disabled
              title="Coming soon"
              aria-disabled="true"
              className={cn(navLinkClasses(false), "cursor-not-allowed opacity-60")}
            >
              {navIcon(Icon)}
              {label}
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Soon
              </span>
            </button>
          );
        }
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              // Linear-style quiet nav: subtle ghost tint + 2px left accent when active.
              "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {active && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
              />
            )}
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  // Static user profile card — not clickable, no icon, carries the sync status.
  const userCard = (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 p-2.5">
      <UserAvatar seed={avatarSeed} src={avatarUrl} name={userName} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{userName}</span>
        {userEmail && (
          <span className="block truncate text-xs text-muted-foreground">{userEmail}</span>
        )}
      </span>
      <SyncStatusPill compact />
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-md bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {!sync.isOnline && (
        <div
          role="status"
          className="border-b border-border/40 bg-background/80 px-4 py-2 text-center text-sm text-foreground backdrop-blur-md"
        >
          You are offline. Changes are saved on this device and will sync when you reconnect.
        </div>
      )}
      {sync.isOnline && sync.status === "error" && (
        <div
          role="alert"
          className="flex items-center justify-center gap-3 border-b border-border/40 bg-destructive/10 px-4 py-2 text-sm text-destructive backdrop-blur-md"
        >
          <span>Some cloud changes could not sync.</span>
          <Button size="sm" variant="outline" onClick={() => void syncNow()}>
            Retry now
          </Button>
        </div>
      )}

      {/* Floating glass sidebar — pinned on scroll. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border/40 bg-background/70 p-5 backdrop-blur-md lg:flex">
        {/* Top: brand row — logo image untouched, theme toggle sits beside the app name. */}
        <div className="flex items-center justify-between gap-2">
          <Link href="/trips" className="flex items-center gap-3 text-xl font-bold">
            <Image src="/viatik-logo.png" alt="" width={44} height={44} priority className="size-11 object-contain" />
            Viatik
          </Link>
          <ThemeToggle />
        </div>

        {/* User profile card (static) sits before the navigation links, with sync status on it. */}
        <div className="mt-6">{userCard}</div>

        {/* Center: navigation fills the middle. */}
        <div className="mt-3 flex-1">{navigation}</div>

        {/* Bottom: logout lives only here in the sidebar. */}
        <div className="mt-8">
          <Button
            variant="ghost"
            className="w-full justify-between rounded-xl border border-border/40 px-3 py-2 text-muted-foreground hover:text-foreground"
            onClick={() => signOut()}
            disabled={pending}
          >
            <span className="text-xs font-medium">Sign out</span>
            <LogOut className="size-4" />
          </Button>
        </div>
      </aside>

      {/* Glass mobile header — pinned on scroll. */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-side-border bg-side px-4 backdrop-blur-xl lg:hidden">
        <Link href="/home" className="flex items-center gap-2 font-bold text-side-fg">
          <Image src="/viatik-logo.png" alt="" width={36} height={36} priority className="size-9 object-contain" />
          Viatik
        </Link>
        <div className="flex items-center gap-1">
          <SyncStatusPill compact />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          >
            {menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
          </Button>
        </div>
      </header>

      {menuOpen && (
        <div
          id="mobile-navigation"
          className="fixed inset-x-0 top-16 z-30 border-b border-side-border bg-side p-4 shadow-lg backdrop-blur-xl lg:hidden"
        >
          {navigation}
          <div className="mt-4 border-t border-border/40 pt-3">{userCard}</div>
        </div>
      )}

      {/* Mobile bottom tab bar — keeps the main nav always reachable on small screens. */}
      <nav
        aria-label="Main navigation (mobile)"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-side-border bg-side pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className="grid grid-cols-5">
          {links.map(({ href, label, icon: Icon, comingSoon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const cls = cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold tracking-tight",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-viatik-magenta",
              active ? "text-primary" : "text-side-muted hover:text-side-fg",
              comingSoon && "cursor-not-allowed opacity-50"
            );
            if (comingSoon) {
              return (
                <button key={href} type="button" disabled title="Coming soon" aria-disabled="true" className={cls}>
                  <Icon className="size-6" />
                  {label}
                </button>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cls}
              >
                <Icon className="size-6" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <main
        id="main-content"
        className="mx-auto min-h-dvh max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:ml-64 lg:px-8 lg:py-10"
      >
        {children}
      </main>
    </div>
  );
}
