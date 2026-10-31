"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  CalendarPlus,
  CirclePlus,
  ContactRound,
  CornerDownLeft,
  Home,
  Keyboard,
  Lock,
  Map as MapIcon,
  Moon,
  Receipt,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";

import {
  buildPaletteGroups,
  flattenPaletteGroups,
  paletteSearchText,
  type PaletteGroupId,
  type PaletteItem,
} from "@/components/pro/command-search";
import { usePaletteData } from "@/components/pro/use-palette-data";
import { pickPrimaryTrips, tripActivityEditPath, tripTabPath } from "@/features/trips/lib/home-trips";
import { syncNow } from "@/lib/sync/sync-engine";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

const THEME_KEY = "viatik-theme";
const OPEN_EVENT = "viatik:open-command-palette";

type PaletteEntry = PaletteItem & {
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
};

const GROUP_LABEL_KEYS: Record<PaletteGroupId, TranslationKey> = {
  actions: "copy.paletteGroupActions",
  navigation: "copy.paletteGroupNavigation",
  trips: "copy.paletteGroupTrips",
  activities: "copy.paletteGroupActivities",
  contacts: "copy.paletteGroupContacts",
};

/** Ask the mounted palette to open (sidebar pill, future entry points). */
export function openCommandPalette() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function anotherModalDialogOpen(except: HTMLElement | null): boolean {
  return Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).some(
    (element) => element !== except
  );
}

function toggleTheme() {
  const html = document.documentElement;
  const dark = html.getAttribute("data-theme") !== "light" && html.getAttribute("data-theme") !== "dark"
    ? window.matchMedia?.("(prefers-color-scheme: dark)").matches
    : html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", dark ? "light" : "dark");
  try {
    localStorage.setItem(THEME_KEY, dark ? "light" : "dark");
  } catch {
    // Storage may be unavailable; the in-page theme still applies.
  }
}

