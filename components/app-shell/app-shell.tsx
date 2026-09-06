"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, ContactRound, Home, LogOut, Map, Menu, Settings, X } from "lucide-react";
import { useState, useTransition } from "react";

import { logout } from "@/app/actions/auth";
import { SyncStatusPill } from "@/components/app-shell/sync-status-pill";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { UserAvatar } from "@/components/ui/user-avatar";
import { deleteDatabase } from "@/lib/db/dexie";
import { syncNow } from "@/lib/sync/sync-engine";
import { useSyncStatus } from "@/lib/sync/use-sync-status";
import { cn } from "@/lib/utils";

const links = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/community", label: "Community", icon: Compass },
  { href: "/trips", label: "Trips", icon: Map },
  { href: "/contacts", label: "Contacts", icon: ContactRound },
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
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              // Theme-aware glass nav: brand-magenta glow on the active item.
              // Tighter optical tracking + semibold gives an authored, compact
              // label; active item reads in brand foreground, inactive in muted.
              "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] tracking-tight transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-viatik-magenta",
              active
                ? "font-bold bg-side-active text-side-active-fg shadow-[var(--side-glow)]"
                : "font-semibold text-side-muted hover:bg-side-hover hover:text-side-fg"
            )}
          >
            {active && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-linear-to-b from-viatik-blue to-viatik-magenta shadow-[0_0_10px_rgba(168,85,247,0.8)]"
              />
            )}
            <IconTile aria-hidden className="size-9 text-inherit">
              <Icon className="size-6" />
            </IconTile>
            {label}
          </Link>
        );
      })}
    </nav>
  );

  // Static user profile card — not clickable, no icon, carries the sync status.
  const userCard = (
    <div className="rounded-xl border border-side-border bg-side-hover p-3">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar seed={avatarSeed} src={avatarUrl} name={userName} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-tight text-side-fg" title={userName}>{userName}</span>
          {userEmail && (
            <span className="mt-1 block truncate text-[13px] leading-tight text-side-muted" title={userEmail}>{userEmail}</span>
          )}
        </span>
      </div>
      <div className="mt-3 flex border-t border-side-border pt-2.5">
        <SyncStatusPill compact />
      </div>
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

      {/* Arc-inspired dark glass sidebar — structural viatik-blue depth,
          crisp 1px hairline borders, and blur. Pinned on scroll. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-hidden border-r border-side-border bg-side p-5 shadow-[inset_1px_0_0_0_rgba(255,255,255,0.04)] backdrop-blur-xl lg:flex">
        {/* Faint structural blue depth wash toward the top of the panel. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-viatik-blue/15 via-transparent to-transparent"
        />
        {/* Top: brand row — logo image untouched, theme toggle sits beside the app name. */}
        <div className="relative flex items-center justify-between gap-2">
          <Link href="/trips" className="flex items-center gap-3 text-xl font-bold text-side-fg">
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
        <div className="relative mt-8">
          <Button
            variant="ghost"
            className="w-full justify-between rounded-xl border border-side-border bg-side-hover px-3 py-2 text-side-muted hover:bg-side-hover hover:text-side-fg"
            onClick={() => signOut()}
            disabled={pending}
          >
            <span className="text-xs font-semibold">Sign out</span>
            <LogOut className="size-5" />
          </Button>
        </div>
      </aside>

      {/* Glass mobile header — pinned on scroll. */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-side-border bg-side px-4 backdrop-blur-xl lg:hidden">
        <Link href="/trips" className="flex items-center gap-2 font-bold text-side-fg">
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
          <div className="mt-4 border-t border-side-border pt-3">{userCard}</div>
        </div>
      )}

      <main
        id="main-content"
        className="mx-auto min-h-dvh max-w-7xl px-4 py-6 sm:px-6 lg:ml-64 lg:px-8 lg:py-10"
      >
        {children}
      </main>
    </div>
  );
}
