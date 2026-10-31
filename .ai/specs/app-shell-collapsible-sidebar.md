# Feature Specification: Wider, Collapsible Sidebar and Adaptive Page Width

**Project:** Viatik
**Owner:** Main agent
**Status:** In Progress
**Created:** 2026-10-30
**Updated:** 2026-10-31
**Related work:** follow-up to `home-pretrip-and-command-palette.md`

> No Dexie, Supabase, sync, or outbox change. UI shell only.

## What & Why

### Findings (grounded in the code, 2026-10-30)

- `components/app-shell/app-shell.tsx`: desktop sidebar is `w-64` (16rem) at `lg`; `<main>` is `mx-auto max-w-7xl ... lg:ml-64`. `ml-64` overrides the left auto margin, so on wide screens content is capped at 80rem and left-aligned next to the sidebar, leaving dead space on the right. Content never reacts to sidebar width because it is hard-coded.
- Sidebar type is small: nav labels `text-[15px]`, user email `text-[13px]`, "Coming soon" pill `text-[8px]` in a fixed `w-16`, sign-out label `text-xs`, language select `text-xs h-8 w-14`.
- `HomePage` wraps itself in `mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8` inside a `<main>` that already adds `px-4 sm:px-6 lg:px-8 lg:py-10`. That is double padding and a narrower cap (72rem) than every other page.
- Trips dashboard, trip workspace, contacts, notifications fill the shell width. Settings and Gemini use inner `max-w-3xl` (intentional for forms/prose). `app/(app)/gemini/page.tsx` renders a `<main>` inside the shell `<main>` (invalid nesting; flag, do not redesign).
- Home stacks every section in one column even at `xl`; pre-trip and active cockpit sections could sit side by side.

### What

1. Remove the keyboard-shortcut badge (the `⌘ K` / `Ctrl K` `kbd`) from the sidebar search pill. The pill stays as a plain "Search" button (icon + label). The mobile header search icon, the Cmd/Ctrl+K listener, the palette cheatsheet, and the G-chords are unchanged.
2. Make the expanded sidebar wider (`clamp(20.5rem, 22vw, 22rem)` — 328px at the `lg` edge, up to 352px on wide monitors) with larger nav type (`text-[20px]`, 48px rows).
3. Make the sidebar collapsible to an icon rail (`w-20`, 5rem) on `lg+`. Preference persists across reloads with no layout flash.
4. Make page content adapt to the sidebar width and use the available space: content wrapper is offset by the live sidebar width and centered inside the remaining space, with a larger cap.
5. Fix page-level distribution problems found above (double padding on Home, two-column rhythm on Home at `xl`).

### Why

The sidebar is the app's main chrome and is cramped; collapsing it gives dense screens (itinerary, money, map) more room, and the content currently wastes space on wide monitors.

## In Scope

### Sidebar

- **Sizing:** expanded `clamp(20.5rem, 22vw, 22rem)` (fluid: 328px at `lg`, capped 352px from ~1600px), collapsed `5rem`, driven by a CSS variable `--sidebar-w` defined in `app/globals.css` on `:root` and overridden by `html[data-sidebar="collapsed"]` (`5rem`). Only applies at `lg+` (below `lg` the sidebar is hidden and mobile nav is unchanged).
- **Type (expanded):** brand text `text-2xl`; nav labels `text-[20px]` in `min-h-12` (48px) rows; user name `text-[17px]`; email `text-sm`; search pill `text-base`; sign-out label `text-sm`; "Coming soon" pill at least `text-[10px]` with auto width (`w-auto px-1.5`, no fixed `w-16`); language select `h-9 w-16 text-sm`. Icon tiles `size-10`.
- **Collapsed rail:** brand logo only; nav icons only, centered, each with `aria-label` and `title`; active indicator bar preserved; user shows avatar only (notification bell stacked under it); search is an icon-only button with `aria-label`; theme toggle visible; sync status shown as an icon-only compact pill (add a `compact` prop to `SyncStatusPill` that hides text but keeps the icon, state color, pulse, and the dropdown trigger, so offline-first sync state stays visible); language switcher hidden; sign-out is icon-only with `aria-label`. "Coming soon" Community item shows only the dimmed icon with `title`.
- **Toggle:** a 44px icon-only button (`size="icon"`, ghost, `hover:bg-side-hover`) with `ChevronsLeft` (expanded) / `ChevronsRight` (collapsed) — chevrons replaced `PanelLeftClose` / `PanelLeftOpen` on 2026-10-31 because the panel glyph is unreadable at 20px (the arrow is ~6px and both states look alike) — in the **brand row** at the top of the panel, immediately right of the theme toggle (it used to be a full-width labeled row at the bottom, which competed with sign-out). `aria-expanded`, `aria-controls="app-sidebar"` (the `<aside>` has that id), accessible name from i18n (`copy.sidebarCollapse` = "Collapse sidebar" / "Contraer barra lateral", `copy.sidebarExpand` = "Expand sidebar" / "Expandir barra lateral") plus `title`. In the rail the `.sidebar-brand-actions` group stacks (two 44px buttons cannot sit side by side in the 56px rail). The bottom of the panel holds sign-out only.
- **Persistence and no flash:** `localStorage["viatik-sidebar"]` = `"collapsed" | "expanded"` (default expanded). Extend `themeInitScript` in `components/theme-initializer.tsx` and `applyStoredPreferences()` to set/remove `data-sidebar` on `<html>` (same try/catch style; the `<html>` already has `suppressHydrationWarning`). Collapse/expand visuals are CSS-driven from the attribute (use Tailwind v4 `in-data-[sidebar=collapsed]:` / `group` variants, or plain CSS in `globals.css` if a variant is not available) so the server HTML never shows the wrong state. React state is only used for the toggle's `aria-expanded` and icon, read from `document.documentElement` after mount (default expanded on the server). Toggling sets the attribute and `localStorage` (guard storage errors).
- **Motion:** `transition-[width]` on the aside and `transition-[padding]` on the content wrapper, `duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]`. Global reduced-motion CSS already neutralizes it.