export function CommandPalette({ userId }: { userId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [view, setView] = React.useState<null | "palette" | "cheatsheet">(null);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  const open = view !== null;

  // Live Dexie data — subscribed only while the palette view is visible and
  // disposed on close/unmount. Vault entries are ciphertext-only and are never
  // read here: the vault is reachable only through the "Open vault" action.
  const { trips, activitiesByTrip, contacts } = usePaletteData(view === "palette", userId);

  const featuredTrip = React.useMemo(() => pickPrimaryTrips(trips).primaryTrip, [trips]);

  // While the palette is open, remember what had focus so we can restore it on
  // close. Keying on `open` (not `view`) keeps focus across palette <-> cheatsheet.
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open]);

  // Trap Tab focus inside the modal so keyboard/screen-reader users cannot
  // reach the background content while the palette is open.
  const trapTab = React.useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const container = dialogRef.current;
    if (!container) return;
    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !container.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !container.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  const close = React.useCallback(() => setView(null), []);

  const actions: PaletteEntry[] = React.useMemo(() => {
    if (!featuredTrip) return [];
    const id = featuredTrip.id;
    const subtitle = featuredTrip.name;
    return [
      {
        id: "action-add-expense",
        group: "actions",
        label: t("copy.paletteAddExpense"),
        subtitle,
        icon: Receipt,
        searchText: paletteSearchText(t("copy.paletteAddExpense"), "expense money spend"),
        run: () => router.push(`${tripTabPath(id, "money")}&action=add-expense`),
      },
      {
        id: "action-add-activity",
        group: "actions",
        label: t("copy.paletteAddActivity"),
        subtitle,
        icon: CalendarPlus,
        searchText: paletteSearchText(t("copy.paletteAddActivity"), "activity itinerary plan"),
        run: () => router.push(`${tripTabPath(id, "itinerary")}&action=add-activity`),
      },
      {
        id: "action-open-vault",
        group: "actions",
        label: t("copy.paletteOpenVault"),
        subtitle,
        icon: Lock,
        searchText: paletteSearchText(t("copy.paletteOpenVault"), "vault documents secure"),
        run: () => router.push(tripTabPath(id, "vault")),
      },
      {
        id: "action-convert-currency",
        group: "actions",
        label: t("copy.paletteConvertCurrency"),
        subtitle,
        icon: ArrowRightLeft,
        searchText: paletteSearchText(t("copy.paletteConvertCurrency"), "currency convert exchange money"),
        run: () => router.push(`${tripTabPath(id, "money")}&action=money-tools`),
      },
    ];
  }, [featuredTrip, router, t]);

  const navigation: PaletteEntry[] = React.useMemo(
    () => [
      { id: "home", group: "navigation", label: t("copy.paletteGoToHome"), hint: "G H", icon: Home, keywords: "home start dashboard", searchText: paletteSearchText(t("copy.paletteGoToHome")), run: () => router.push("/home") },
      { id: "trips", group: "navigation", label: t("common.goToTrips"), hint: "G T", icon: MapIcon, keywords: "trips journeys dashboard", searchText: paletteSearchText(t("common.goToTrips")), run: () => router.push("/trips") },
      { id: "contacts", group: "navigation", label: t("common.goToContacts"), hint: "G C", icon: ContactRound, keywords: "people contacts travelers", searchText: paletteSearchText(t("common.goToContacts")), run: () => router.push("/contacts") },
      { id: "settings", group: "navigation", label: t("common.goToSettings"), hint: "G S", icon: Settings, keywords: "account profile settings", searchText: paletteSearchText(t("common.goToSettings")), run: () => router.push("/settings") },
      { id: "new-trip", group: "navigation", label: t("common.createNewTrip"), hint: "C", icon: CirclePlus, keywords: "create new trip start plan", searchText: paletteSearchText(t("common.createNewTrip")), run: () => router.push("/trips") },
      { id: "sync", group: "navigation", label: t("common.syncNow"), icon: RefreshCw, keywords: "sync cloud push retry", searchText: paletteSearchText(t("common.syncNow")), run: () => void syncNow() },
      { id: "theme", group: "navigation", label: t("common.toggleTheme"), icon: Moon, keywords: "theme dark light mode", searchText: paletteSearchText(t("common.toggleTheme")), run: toggleTheme },
      { id: "shortcuts", group: "navigation", label: t("common.keyboardShortcuts"), hint: "?", icon: Keyboard, keywords: "keys shortcuts help cheatsheet", searchText: paletteSearchText(t("common.keyboardShortcuts")), run: () => setView("cheatsheet") },
    ],
    [router, t]
  );

  const tripItems = React.useMemo<PaletteEntry[]>(
    () =>
      trips
        .filter((trip) => trip.deletedAt === null)
        .map((trip) => ({
          id: `trip-${trip.id}`,
          group: "trips",
          label: trip.name,
          subtitle: trip.destination ?? undefined,
          icon: MapIcon,
          searchText: paletteSearchText(trip.name, trip.destination, trip.status),
          run: () => router.push(`/trips/${trip.id}`),
        })),
    [trips, router]
  );

  const activityItems = React.useMemo<PaletteEntry[]>(() => {
    const tripById = new Map(trips.map((trip) => [trip.id, trip]));
    const items: PaletteEntry[] = [];
    for (const [tripId, activities] of Object.entries(activitiesByTrip)) {
      const parent = tripById.get(tripId);
      for (const activity of activities) {
        if (activity.deletedAt !== null) continue;
        items.push({
          id: `activity-${activity.id}`,
          group: "activities",
          label: activity.title,
          subtitle: parent?.name ?? undefined,
          icon: CalendarPlus,
          searchText: paletteSearchText(activity.title, activity.placeName, activity.dayDate),
          run: () => router.push(tripActivityEditPath(tripId, activity.id)),
        });
      }
    }
    return items;
  }, [activitiesByTrip, trips, router]);

  const contactItems = React.useMemo<PaletteEntry[]>(
    () =>
      contacts
        .filter((contact) => contact.deletedAt === null)
        .map((contact) => ({
          id: `contact-${contact.id}`,
          group: "contacts",
          label: contact.fullName,
          subtitle: contact.email ?? undefined,
          icon: ContactRound,
          searchText: paletteSearchText(contact.fullName, contact.email, contact.relationship),
          run: () => router.push("/contacts"),
        })),
    [contacts, router]
  );

  const groups = React.useMemo(
    () =>
      buildPaletteGroups(query, {
        actions,
        navigation,
        trips: tripItems,
        activities: activityItems,
        contacts: contactItems,
      }),
    [query, actions, navigation, tripItems, activityItems, contactItems]
  );
  const results = React.useMemo(() => flattenPaletteGroups(groups), [groups]);

  React.useEffect(() => {
    if (view !== "palette") return;
    requestAnimationFrame(() => {
      setActive(0);
      setQuery("");
      inputRef.current?.focus();
    });
  }, [view]);

  React.useEffect(() => {
    const onOpen = () => setView("palette");
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setView((v) => (v === "palette" ? null : "palette"));
        return;
      }
      if (event.key === "Escape") {
        setView(null);
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "?") {
        event.preventDefault();
        setView("cheatsheet");
        return;
      }
      // Two-key chords (G → H/T/C/S) work even with the palette closed — they
      // are deliberate sequences, unlike a stray single key. They stay guarded:
      // no modifiers, no typing targets, and no other modal dialog open.
      if (event.key.toLowerCase() === "g") {
        if (anotherModalDialogOpen(dialogRef.current)) return;
        const onNext = (e: KeyboardEvent) => {
          window.clearTimeout(timeout);
          window.removeEventListener("keydown", onNext);
          if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || anotherModalDialogOpen(dialogRef.current)) return;
          const key = e.key.toLowerCase();
          const destination =
            key === "h" ? "/home" :
            key === "t" ? "/trips" :
            key === "c" ? "/contacts" :
            key === "s" ? "/settings" : null;
          if (destination) {
            setView(null);
            router.push(destination);
          }
        };
        const timeout = window.setTimeout(() => window.removeEventListener("keydown", onNext), 800);
        window.addEventListener("keydown", onNext);
        return;
      }
      // The single-key "C" shortcut stays palette-open only: a bare keypress on
      // a normal page (e.g. the trip workspace) must not hijack navigation.
      if (!open) return;
      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        router.push("/trips");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, open]);

  if (view === null) return null;

  const indexById = new Map(results.map((item, index) => [item.id, index]));

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={view === "cheatsheet" ? t("common.keyboardShortcuts") : t("common.commandPalette")}
      className="fixed inset-0 z-80 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setView(null);
      }}
      onKeyDown={trapTab}
    >
      {view === "cheatsheet" ? (
        <Cheatsheet onClose={close} onOpenPalette={() => setView("palette")} />
      ) : (
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/60 bg-card/90 text-card-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_24px_60px_-12px_rgba(15,23,42,0.3)] backdrop-blur-2xl">
          <div className="flex items-center gap-3 border-b border-border/60 px-4">
            <Search className="size-5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (event.key === "Enter" && results[active]) {
                  event.preventDefault();
                  results[active].run();
                  setView(null);
                }
              }}
              placeholder={t("copy.paletteSearchPlaceholder")}
              className="h-14 w-full bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
              aria-label={t("copy.paletteSearchPlaceholder")}
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-listbox"
              aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
              aria-autocomplete="list"
            />
            <kbd className="rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">ESC</kbd>
          </div>
          <ul id="command-palette-listbox" className="max-h-72 overflow-y-auto p-2" role="listbox" aria-label={t("common.commands")}>
            {results.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">{t("common.noMatchingCommands")}</li>
            )}
            {groups.map((group) => (
              <li key={group.id} role="presentation">
                <div role="group" aria-labelledby={`command-palette-group-${group.id}`}>
                  <p
                    id={`command-palette-group-${group.id}`}
                    className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                  >
                    {t(GROUP_LABEL_KEYS[group.id])}
                  </p>
                  <ul role="presentation">
                    {group.items.map((command) => {
                      const index = indexById.get(command.id) ?? -1;
                      return (
                        <li key={command.id} id={`command-${command.id}`} role="option" aria-selected={index === active}>
                          <button
                            type="button"
                            onClick={() => {
                              command.run();
                              setView(null);
                            }}
                            onMouseEnter={() => setActive(index)}
                            className={cn(
                              "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                              index === active ? "bg-viatik-magenta/15 text-card-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-card-foreground"
                            )}
                          >
                            <command.icon className={cn("size-5", index === active ? "text-viatik-magenta" : "text-muted-foreground")} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{command.label}</span>
                              {command.subtitle && (
                                <span className="block truncate text-xs text-muted-foreground">{command.subtitle}</span>
                              )}
                            </span>
                            {command.hint && <kbd className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{command.hint}</kbd>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-4 border-t border-border/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1.5"><CornerDownLeft className="size-3" />{t("common.select")}</span>
            <span className="flex items-center gap-1.5"><Keyboard className="size-3" />? {t("common.cheatsheet")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Cheatsheet({ onClose, onOpenPalette }: { onClose: () => void; onOpenPalette: () => void }) {
  const { t } = useI18n();
  const rows: Array<[string, string]> = [
    [t("common.openCommandPalette"), "⌘ K"],
    [t("copy.paletteGoToHome"), "G H"],
    [t("common.goToTrips"), "G T"],
    [t("common.goToContacts"), "G C"],
    [t("common.goToSettings"), "G S"],
    [`${t("common.createNewTrip")} · ${t("common.commandPalette")}`, "C"],
    [t("common.toggleTheme"), "⌘ K → Theme"],
    [t("common.close"), "ESC"],
  ];
  return (
    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-card/90 text-card-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_24px_60px_-12px_rgba(15,23,42,0.3)] backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <p className="text-sm font-semibold text-card-foreground">{t("common.keyboardShortcuts")}</p>
        <button
          type="button"
          onClick={onOpenPalette}
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-viatik-magenta hover:text-card-foreground"
        >
          <Search className="size-3.5" /> {t("common.commands")}
        </button>
      </div>
      <ul className="divide-y divide-border/60 px-5 py-2">
        {rows.map(([label, keys]) => (
          <li key={label} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <kbd className="rounded border border-border/60 bg-muted/50 px-2 py-0.5 font-mono text-xs text-card-foreground">{keys}</kbd>
          </li>
        ))}
      </ul>
      <div className="px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg border border-border/60 bg-muted/50 py-2 text-sm font-semibold text-card-foreground transition-colors hover:bg-muted"
        >
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
