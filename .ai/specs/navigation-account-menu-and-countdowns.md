# Feature Specification: Navigation Polish, Account Menu, and Localized Countdowns

**Project:** Viatik
**Owner:** Main agent
**Status:** Complete
**Created:** 2026-10-31
**Updated:** 2026-10-31
**Related work:** follow-up to `home-pretrip-and-command-palette.md` (formatCountdown i18n)

> No Dexie, Supabase, sync, RLS, mapper, or outbox change. Shell chrome + copy only.

## What & Why

### Findings (grounded in the code, 2026-10-31)

- `features/trips/lib/home-trips.ts` `formatCountdown` returned hardcoded English
  (`"Today"`, `"Started"`, `"N days left"`). Only `UpNextRail` called it, while
  `TripCountdownHero` hand-rolled the same countdown from `common.*` keys — two
  sources of truth, and the hero rendered `"1 days left"` for a trip starting
  tomorrow.
- The mobile bottom tab bar mapped all five nav entries, including the disabled
  `/community` "Coming soon" slot. That slot consumed 20% of the mobile width
  and could never be tapped.
- The desktop sidebar carried a full-width destructive sign-out block pinned to
  the bottom, and the mobile drawer repeated the same block plus every bottom
  bar link. Sign-out is a rare, irreversible action competing with navigation.

### What

1. `formatCountdown` emits localized copy and takes the active translator.
2. The mobile tab bar renders the four live destinations only.
3. Sign-out moves into an avatar-anchored account menu; the mobile drawer stops
   duplicating the tab bar and becomes an account sheet.

### Why

Users should never lose 20% of a phone screen to a dead control, sign-out should
require intent, and countdowns must read naturally in both locales.

## In Scope

### Countdowns

- `formatCountdown(startDate, t, today = new Date())` returns
  `copy.countdownToday` (0), `copy.countdownTomorrow` (1),
  `copy.countdownDaysLeft` with `{{count}}` (>1), `copy.countdownStartedYesterday`
  (−1), and `copy.countdownStartedDaysAgo` with `{{count}}` (<−1).
- `Translate` type exported from `lib/i18n/translations.ts` so pure formatters
  can accept `useI18n().t` without importing the provider.
- `UpNextRail` and `TripCountdownHero` both call `formatCountdown`; the hero's
  inline branches and the now-unused `common.todayLabel` / `common.startedLabel`
  / `common.daysLeft` keys are removed.

### Mobile navigation

- `primaryLinks` = Home · Trips · Contacts · Settings drives the tab bar
  (`grid-cols-4`, each tab `min-h-14`).
- `links` = `primaryLinks` with the disabled Community entry inserted before
  Settings drives the desktop sidebar only.

### Account menu

- New `AccountMenu` (Radix `DropdownMenu`) with an avatar trigger
  (`aria-label` = `copy.openAccountMenu`, `min-h-11`), a name/email label,
  **Account settings** (`copy.accountSettings` → `/settings`), and a destructive
  **Sign out** item (`LogOut` icon, `data-highlighted:bg-destructive/10`,
  `min-h-11`).
- Rendered in the expanded sidebar card, the collapsed rail (`side="right"`),
  and the mobile account sheet.
- The standalone sidebar sign-out block and the drawer sign-out button are
  deleted.
- The mobile header button opens `#mobile-account`, an account sheet that holds
  the profile card (avatar, name/email, language, sync status). It contains no
  navigation links.

## Out of Scope

- Deleting the `/community` route or its coming-soon page.
- Reworking the collapsed-rail layout, `SyncStatusPill`, or the language switcher.
- Per-locale plural rules beyond the explicit singular/tomorrow/started forms.

## Constraints and Design

- **Architecture boundaries:** shell chrome (`components/app-shell/`), pure trip
  helpers (`features/trips/lib/`), i18n dictionaries. No repository, Dexie, or
  server action changes.
- **Data ownership:** unchanged — Dexie stays the domain source of truth.
- **Security:** sign-out still runs the existing `logout()` server action and
  then `deleteDatabase(userId)`; no new remote calls.
- **Compatibility:** Tailwind v4 tokens only; no `tailwind.config.ts`.
- **SOLID/design decisions:** the translator is injected (dependency inversion)
  so `formatCountdown` stays pure and testable in both locales; one formatter
  prevents hero/rail drift.
- **Migration/rollback plan:** none (no schema change).
- **Observability:** none.

## Acceptance Criteria

### Functional

- [x] Countdown copy renders in English and Spanish, including singular,
      tomorrow, yesterday, and N-days-ago forms.
- [x] Both Home countdown surfaces use the same formatter.
- [x] The mobile tab bar shows exactly four tappable tabs and no Community slot.
- [x] The desktop sidebar keeps the disabled Community entry.
- [x] Sign-out is reachable only through the profile/account menu.
- [x] Every interactive element in the new chrome is at least 44px tall.
- [x] All new strings exist in `en` and `es`.

### Tests

- [x] `home-trips.test.ts` covers EN/ES countdown output.
- [x] `app-shell.test.tsx` covers the four-tab bar, the sidebar-only Community
      entry, the absence of a standalone sign-out button, the account menu items,
      and the sign-out handler.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Result: lint/typecheck/build pass; tests 239 files / 1,629 — only the three
  pre-existing `scout-idea-wizard` "progressive waves" failures remain.
