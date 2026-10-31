"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, ContactRound, Home, LogOut, Map, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, X } from "lucide-react";
import { NotificationBell } from "@/features/notifications/components/notification-center";
import { useEffect, useState, useTransition } from "react";

const SIDEBAR_KEY = "viatik-sidebar";

import { logout } from "@/app/actions/auth";
import { SyncErrorBanner } from "@/components/app-shell/sync-error-banner";
import { SyncStatusPill } from "@/components/app-shell/sync-status-pill";
import { LanguageSwitcher } from "@/components/app-shell/language-switcher";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { openCommandPalette } from "@/components/pro/command-palette";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconTile } from "@/components/ui/icon-tile";
import { UserAvatar } from "@/components/ui/user-avatar";
import { deleteDatabase } from "@/lib/db/dexie";
import { useSyncRetryCountdown, useSyncStatus } from "@/lib/sync/use-sync-status";
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

/** The four live destinations. The mobile tab bar renders exactly these. */
const primaryLinks: readonly NavigationLink[] = [
  { href: "/home", labelKey: "navigation.home", icon: Home },
  { href: "/trips", labelKey: "navigation.trips", icon: Map },
  { href: "/contacts", labelKey: "navigation.contacts", icon: ContactRound },
  { href: "/settings", labelKey: "navigation.settings", icon: Settings },
];

/** Desktop sidebar keeps the coming-soon Community entry; the tab bar does not. */
const links: readonly NavigationLink[] = [
  ...primaryLinks.slice(0, 3),
  { href: "/community", labelKey: "navigation.community", icon: Compass, comingSoon: true },
  ...primaryLinks.slice(3),
];

