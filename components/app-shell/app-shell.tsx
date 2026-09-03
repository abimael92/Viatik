"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, Cloud, CloudOff, ContactRound, Map, Menu, Settings, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
  const syncLabel = !sync.isOnline
    ? "Offline"
    : sync.conflicts > 0
      ? `${sync.conflicts} conflicts resolved`
    : sync.status === "syncing"
      ? "Syncing"
      : sync.status === "error"
        ? "Sync needs attention"
        : sync.pending > 0
          ? `${sync.pending} pending`
          : "Synced";

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
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-background">
      <a href="#main-content" className="sr-only z-[100] rounded-md bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      {!sync.isOnline && (
        <div role="status" className="bg-accent px-4 py-2 text-center text-sm text-accent-foreground">
          You are offline. Changes are saved on this device and will sync when you reconnect.
        </div>
      )}
      {sync.isOnline && sync.status === "error" && <div role="alert" className="flex items-center justify-center gap-3 bg-destructive/10 px-4 py-2 text-sm text-destructive"><span>Some cloud changes could not sync.</span><Button size="sm" variant="outline" onClick={() => void syncNow()}>Retry now</Button></div>}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card p-5 lg:flex lg:flex-col">
        <Link href="/trips" className="mb-8 flex items-center gap-3 text-xl font-bold">
          <Image src="/viatik-logo.png" alt="" width={44} height={44} priority className="size-11 object-contain" />
          Viatik
        </Link>
        <div className="flex-1">{navigation}</div>
        <SyncBadge label={syncLabel} offline={!sync.isOnline} pending={sync.pending} />
        <div className="mt-4 flex items-center gap-3 border-t pt-4 text-sm">
          <CircleUserRound className="size-8 text-muted-foreground" />
          <span className="min-w-0 truncate">{userLabel}</span>
        </div>
      </aside>
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <Link href="/trips" className="flex items-center gap-2 font-bold"><Image src="/viatik-logo.png" alt="" width={36} height={36} priority className="size-9 object-contain" />Viatik</Link>
        <div className="flex items-center gap-2">
          <SyncBadge label={syncLabel} offline={!sync.isOnline} pending={sync.pending} compact />
          <Button variant="ghost" size="icon" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label={menuOpen ? "Close navigation" : "Open navigation"}>
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </header>
      {menuOpen && (
        <div id="mobile-navigation" className="fixed inset-x-0 top-16 z-30 border-b bg-card p-4 shadow-lg lg:hidden">
          {navigation}
        </div>
      )}
      <main id="main-content" className="mx-auto min-h-dvh max-w-7xl px-4 py-6 sm:px-6 lg:ml-64 lg:px-8 lg:py-10">
        {children}
      </main>
    </div>
  );
}

function SyncBadge({ label, offline, pending, compact = false }: { label: string; offline: boolean; pending: number; compact?: boolean }) {
  const Icon = offline ? CloudOff : Cloud;
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground", compact && "border-0 px-2")} title={pending ? `${pending} local changes waiting to sync` : label}>
      <Icon className={cn("size-4", offline ? "text-accent-foreground" : "text-success")} />
      {!compact && <span>{label}</span>}
      {pending > 0 && <span className="rounded-full bg-primary px-1.5 text-primary-foreground">{pending}</span>}
    </div>
  );
}
