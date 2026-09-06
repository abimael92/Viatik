"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CirclePlus,
  ContactRound,
  CornerDownLeft,
  Keyboard,
  Map,
  Moon,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";

import { syncNow } from "@/lib/sync/sync-engine";
import { cn } from "@/lib/utils";

const THEME_KEY = "viatik-theme";

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
  run: () => void;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
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

export function CommandPalette() {
  const router = useRouter();
  const [view, setView] = React.useState<null | "palette" | "cheatsheet">(null);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // While the palette is open, remember what had focus so we can restore it on
  // close. Keying on `open` (not `view`) keeps focus across palette <-> cheatsheet.
  const open = view !== null;
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

  const commands: Command[] = React.useMemo(
    () => [
      { id: "trips", label: "Go to Trips", hint: "G T", icon: Map, keywords: "trips journeys dashboard", run: () => router.push("/trips") },
      { id: "contacts", label: "Go to Contacts", hint: "G C", icon: ContactRound, keywords: "people contacts travelers", run: () => router.push("/contacts") },
      { id: "settings", label: "Go to Settings", hint: "G S", icon: Settings, keywords: "account profile settings", run: () => router.push("/settings") },
      { id: "new-trip", label: "Create a new trip", hint: "C", icon: CirclePlus, keywords: "create new trip start plan", run: () => router.push("/trips") },
      { id: "sync", label: "Sync now", hint: "", icon: RefreshCw, keywords: "sync cloud push retry", run: () => void syncNow() },
      { id: "theme", label: "Toggle theme", hint: "", icon: Moon, keywords: "theme dark light mode", run: toggleTheme },
      { id: "shortcuts", label: "Keyboard shortcuts", hint: "?", icon: Keyboard, keywords: "keys shortcuts help cheatsheet", run: () => setView("cheatsheet") },
    ],
    [router]
  );

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  React.useEffect(() => {
    if (view !== "palette") return;
    requestAnimationFrame(() => {
      setActive(0);
      setQuery("");
      inputRef.current?.focus();
    });
  }, [view]);

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
      if (event.key === "?") {
        event.preventDefault();
        setView("cheatsheet");
        return;
      }
      // Sequential G → T / C / S navigation.
      if (event.key.toLowerCase() === "g") {
        const onNext = (e: KeyboardEvent) => {
          window.clearTimeout(timeout);
          window.removeEventListener("keydown", onNext);
          if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
          if (e.key.toLowerCase() === "t") router.push("/trips");
          else if (e.key.toLowerCase() === "c") router.push("/contacts");
          else if (e.key.toLowerCase() === "s") router.push("/settings");
        };
        const timeout = window.setTimeout(() => window.removeEventListener("keydown", onNext), 800);
        window.addEventListener("keydown", onNext);
        return;
      }
      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        router.push("/trips");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  if (view === null) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={view === "cheatsheet" ? "Keyboard shortcuts" : "Command palette"}
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setView(null);
      }}
      onKeyDown={trapTab}
    >
      {view === "cheatsheet" ? (
        <Cheatsheet onClose={() => setView(null)} onOpenPalette={() => setView("palette")} />
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
              placeholder="Type a command…"
              className="h-14 w-full bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
              aria-label="Search commands"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-listbox"
              aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
              aria-autocomplete="list"
            />
            <kbd className="rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">ESC</kbd>
          </div>
          <ul id="command-palette-listbox" className="max-h-[18rem] overflow-y-auto p-2" role="listbox" aria-label="Commands">
            {results.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">No matching commands.</li>
            )}
            {results.map((command, index) => (
              <li key={command.id} id={`command-${command.id}`} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onClick={() => {
                    command.run();
                    setView(null);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                    index === active ? "bg-viatik-magenta/15 text-card-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-card-foreground"
                  )}
                >
                  <command.icon className={cn("size-5", index === active ? "text-viatik-magenta" : "text-muted-foreground")} />
                  <span className="flex-1">{command.label}</span>
                  {command.hint && <kbd className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{command.hint}</kbd>}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-4 border-t border-border/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1.5"><CornerDownLeft className="size-3" />Select</span>
            <span className="flex items-center gap-1.5"><Keyboard className="size-3" />? Cheatsheet</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Cheatsheet({ onClose, onOpenPalette }: { onClose: () => void; onOpenPalette: () => void }) {
  const rows: Array<[string, string]> = [
    ["Open command palette", "⌘ K"],
    ["Go to Trips", "G T"],
    ["Go to Contacts", "G C"],
    ["Go to Settings", "G S"],
    ["Create a new trip", "C"],
    ["Toggle theme", "⌘ K → Theme"],
    ["Close", "ESC"],
  ];
  return (
    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-card/90 text-card-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_24px_60px_-12px_rgba(15,23,42,0.3)] backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <p className="text-sm font-semibold text-card-foreground">Keyboard shortcuts</p>
        <button
          type="button"
          onClick={onOpenPalette}
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-viatik-magenta hover:text-card-foreground"
        >
          <Search className="size-3.5" /> Commands
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
          Close
        </button>
      </div>
    </div>
  );
}