/** Avatar-anchored account menu: preferences first, sign-out behind an explicit open. */
function AccountMenu({
  displayName,
  userEmail,
  avatarSeed,
  avatarUrl,
  pending,
  onSignOut,
  onNavigate,
  variant,
}: {
  displayName: string;
  userEmail?: string;
  avatarSeed?: string | null;
  avatarUrl?: string | null;
  pending: boolean;
  onSignOut: () => void;
  onNavigate?: () => void;
  variant: "card" | "rail";
}) {
  const { t } = useI18n();
  const label = t("copy.openAccountMenu");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            "flex min-h-11 min-w-0 items-center gap-3 rounded-lg text-left transition-colors",
            "hover:bg-side-active/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-viatik-magenta",
            variant === "card" ? "flex-1 px-1" : "justify-center"
          )}
        >
          <UserAvatar seed={avatarSeed} src={avatarUrl} name={displayName} size="md" />
          {variant === "card" && (
            <span className="sidebar-label min-w-0 flex-1">
              <span className="block truncate text-[17px] font-semibold leading-tight text-side-fg" title={displayName}>
                {displayName}
              </span>
              {userEmail && (
                <span className="mt-1 block truncate text-sm leading-tight text-side-muted" title={userEmail}>
                  {userEmail}
                </span>
              )}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={variant === "rail" ? "right" : "bottom"} className="w-60">
        <DropdownMenuLabel className="min-w-0">
          <span className="block truncate">{displayName}</span>
          {userEmail && <span className="block truncate text-xs font-normal text-muted-foreground">{userEmail}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="min-h-11">
          <Link href="/settings" onClick={onNavigate}>
            <Settings className="size-4" aria-hidden />
            {t("copy.accountSettings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11 text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
          disabled={pending}
          onSelect={() => onSignOut()}
        >
          <LogOut className="size-4" aria-hidden />
          {t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Discovery pill that opens the command palette. */
export function CommandPaletteHint({ variant }: { variant: "sidebar" | "header" }) {
  const { t } = useI18n();
  const label = t("copy.paletteShortcutPill");

  if (variant === "header") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => openCommandPalette()}
        aria-label={label}
      >
        <Search aria-hidden />
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openCommandPalette()}
      aria-label={label}
      title={label}
      className="sidebar-nav-link flex min-h-11 w-full items-center gap-3 rounded-lg border border-side-border bg-side-hover px-3 text-base font-semibold text-side-muted transition-colors hover:text-side-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-viatik-magenta"
    >
      <Search className="size-5 shrink-0" aria-hidden />
      <span className="sidebar-label flex-1 text-left">{label}</span>
    </button>
  );
}

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
  const [collapsed, setCollapsed] = useState(false);
  const [pending, startTransition] = useTransition();

  // The `data-sidebar` attribute is applied by the blocking init script before
  // paint; sync React state with it after mount (server always renders expanded).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the attribute applied by themeInitScript
    setCollapsed(document.documentElement.dataset.sidebar === "collapsed");
  }, []);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    const root = document.documentElement;
    if (next) root.setAttribute("data-sidebar", "collapsed");
    else root.removeAttribute("data-sidebar");
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded");
    } catch {
      // Storage may be unavailable; the in-page attribute still applies.
    }
  }
  const sync = useSyncStatus();
  const { countdown: syncRetryCountdown, retryNow } = useSyncRetryCountdown(sync);
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
      "sidebar-nav-link relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-[17px] tracking-tight transition-all",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-viatik-magenta",
      active
        ? "font-bold bg-side-active text-side-active-fg shadow-[var(--side-glow)]"
        : "font-semibold text-side-muted hover:bg-side-hover hover:text-side-fg"
    );

  const navIcon = (Icon: (typeof links)[number]["icon"]) => (
    <IconTile aria-hidden className="size-10 shrink-0 text-inherit">
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
              aria-disabled="true"
              aria-label={label}
              title={t("common.comingSoon")}
              className={cn(navLinkClasses(false), "min-w-0 overflow-hidden cursor-not-allowed opacity-60")}
            >
              {navIcon(Icon)}
              <span className="sidebar-label min-w-0 flex-1 truncate">{label}</span>
              <span className="sidebar-label ml-auto w-auto shrink-0 truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
            aria-label={label}
            title={label}
            className={navLinkClasses(active)}
          >
            {active && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-linear-to-b from-viatik-magenta to-viatik-red shadow-[0_0_10px_rgba(244,63,94,0.7)]"
              />
            )}
            {navIcon(Icon)}
            <span className="sidebar-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  // Profile card: the avatar anchors the account menu (preferences + sign-out).
  const displayName = userName || t("copy.traveler");
  const userCard = (
    <div className="rounded-xl border border-side-border bg-side-hover p-3">
      <div className="flex min-w-0 items-center gap-2">
        <AccountMenu
          displayName={displayName}
          userEmail={userEmail}
          avatarSeed={avatarSeed}
          avatarUrl={avatarUrl}
          pending={pending}
          onSignOut={signOut}
          onNavigate={() => setMenuOpen(false)}
          variant="card"
        />
        <NotificationBell userId={userId} />
      </div>
      <div className="mt-3 flex flex-nowrap items-center gap-1.5 border-t border-side-border pt-2.5">
        <LanguageSwitcher dark compact />
        <SyncStatusPill />
      </div>
    </div>
  );

  // Collapsed rail variant: avatar + bell stacked, icon-only sync pill. No card
  // chrome — at 56px inner width a border+p-2 would clip the 44px controls.
  const collapsedUserCard = (
    <div className="sidebar-collapsed-only">
      <div className="flex flex-col items-center gap-2">
        <AccountMenu
          displayName={displayName}
          userEmail={userEmail}
          avatarSeed={avatarSeed}
          avatarUrl={avatarUrl}
          pending={pending}
          onSignOut={signOut}
          variant="rail"
        />
        <NotificationBell userId={userId} />
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
        <SyncErrorBanner error={sync.lastError} countdown={syncRetryCountdown} onRetry={retryNow} />
      )}

      {/* Arc-inspired dark glass sidebar — structural viatik-blue depth,
          crisp 1px hairline borders, and blur. Pinned on scroll. */}
      <aside
        id="app-sidebar"
        className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col overflow-hidden border-r border-side-border bg-side p-5 shadow-[inset_1px_0_0_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] lg:flex"
      >
        {/* Faint structural blue depth wash toward the top of the panel. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-viatik-blue/15 via-transparent to-transparent"
        />
        {/* Top: brand row — logo image untouched, theme toggle sits beside the app name. */}
        <div className="sidebar-brand-row relative flex items-center justify-between gap-2">
          <Link href="/home" aria-label="Viatik" title="Viatik" className="flex items-center gap-3 text-2xl font-bold text-side-fg">
            <Image src="/viatik-logo.png" alt="" width={44} height={44} priority className="size-11 shrink-0 object-contain" />
            <span className="sidebar-label">Viatik</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </div>

        {/* Command palette entry point — under the brand row, above the user card. */}
        <div className="relative mt-4">
          <CommandPaletteHint variant="sidebar" />
        </div>

        {/* Profile card — the avatar opens the account menu; sync status lives here. */}
        <div className="sidebar-expanded-only mt-3">{userCard}</div>
        <div className="mt-3">{collapsedUserCard}</div>

        {/* Center: navigation fills the middle. */}
        <div className="mt-3 flex-1">{navigation}</div>

        {/* Bottom: collapse toggle. Sign-out lives in the profile card menu. */}
        <div className="relative mt-8">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            aria-label={collapsed ? t("copy.sidebarExpand") : t("copy.sidebarCollapse")}
            title={collapsed ? t("copy.sidebarExpand") : t("copy.sidebarCollapse")}
            className="sidebar-toggle-btn flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-side-muted transition-colors hover:bg-side-hover hover:text-side-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-viatik-magenta"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5 shrink-0" aria-hidden />
            ) : (
              <PanelLeftClose className="size-5 shrink-0" aria-hidden />
            )}
            <span className="sidebar-label flex-1 text-left">{t("copy.sidebarCollapse")}</span>
          </button>
        </div>
      </aside>

      {/* Glass mobile header — pinned on scroll. */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-side-border bg-side px-4 backdrop-blur-xl lg:hidden">
        <Link href="/home" className="flex items-center gap-2 font-bold text-side-fg">
          <Image src="/viatik-logo.png" alt="" width={36} height={36} priority className="size-9 object-contain" />
          Viatik
        </Link>
        <div className="flex items-center gap-1">
          <CommandPaletteHint variant="header" />
          <LanguageSwitcher dark />
          <NotificationBell userId={userId} />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-account"
            aria-label={menuOpen ? t("common.close") : t("copy.openAccountMenu")}
          >
            {menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
          </Button>
        </div>
      </header>

      {menuOpen && (
        <div
          id="mobile-account"
          className="fixed inset-x-0 top-16 z-30 border-b border-side-border bg-side p-4 shadow-lg backdrop-blur-xl lg:hidden"
        >
          {/* Account sheet: navigation lives in the tab bar, so the menu is only
              the profile card — avatar, language, sync, and sign-out. */}
          {userCard}
        </div>
      )}

      {/* Mobile bottom tab bar — keeps the four live destinations reachable. */}
      <nav
        aria-label={t("navigation.mobile")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-side-border bg-side pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className="grid grid-cols-4">
          {primaryLinks.map(({ href, labelKey, icon: Icon }) => {
            const label = t(labelKey);
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold tracking-tight",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-viatik-magenta",
                  active ? "text-primary" : "text-side-muted hover:text-side-fg"
                )}
              >
                <Icon className="size-6" aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <main
        id="main-content"
        className="min-h-dvh transition-[padding] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] lg:pl-[var(--sidebar-w)]"
      >
        <div className="mx-auto w-full max-w-[96rem] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
