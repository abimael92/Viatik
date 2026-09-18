"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, ContactRound, Home, LogOut, Map, Menu, Settings, X } from "lucide-react";
import { NotificationBell } from "@/features/notifications/components/notification-center";
import { useState, useTransition } from "react";

import { logout } from "@/app/actions/auth";
import { SyncStatusPill } from "@/components/app-shell/sync-status-pill";
import { LanguageSwitcher } from "@/components/app-shell/language-switcher";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { UserAvatar } from "@/components/ui/user-avatar";
import { deleteDatabase } from "@/lib/db/dexie";
import { syncNow } from "@/lib/sync/sync-engine";
import { useSyncStatus } from "@/lib/sync/use-sync-status";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

type NavigationLink = {
  href: "/home" | "/trips" | "/contacts" | "/community" | "/settings";
  labelKey:
    | "navigation.home"
    | "navigation.trips"
    | "navigation.contacts"
    | "navigation.community"
    | "navigation.settings";
  icon: typeof Home | typeof Map | typeof ContactRound | typeof Compass | typeof Settings;
  comingSoon?: boolean;
};

const links: readonly NavigationLink[] = [
  { href: "/home", labelKey: "navigation.home", icon: Home, comingSoon: false },
  { href: "/trips", labelKey: "navigation.trips", icon: Map, comingSoon: false },
  { href: "/contacts", labelKey: "navigation.contacts", icon: ContactRound, comingSoon: false },
  { href: "/community", labelKey: "navigation.community", icon: Compass, comingSoon: true },
  { href: "/settings", labelKey: "navigation.settings", icon: Settings, comingSoon: false },
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
  const { t } = useI18n();

  function signOut() {
    startTransition(async () => {
      const result = await logout();
      if (!result.success) return;
      await deleteDatabase(userId);
      router.replace("/login");
    });
  }

  const navLinkClasses = (active: boolean) =>
    cn(
      // Theme-aware glass nav: brand-magenta glow on the active item.
      // Tighter optical tracking + semibold gives an authored, compact
      // label; active item reads in brand foreground, inactive in muted.
      "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] tracking-tight transition-all",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-viatik-magenta",
      active
        ? "font-bold bg-side-active text-side-active-fg shadow-[var(--side-glow)]"
        : "font-semibold text-side-muted hover:bg-side-hover hover:text-side-fg"
    );

  const navIcon = (Icon: (typeof links)[number]["icon"]) => (
    <IconTile aria-hidden className="size-9 text-inherit">
      <Icon className="size-6" />
    </IconTile>
  );

  const navigation = (
    <nav aria-label={t("navigation.main")} className="space-y-1">
      {links.map(({ href, labelKey, icon: Icon, comingSoon = false }) => {
        const label = t(labelKey);
        if (comingSoon) {
          return (
            <button
              key={href}
              type="button"
              disabled
              title={t("common.comingSoon")}
              aria-disabled="true"
              className={cn(navLinkClasses(false), "cursor-not-allowed opacity-60")}
            >
              {navIcon(Icon)}
              {label}
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("common.comingSoon")}
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
            className={navLinkClasses(active)}
          >
            {active && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-linear-to-b from-viatik-magenta to-viatik-red shadow-[0_0_10px_rgba(244,63,94,0.7)]"
              />
            )}
            {navIcon(Icon)}
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
        <NotificationBell userId={userId} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-side-border pt-2.5">
        <LanguageSwitcher dark />
        <SyncStatusPill compact />
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only z-100 rounded-md bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t("navigation.skipToContent")}
      </a>

      {!sync.isOnline && (
        <div
          role="status"
          className="border-b border-border/40 bg-background/80 px-4 py-2 text-center text-sm text-foreground backdrop-blur-md"
        >
          {t("sync.offline")}
        </div>
      )}
      {sync.isOnline && sync.status === "error" && (
        <div
          role="alert"
          className="flex items-center justify-center gap-3 border-b border-border/40 bg-destructive/10 px-4 py-2 text-sm text-destructive backdrop-blur-md"
        >
          <span>{t("sync.error")}</span>
          <Button size="sm" variant="outline" onClick={() => void syncNow()}>
            {t("common.retry")}
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
          <Link href="/home" className="flex items-center gap-3 text-xl font-bold text-side-fg">
            <Image src="/viatik-logo.png" alt="" width={44} height={44} priority className="size-11 object-contain" />
            Viatik
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </div>

        {/* User profile card (static) sits before the navigation links, with sync status on it. */}
        <div className="mt-6">{userCard}</div>

        {/* Center: navigation fills the middle. */}
        <div className="mt-3 flex-1">{navigation}</div>

        {/* Bottom: logout lives only here in the sidebar. */}
        <div className="relative mt-8">
          <Button
            variant="ghost"
            className="w-full justify-between rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive hover:border-destructive/60 hover:bg-destructive/20 hover:text-destructive"
            onClick={() => signOut()}
            disabled={pending}
          >
            <span className="text-xs font-semibold">{t("common.signOut")}</span>
            <LogOut className="size-5" />
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
          <LanguageSwitcher dark />
          <SyncStatusPill compact />
          <NotificationBell userId={userId} />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void signOut()}
            disabled={pending}
            aria-label={t("common.signOut")}
            title={t("common.signOut")}
          >
            <LogOut aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={menuOpen ? t("navigation.close") : t("navigation.open")}
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

      {/* Mobile bottom tab bar — keeps the main nav always reachable on small screens. */}
      <nav
        aria-label={t("navigation.mobile")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-side-border bg-side pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className="grid grid-cols-5">
          {links.map(({ href, labelKey, icon: Icon, comingSoon = false }) => {
            const label = t(labelKey);
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
