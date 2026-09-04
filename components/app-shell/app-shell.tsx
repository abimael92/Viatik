"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, ContactRound, Map, Menu, Settings, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SyncStatusPill } from "@/components/app-shell/sync-status-pill";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { syncNow } from "@/lib/sync/sync-engine";
import { useSyncStatus } from "@/lib/sync/use-sync-status";
import { cn } from "@/lib/utils";

const links = [
  { href: "/trips", label: "Trips", icon: Map },
  { href: "/contacts", label: "Contacts", icon: ContactRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children, userLabel }: { children: React.ReactNode; userLabel: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const sync = useSyncStatus();

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
              // Quiet utility link: >=44px target, muted fill when active.
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
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
        <Link href="/trips" className="mb-8 flex items-center gap-3 text-xl font-bold">
          <Image src="/viatik-logo.png" alt="" width={44} height={44} priority className="size-11 object-contain" />
          Viatik
        </Link>
        <div className="flex-1">{navigation}</div>
        <SyncStatusPill />
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/40 pt-4 text-sm">
          <div className="flex min-w-0 items-center gap-3">
            <CircleUserRound className="size-8 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 truncate">{userLabel}</span>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      {/* Glass mobile header — pinned on scroll. */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/40 bg-background/80 px-4 backdrop-blur-md lg:hidden">
        <Link href="/trips" className="flex items-center gap-2 font-bold">
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
          className="fixed inset-x-0 top-16 z-30 border-b border-border/40 bg-background/85 p-4 shadow-lg backdrop-blur-md lg:hidden"
        >
          {navigation}
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