### Content

- Replace `main`'s `max-w-7xl ... lg:ml-64` with: `<main id="main-content" className="min-h-dvh lg:pl-[var(--sidebar-w)] transition-[padding] ...">` and an inner `<div className="mx-auto w-full max-w-[96rem] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:py-10">` so the content is centered in the space to the right of the sidebar and grows when the sidebar collapses. Keep `id="main-content"` (skip link target).
- `HomePage` (and its loading skeleton wrapper): drop the inner `mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8`; keep `flex w-full flex-col gap-6 pb-32` so Home uses the shell's width and padding.
- `PreTripSection`: wrap `OpenTasksWidget` and `DayOnePreview` in `grid gap-6 xl:grid-cols-2 xl:[&>*:only-child]:col-span-2` so they sit side by side at `xl`, and a lone rendered child spans the full row (`OpenTasksWidget` returns `null` when empty). The document banner stays full width above.
- Home active cockpit (`isActive` branch): at `xl`, place `LiveTimelineHud` in a wide left column and the secondary widgets (notes board, open tasks, active-trip actions, steps, recent activity) in a right column: `xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:gap-6`, single column below `xl`. `DocumentRiskBanner` stays full width above the grid. DOM order stays as today so keyboard/tab order and mobile order do not change.
- Audit, do not redesign: Trips dashboard, trip workspace, contacts, notifications, settings, community, gemini. Confirm each fills the new container and has sensible column steps at `xl`/`2xl`; add an `xl:`/`2xl:` column step only where a list is clearly single/narrow-column on wide screens and the change is a one-line grid class. Leave `settings` (`max-w-3xl`) and `gemini` (`max-w-3xl`) inner caps. Report the `<main>`-inside-`<main>` nesting in `gemini/page.tsx` but do not change it unless it is a trivial `main` -> `div` swap with no test impact (if so, do it and say so).

## Out of Scope

- Redesigning individual pages, trip workspace tab internals, mobile nav, or the palette.
- Hover-to-expand rail behavior, resizable (drag) sidebar, per-user server persistence.
- Moving language switcher to settings.

## Constraints and Design

- Tailwind v4 only (`@theme` / CSS in `app/globals.css`); no `tailwind.config.ts`.
- All visible/aria copy via `t()` with EN + ES in `lib/i18n/frontend-copy.ts`; `i18n-coverage.test.ts` must pass. No emoji.
- 44px touch targets; focus rings preserved; icons `aria-hidden` when decorative; collapsed items get `aria-label` + `title`.
- Hydration safety: nothing in the server render may depend on `localStorage`. The only server/client difference is the `<html data-sidebar>` attribute set by the blocking script before paint.
- Export `CommandPaletteHint` signature change is allowed (it is only used in `app-shell.tsx`); update its tests if any.

## Acceptance Criteria

- [ ] Sidebar search pill no longer renders a shortcut `kbd`; the button still opens the palette; mobile header search icon unchanged.
- [ ] Expanded sidebar is `clamp(20.5rem, 22vw, 22rem)` with the larger type above; no text truncation of "Coming soon" or the sign-out label in EN or ES, and the profile display name fits at the `lg` edge.
- [ ] Toggle collapses to a 5rem icon rail and back; it sits in the brand row, `aria-expanded` and the accessible name reflect state; keyboard operable.
- [ ] Preference persists in `localStorage["viatik-sidebar"]` and is applied by the init script before first paint (`document.documentElement.dataset.sidebar === "collapsed"` after a reload with the stored value), with no hydration warning.
- [ ] Collapsed rail: every nav item keeps an accessible name; sync status icon, notification bell, theme toggle, search, sign-out still usable; language switcher hidden.
- [ ] Content area follows `--sidebar-w` and is centered with `max-w-[96rem]`; collapsing widens content smoothly at `lg+`; below `lg` layout is unchanged (no sidebar padding).
- [ ] Home has no double padding; pre-trip tasks/day-1 sit side by side at `xl` and a lone child spans both columns; active cockpit is two columns at `xl`, one column below.
- [ ] `themeInitScript` still passes any existing tests; lint, typecheck, test, build pass.

## Verification

- Unit tests (colocated, Vitest + Testing Library): toggle updates `data-sidebar`, `localStorage`, `aria-expanded`, and the accessible name; collapsed state renders nav items with `aria-label`; the pill has no `kbd`; `applyStoredPreferences`/`themeInitScript` set and clear `data-sidebar` (evaluate the script string in jsdom). `SyncStatusPill` `compact` renders icon-only with an accessible name.
- Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Visual check needs an authenticated session; report it as not performed if the sidekick cannot sign in.

## Risks and Open Questions

- **Risk:** `SyncStatusPill` dropdown is portaled and positioned from its trigger rect; the compact trigger must keep the same ref/rect logic so the dropdown still anchors correctly.
- **Risk:** Tailwind `in-data-*` support; fall back to plain CSS in `globals.css` if unavailable.
- **Interpretation:** "remove the shortcut view on search" was read as the shortcut badge on the sidebar search pill. If the intent was the whole pill, delete `CommandPaletteHint variant="sidebar"`.
