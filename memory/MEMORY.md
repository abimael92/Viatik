# Viatik — Persistent Agent Memory

> **Purpose:** durable, incremental context for every agent session. Read this
> before exploring the codebase; update it before ending a task.
> **Companions:** [`data-models.md`](data-models.md) ·
> [`components-ui.md`](components-ui.md) · [`roles-abilities.md`](roles-abilities.md)
> **Last updated:** 2026-10-30 · schema v48 · 232 test files / 1,568 tests

---

## 1. Project identity

**Viatik** is a collaborative, offline-first travel workspace. Travelers plan
itineraries, coordinate crews, split multi-currency expenses, track documents and
health, share read-only links with family, and keep working with no network.

**Core domain model:** `Trip` → `TripMember` (owner/editor/viewer) →
`Activity` (per day) → `Expense`/`ExpenseShare`/`ExpenseSettlement`; plus media,
decisions (polls), notes, tasks, travelers, contacts, vault entries, share links.

**Stack:** Next.js 16.3.3 (App Router, `proxy.ts`) · React 19.2.8 · TypeScript
strict · Tailwind v4 · Dexie 4.4.5 · Supabase (Postgres/Auth/Storage/Realtime) ·
Zustand (UI only) · Vitest 4 + Playwright · Capacitor 8 · pnpm 11.3.0.

---

## 2. Architectural invariants (never break)

1. **Dexie is the domain source of truth.** All domain reads/writes go through
   `features/<feature>/data/dexie-*-repository.ts`.
2. **Supabase is sync + authorization only.** UI/features never query Supabase
   domain tables. Only auth, storage, public-profile RPCs, and server-side
   auth/profile gating may call it.
3. **Writes are transactional.** Domain row + outbox entry in one
   `TransactionContext.runInTransaction`, via `append()` — never
   `db.outboxMutations.add`.
4. **Money is `bigint` minor units.** No floats, no `number` amounts.
5. **Dexie migrations are additive** (`this.version(N)`), with backfills and
   matching Supabase migrations/RLS/mappers.
6. **Authorization is enforced server-side (RLS).** Client `canEdit` is UX only.
7. **Offline is the default.** No feature may require the network to render or to
   accept a write (documented exceptions: invitation accept/reject RPC, auth,
   storage signed URLs, profile directory).
8. **Local-only tables stay local.** `tripBudgets`, `tripIdeas`, `tripSavingsPlans`,
   `profiles`, `tripPins`, `feedItems`, `packingItems`, `travelDocuments`, `polls`,
   `pollVotes`, `currencyRates`, `transitSegments`, `journalDayEntries`,
   `dailyStepCounts`, `stagedTripMedia`, `sync*` — never append outbox entries.

---

## 3. Current state snapshot

- **Auth:** email + password primary; passkey (WebAuthn) and 8-digit one-time code
  as fallbacks. Signup requires display name, email, phone, date of birth; profile
  row pre-created. Email confirmation required. Password reset via
  `/auth/confirm` → `/reset-password`. SMS verification disabled.
- **Routes:** `/home`, `/trips`, `/trips/[tripId]`, `/contacts`, `/community`
  (coming soon), `/notifications`, `/settings`, `/gemini`; auth routes under
  `(auth)`; public `/share/[slug]`; `/auth/confirm`; `/e2e`.
- **Trip workspace tabs:** overview · itinerary · tasks · map · money · photos ·
  people · journal · settings. Overview hosts packing / health / polls / vault.
- **Sync:** outbox → CAS RPCs; pull by `updated_at` cursor; Supabase Realtime per
  table; multi-tab lease in `syncLeases`; retries 5× with 1/5/15/30/60s backoff;
  conflicts auto-resolve remote-wins.
- **Features:** activities, ai (Scout), collaboration, community/feed, contacts,
  emergency, expenses, finance, health, journal, maps, media, packing, polls,
  profile, sharing, transit, trip-planner, trips, vault, weather, steps,
  notifications.

---

## 4. Session log protocol (mandatory)

> **At the end of every task or PR, the agent MUST update `memory/MEMORY.md` with
> any new features added, schema modifications made, and gotchas discovered.**

Format — append under §7 (newest first), and bump `Last updated` at the top:

```markdown
### YYYY-MM-DD — <short title>
- **Changed:** files/features touched
- **Schema:** Dexie version / Supabase migration, or "none"
- **Verification:** commands run + result (lint / typecheck / test counts / build)
- **Gotchas:** anything the next agent must know
```

Also update the topic file whose subject changed:
`data-models.md` (schema/sync), `components-ui.md` (UI/hooks),
`roles-abilities.md` (permissions), and `.ai/CONTEXT.md` (stack/features).

---

## 5. Known gotchas & quirks (audit 2026-10-22)

### Framework / build
- **Next 16:** middleware is `proxy.ts` (root), not `middleware.ts`. `params` are
  async; `LayoutProps<"/">` types come from generated `.next/types`.
- `next dev` **rewrites the `nextjs-agent-rules` block** at the top of `AGENTS.md`.
  Keep it in commits or it reappears as an uncommitted change.
- `pnpm lint` is `eslint --max-warnings 0` — warnings fail the build gate.
- Husky pre-commit runs `pnpm lint && pnpm typecheck`.
- `next.config.ts` sets `images.unoptimized: true` (Capacitor/offline), so
  `next/image` gives no optimization — size images explicitly.

### Offline / Dexie
- Dexie is client-only. `DatabaseProvider` instantiates inside `useEffect` and
  renders `null` until ready; SSR never sees IndexedDB.
- `getCurrentDatabase()` throws `"No database is open. Wrap calls in DatabaseProvider."`
  outside the provider tree.
- Databases are per user: `viatik_<userId>` / `viatik_anonymous`. Switching users
  must close the old DB (`closeDatabase`) or data leaks across accounts.
- **BigInt does not survive `JSON.stringify`.** Outbox payloads are structured
  cloned; remote mappers convert explicitly.
- `append()` collapses repeated edits per entity, keeps the original `insert`
  operation, and drops an unsent insert when the entity is deleted first.
- Changing a table's `.stores()` index string **replaces** its index set — redeclare
  every index for that table.
- `mediaTranscripts` primary key is `mediaId` (not `id`); `tripSavingsPlans` has a
  unique `&tripIdeaId`.
- Legacy `polls`/`pollVotes` are local-only; new voting uses synced
  `decisions`/`decisionOptions`/`decisionVotes`.

### Sync
- A peer tab can hold the sync lease; the trip workspace waits up to
  `HYDRATION_TIMEOUT_MS = 15_000` before giving up on its first sync.
- `SyncCoordinationInterruptedError` means another tab took over — not a failure.
- `syncConflicts` auto-resolve (remote wins); only `resolvedAt === null` rows are
  counted in the UI, otherwise the pill would never clear.
- RLS errors reset retry attempts instead of exhausting them.
- Missing remote tables (migration not applied) are skipped with a warning; the
  sync does not fail.
- Invitation accept/reject call server RPCs (`accept_trip_invitation`,
  `reject_trip_invitation`) — **remote-first**, not offline-capable.

### Auth / data access
- `profiles` RLS is self-only; collaborator identity must go through the
  `get_profile_public_data` RPC (`features/collaboration/data/dexie-collaboration-repository.ts`).
- `(app)/layout.tsx` redirects to `/login` when unauthenticated and to
  `/onboarding` when `profiles.full_name` is empty.
- Email confirmation + custom SMTP are required for production signups.
- Secrets: `.env.local` (local), `.env.encrypted` + `pnpm secrets:unlock`,
  `pnpm setup`. Never commit or log values.

### UI
- Hydration: theme (`viatik-theme`) and language (`viatik-language`) are read from
  `localStorage` only after mount; `ThemeInitScript` re-applies before paint and
  `<html>` has `suppressHydrationWarning`.
- Radix portaled content inside dialogs must use `isDialogDismissExempt()`
  (`components/ui/dialog-dismiss.ts`) or it dismisses the parent dialog.
- All copy goes through `t()`; `lib/i18n/i18n-coverage.test.ts` enforces key parity.
- Repositories expose `watch*` (liveQuery) — always return the disposer to
  `useEffect`; there is no generic `useTrip` hook.
- 44×44px minimum touch targets; `sm` buttons (`h-9`) only in dense toolbars.

### Money
- Only 6 currencies have exponents (`CAD, EUR, GBP, JPY, MXN, USD`) — adding a
  currency requires editing `CURRENCY_EXPONENTS` in `features/domain/money.ts`
  (and tests), or parsing throws `Unsupported currency`.
- `MAX_MINOR_UNITS = 9_999_999_999n`; every parse/convert path validates it.

---

## 6. Where to look first

| Need | File |
|---|---|
| Schema / sync | `lib/db/dexie.ts`, `lib/sync/`, `lib/supabase/mappers.ts` |
| Domain types | `features/domain/entities.ts`, `entities-media.ts`, `money.ts` |
| Repositories | `features/*/data/dexie-*-repository.ts`, `features/domain/repositories/` |
| Auth | `app/actions/auth.ts`, `app/(auth)/login/login-form.tsx`, `lib/auth/` |
| Permissions | `supabase/migrations/`, `memory/roles-abilities.md` |
| Design tokens | `app/globals.css`, `.ai/specs/design-system.md` |
| Rules | `.ai/constitution.md`, `.ai/AGENTS.md`, `AGENTS.md` |

---

## 7. Session log (newest first)

### 2026-10-30 — Collapsible 18rem sidebar + adaptive content width

- **Changed:** `app/globals.css` (`--sidebar-w: 18rem` on `:root`, `5rem` under
  `html[data-sidebar="collapsed"]`, plus `.sidebar-expanded-only` /
  `.sidebar-collapsed-only` / `.sidebar-nav-link` / `.sidebar-label` /
  `.sidebar-brand-row` / `.sidebar-toggle-btn` hook classes — plain CSS chosen
  over Tailwind `in-data-*` for determinism), `components/theme-initializer.tsx`
  (`themeInitScript` + `applyStoredPreferences` now set/remove `data-sidebar`
  from `localStorage["viatik-sidebar"]`), `components/app-shell/app-shell.tsx`
  (`#app-sidebar`, `w-[var(--sidebar-w)]` + `transition-[width]`, collapse
  toggle with `PanelLeftClose`/`PanelLeftOpen` + `aria-expanded`/`aria-controls`,
  expanded type bumps, icon-rail variants with `aria-label`/`title`, kbd removed
  from the sidebar search pill, `<main>` → `lg:pl-[var(--sidebar-w)]` + inner
  `mx-auto max-w-[96rem]` wrapper), `sync-status-pill.tsx` (`compact` prop —
  icon-only with `aria-label`, same trigger/rect dropdown), `language-switcher.tsx`
  (h-9 w-16 text-sm), `home-page.tsx` (double padding removed, active cockpit
  `xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` with secondary widgets in
  `xl:col-start-2`), `pre-trip-section.tsx` (`xl:grid-cols-2` +
  only-child col-span), `app/(app)/gemini/page.tsx` (`<main>`→`<div>` nesting
  fix), new `app-shell.test.tsx` + `theme-initializer.test.ts`, compact test in
  `sync-status-pill.test.tsx`, EN/ES `sidebarCollapse`/`sidebarExpand`.
- **Schema:** none.
- **Verification:** `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` 232 files /
  1,568 tests — 1,565 pass, only the 3 pre-existing `scout-idea-wizard`
  "progressive waves" failures · `pnpm build` ✅ (21 routes).
- **Gotchas:** jsdom here has no usable `localStorage` (Node stub) — tests that
  exercise storage must shim `globalThis.localStorage` with an in-memory map.
  Collapse state is CSS-driven from `html[data-sidebar]`; React state only
  mirrors it for the toggle's `aria-expanded`/icon (read post-mount, eslint
  `set-state-in-effect` disabled). Server render must never read localStorage.
  Two SyncStatusPill instances mount (expanded + compact rail) — both subscribe,
  one is `display:none`. The rail shrinks `#app-sidebar` padding to `0.75rem`
  (56px inner) and the rail user block has **no card chrome** — a bordered p-2
  card + p-5 padding clipped the 44px avatar/bell at 5rem. All rail labels hide
  via `.sidebar-label` (toggle/brand too, not just `.sidebar-nav-link`).
  Visually verified with a temporary `/e2e/shell` harness + Playwright
  (expanded/collapsed, EN/ES, light/dark, mobile; harness deleted after).

### 2026-10-30 — Pre-trip Home content + command palette data search

- **Changed:** `features/trips/lib/home-trips.ts` (`isWithinDocumentWindow`),
  new `within-24-hours-banner.tsx` (extracted `isWithinNext24Hours` + markup,
  visuals unchanged), `day-one-preview.tsx` (first 3 items where
  `dayDate === trip.startDate`, empty-state `&action=add-activity` link, null
  `startDate` → nothing), `pre-trip-section.tsx` (document banner + open tasks +
  Day 1 preview, readiness stays in the hero), `home-page.tsx` (wired for
  `primaryTrip && !isActive`, 3 hard-coded strings → `t()`). Command palette
  split: `components/pro/command-search.ts` (pure normalize/match/group/cap-5),
  `use-palette-data.ts` (liveQuery subscriptions only while open), rewritten
  `command-palette.tsx` (grouped listbox, contextual trip actions, `userId`
  prop, `openCommandPalette()` CustomEvent), `CommandPaletteHint` pill in
  `app-shell.tsx` (sidebar + mobile header, ⌘/Ctrl resolved post-mount),
  `app/(app)/layout.tsx` passes `data.user.id`. EN/ES keys in
  `lib/i18n/frontend-copy.ts`. `vitest.config.mjs` no longer excludes the two
  Home test files; `home-page.test.tsx` gained mocks for finance/expense/feed/
  health/weather/currency-rate repositories and fresh dynamic dates.
- **Schema:** none.
- **Verification:** `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` 230 files /
  1,560 tests — 1,557 pass, only the 3 pre-existing `scout-idea-wizard`
  "progressive waves" failures reproduce (unchanged from clean HEAD) ·
  `pnpm build` ✅ (21 routes).
- **Gotchas:** vault entries persist ciphertext only, so the palette exposes an
  "Open vault" action and never reads/indexes entries. There is no
  `activityRepository.watchAll` — the palette fans out `watchByTrip` over the
  20 most-recent trips by `startDate` desc, only while open. `G H/T/C/S` chords
  work with the palette closed (guards: no modifiers, no typing target, no
  other `[role="dialog"][aria-modal="true"]`); the single-key `C` stays
  palette-open-only. React 19 lint (`react-hooks/set-state-in-effect`,
  `immutability`) forbids setState-in-effect and render-time variable
  reassignment — use the render-time "adjust state when props change" reset
  and precomputed index maps instead.

### 2026-10-28 — Trip planner: title prompt on convert + "set back as idea"

- **Changed:** `features/trip-planner/data/dexie-trip-planner-repository.ts`
  (`convertToTrip(id, { name })`, `revertToIdea(id, { deleteTrip })`,
  `sendTripBackToIdea(tripId, { deleteTrip })`, `getByTripId`, `watchByTripId`,
  `normalizeTripTitle`, `tripDurationDays`),
  `features/trip-planner/domain/repositories/trip-idea-repository.ts`
  (`ConvertTripIdeaOptions`, `RevertTripIdeaOptions`),
  `features/trips/data/dexie-trip-repository.ts` (extracted exported
  `deleteTripInTransaction`), `trip-planner-view.tsx` (trip-title dialog),
  `trip-idea-card.tsx` (`onConvert` is now a void opener + `onRevert`),
  new `revert-to-idea-dialog.tsx` and `trip-idea-link-section.tsx`,
  `trip-workspace.tsx` (owner-only header action + Settings section),
  EN/ES copy, `e2e/vacation-planner.spec.ts`.
- **Schema:** none (Dexie stays v48; `tripIdeas.convertedToTripId` was already indexed in v47).
- **Verification:** `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm vitest run features/trip-planner` ✅ (repository 18/18; 3 pre-existing `scout-idea-wizard` "progressive waves" failures reproduce on clean HEAD) · `pnpm test` 1,508 passed · `pnpm build` ✅.
- **Gotchas:** converting now requires a 2–80 char trip title (idea names allow
  120, so an over-long idea name is clamped only on the no-title fallback path).
  `revertToIdea` / `sendTripBackToIdea` run the soft delete in the *same*
  transaction as the idea write, so `deleteTripInTransaction` must be called
  with the existing `ctx` — never nest `tripRepository.remove`. Because an
  unsynced trip insert is still pending, `append` folds the revert's soft delete
  into the existing `insert` mutation (outbox stays at 2 rows), so tests must
  assert the payload's `deletedAt`, not an `update` operation.
  `sendTripBackToIdea` is owner-only in the UI (header + Settings) because its
  delete branch tombstones a shared trip; the idea card stays available to
  whoever owns the local idea.

### 2026-10-27 — Scout wizard: crew-step input & compact idea card

- **Changed:** `features/trip-planner/components/scout-idea-wizard.tsx` — the crew
  step drops the "Enter a number / From my contacts" mode toggle: the three
  `SelectableCard`s (Solo 1, duo 2, small crew 3+) always render; the crew card
  reveals a labeled `type="number"` input (3–20, local `crewSizeDraft` string)
  plus a "Pick from my contacts" outline button that opens the contacts dialog.
  Any `crewSize >= 3` maps to the group reaction. The expanded idea card loses
  its Budget/Savings/Flights/Stay tabs, StatTiles, and savings-timeline card in
  favor of one compact `lg:grid-cols-2` summary panel: budget total + stacked
  proportion bar + flights/stay/daily amounts on the left, savings timeline +
  summary on the right; travelers badge removed (count lives in the budget
  header). The timing step uses a new `compact` variant of `SelectableCard`
  (icon `size-8`, `text-[11px] line-clamp-2` subtitle, `h-full`) in a
  deterministic 2×2 `grid-cols-2`. EN/ES keys pruned
  (`scoutWizardCrewMode*/EnterNumber/FromContacts`, `scoutIdeaTab*` and
  friends); tests updated.
- **Schema:** none.
- **Also changed (Trips page):** `features/trips/components/trip-dashboard.tsx`
  drops the "Want to go" page-swap (`showTripPlanner` + early return + header
  button) — `TripPlannerView embedded` now renders unconditionally as the last
  section of the Trips page, so the wishlist, Scout button, and Add-idea are
  always visible below the trips (zero trips, no matches, and loading all keep
  it). `TripPlannerView` gained optional `onBack` + `embedded` (level-2 "Want
  to go" heading + muted description + shared Scout/Add buttons, section uses
  `aria-labelledby`); non-embedded rendering is unchanged for the `/e2e`
  harness. The Create Trip dialog also gained a create-mode-only "Save as
  idea" secondary action on every step: it validates only idea fields
  (destination is required even though trips allow it empty), skips the
  trip-only date/split/cover rules, and writes a `NewTripIdea` via
  `tripIdeaRepository.create` (targetMonth derived from startDate,
  travelerContactIds from selected contacts; cover + manual travelers
  excluded, disclosed by `copy.saveAsIdeaHelper`). Idea cards now carry an
  "Idea" / "Planned trip" status chip (`convertedToTripId`), converted cards
  hide edit/savings/price sections and show an "Open trip" link + note, and
  the wishlist sorts unconverted first.
- **Also changed (progressive loading):** `askScout()` now fires wave 1 with
  `count: SCOUT_FIRST_WAVE_COUNT` (2) and renders those ideas immediately, then
  fills the rest in a wave-2 call that excludes first-wave destinations (idea
  mode) or `routeSignature`s (route mode). `pendingCount` drives "Scout is
  still finding {{count}} more…" + `ScoutSkeletonCard` placeholders inside the
  results rail, disables "Add more", and a `runId` ref invalidates stale
  wave-2 responses after Try-again/close. The loading view gained a pulsing
  gradient Sparkles tile, a 5-stage rotating status line (2.8s, stops on the
  last), an indeterminate gradient progress bar, and shimmer skeletons — all
  gated by `useReducedMotion`.
- **Gotchas:** the group card stays selected via `crewGroupPicked` even when the
  draft is invalid (crewSize null) so the panel doesn't collapse mid-typing;
  editing the number input while in contacts mode switches back to count mode;
  the proportion bar uses `Number(part*1000n/total)/10` — display-only, not money
  math.
- **Verification:** `pnpm vitest run features/trip-planner lib/i18n` ✅ ·
  `pnpm lint` ✅ · `pnpm typecheck` ✅.

### 2026-10-26 — Scout: exact destination, dates, contacts crew & flight routes

- **Changed:** `scout-trip-ideas-schema.ts` (input `destination`/`startDate`/`endDate`/`excludeRoutes`, `timing:"dates"`, output `continent` + `flight_route`), new `scout-flight-route.ts` (`deriveRouteFacts`, `routeSignature`, `repairRouteContiguity`, `toTripIdeaFlightRoute`), `scout-idea-plan.ts` (`plan.dates = { pinned, shortfallMinor }` bigint), `scout-trip-idea-mapping.ts` (origin/dates/place/contacts/route), `dexie-trip-planner-repository.ts` (normalization), `lib/db/dexie.ts` v48, `app/actions/scout-trip-ideas.ts` (route mode, fallback continents/hubs), `scout-idea-wizard.tsx` (named steps via new `scout-wizard-steps.ts`), new `scout-where-step.tsx`, `scout-crew-contacts-dialog.tsx`, `scout-flight-route-view.tsx`, EN/ES copy + `errors.scoutRouteNeedsAi`.
- **Schema:** Dexie **v48** (`.stores({})` + `.upgrade()` backfilling `travelerContactIds`/`flightRoute` on `tripIdeas`; still local-only — no outbox/Supabase).
- **Gotchas:** route mode never falls back to fabricated routes (returns `scoutRouteNeedsAi` instead); `flight_route` is an estimate gated by `deriveRouteFacts` (<24h for same-date); contact names/ids never leave the device — only crew count reaches the Server Action; `vibe` is `""` in route mode (`interests` stays empty); `where` is always step 1 so pinning a destination just skips `vibe`.
- **Verification:** `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` 224 files / 1,479 tests ✅ · `pnpm build` ✅.

### 2026-10-25 — Scout wizard: conversational co-planner (copy, cards, results)
- **Changed:** `features/trip-planner/components/scout-idea-wizard.tsx` — dialog
  is now "Let's find your kind of trip" (a spoken invitation, not a branded
  feature name); the rail reads *Vibe · The Crew · Budget · Takeoff · Timing*.
  Crew and timing answers are tactile `SelectableCard`s (icon anchor, title,
  subtitle, `aria-pressed`, `ring-2 ring-primary` selected state). Vibe chips
  carry lucide icons and their labels are the exact vibe string sent to Scout.
  **No emoji anywhere in the flow** (explicit user preference) — anchors are
  lucide icons and the CTA is plain text. A `ScoutReaction` line inside the
  speech bubble echoes the pick (`Nothing beats ocean air.`, `Solo trips are the
  best for recharging.`, timing only after an explicit tap). Budget gained
  one-tap `$100 / $250 / $500` pills. Step motion is direction-aware
  (`x: ±18px`) and still gated by `useReducedMotion()`. Results: the first card
  gets a gradient-bordered **Top Match for You** pill and a thicker gradient
  rail, `scout_pitch` renders under the destination (2-line clamp until
  expanded) before any number, and the expanded detail shows the trip goal /
  fare / stay as three labelled stat pills instead of the old book-by tile
  (book-by stays in the savings timeline). New pure module
  `features/trip-planner/domain/scout-budget-presets.ts` (+ test).
  `app/actions/scout-trip-ideas.ts` `SYSTEM_PROMPT` rewritten for a candid,
  well-traveled voice and the two-sentence pitch rhythm (sensory atmosphere →
  practical group ease / simplicity / budget); every hard constraint kept.
  `scout_pitch` descriptions in the Gemini schema and the Zod schema updated to
  match. `selectFallbackCategory` now treats `water|waterside|shore|seaside` as
  beach (the beach chip is no longer literally "Beach and slow mornings").
  EN/ES copy in `lib/i18n/frontend-copy.ts`.
- **Schema:** none. No Dexie bump, no Supabase migration, no outbox change. The
  action contract is unchanged (`scoutTripIdeasInputSchema` untouched).
- **Verification:** `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ 220 files
  / 1,438 tests · `pnpm build` ✅ (21 routes). All five screens reviewed in the
  `/e2e` harness at 1000×900 and 430×900 in EN and ES; the results surface was
  reviewed the same way with a temporary local stub of `askScout` (the harness
  has no signed-in session), which was reverted before committing.
- **Gotchas:** the accessible name of a crew/timing card includes its subtitle,
  so tests must match with a regex (`{ name: /Traveling duo/ }`) while vibe chips
  stay exact. Budget presets are per-currency whole-unit constants, not an FX
  conversion — Scout must not need the network to show them, and
  `scoutBudgetPresets` returns `[]` for an unsupported code instead of throwing.
  The reaction line is derived from state, so typing a custom vibe clears it; the
  timing reaction needs `timingTouched` because `asap` is the default answer.
  `scoutWizardThinking` is now the loading message inside the skeleton block
  (the footer is hidden while loading, so it was previously dead copy). A vibe
  chip label is both display text and the string sent to Scout, so renaming a
  chip changes the deterministic fallback pool — `scout-trip-ideas.test.ts` now
  pins each chip to its pool.

### 2026-10-25 — Scout wizard: calm header, collapsed trip details, fixed footer
- **Changed:** `features/trip-planner/components/scout-idea-wizard.tsx` — the
  dialog title is now "Scout's trip ideas" (the trigger is "Ask Scout for ideas",
  so the two no longer duplicate), the subtitle carries
  `scoutWizardStepProgress` ("Step 5 of 5 · Timing"), the "Scout says · …" row is
  gone, and the rail uses `bg-viatik-blue/40` (past) / `bg-viatik-gradient`
  (current) / `bg-muted` (future). The last screen keeps timing + consent visible
  and moves trip length, exact day count, and free-text constraints into a
  closed-by-default `Collapsible` ("Trip details") that summarizes the current
  values; validation reopens it before focusing an invalid day count. Back / Next
  / Find now render in a fixed `footer` outside the scroll container.
  `components/ui/collapsible.tsx` gained optional controlled `open` /
  `onOpenChange` props (new `collapsible.test.tsx`). Copy changes in
  `lib/i18n/frontend-copy.ts` (EN/ES); `scoutWizardQuestionCount` and
  `scoutWizardScoutSays` were removed.
- **Schema:** none. No Dexie bump, no Supabase migration, no outbox change.
- **Verification:** `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ 219 files
  / 1,427 tests · `pnpm build` ✅ (21 routes). Timing screen reviewed in the
  `/e2e` harness at 430×900 and 1000×900, light and dark, EN and ES, collapsed
  and expanded.
- **Gotchas:** `Collapsible` keeps its panel mounted during the motion exit
  animation, so jsdom tests must assert `aria-expanded` instead of DOM absence
  after collapsing. The wizard footer must stay outside the `overflow-y-auto`
  container or the primary CTA scrolls out of reach on phones. The `/e2e` harness
  has no Supabase session, so **Find my trip ideas** ends in "Sign in again to ask
  Scout" there — results need a real signed-in session.

### 2026-10-25 — Scout wizard: inline validation, required/optional labels
- **Changed:** `features/trip-planner/components/scout-idea-wizard.tsx` now keeps
  **Next enabled** and validates the current step on press instead of disabling
  the button. Vibe, crew, savings, pinned month, exact days, and consent each
  render an inline `role="alert"` error wired with `aria-invalid` +
  `aria-describedby`, and focus moves to the first invalid control. Mandatory
  and optional answers are labelled with a localized `Required` / `Optional`
  pill (bubble hint on steps 1–4, per-field badges on the timing screen).
  Choosing "A specific month" now requires a month. Verbose helper copy was
  shortened in `lib/i18n/frontend-copy.ts` (EN/ES); new keys
  `scoutWizardRequired`, `scoutWizardOptional`, `scoutWizardVibeRequired`,
  `scoutWizardMonthRequired`.
- **Schema:** none. No Dexie bump, no Supabase migration, no outbox change.
- **Verification:** `pnpm typecheck` ✅ · `pnpm lint` ✅ (no warnings) ·
  `pnpm test` ✅ 218 files / 1,422 tests · `pnpm build` ✅ (21 routes). All five
  wizard screens plus the inline vibe/crew/month/consent errors were reviewed in
  a real browser through the `/e2e` harness at 1500×720.
- **Gotchas:** validation lives in `validateStep(step)`; do not reintroduce
  `disabled` expressions for required answers — a disabled Next gives no reason
  and is a dead end on touch. `aria-required` is invalid on `role="group"` (the
  crew chips), so the group exposes `aria-describedby` to its error instead.
  Copy assertions in `scout-idea-wizard.test.tsx` and
  `lib/i18n/i18n-provider.test.tsx` track the exact strings.

### 2026-10-23 — Scout wizard: five screens, optional savings, exact days
- **Changed:** the wizard is now exactly five screens (vibe · crew · budget ·
  departure · timing). The fine-tune screen is gone: pace/comfort, stay style,
  and nonstop are no longer asked (the action receives `balanced` / `either` /
  `false`). Duration is a preset plus an optional exact day count (1–60), and
  the free-text constraint moved onto the timing screen. The AI consent moved
  from the budget screen to the final screen, directly above "Find my trip
  ideas". Savings is optional — an empty amount sends `"0"` and the UI hides
  savings-derived dates. `buildScoutIdeaPlan` now reports `savings.hasPace` and
  anchors a pace-less plan to today instead of a far-future date. The provider
  prompt drops savings/horizons when no pace is set and accepts
  `exactDurationDays`.
- **Schema:** none (Dexie v47 unchanged). Contract change only:
  `scoutTripIdeasInputSchema.durationDays` (1–60, nullable, default null) and
  `savingsCapacityMinor` now accepts `"0"`.
- **Verification:** `pnpm typecheck` ✅ · `pnpm lint` ✅ (no warnings) ·
  `pnpm test` ✅ 218 files / 1,418 tests · `pnpm build` ✅ (21 routes). Budget and
  timing screens reviewed in a real browser at 430px in light mode.
- **Gotchas:** `savingsCapacityMinor === 0n` means "no pace", not "zero money" —
  check `plan.savings.hasPace` before rendering any savings date. The action
  still rejects amounts above `MAX_MINOR_UNITS`.

### 2026-10-23 — Scout wizard: current location, honest step count, detail redesign
- **Changed:** `features/trip-planner/components/scout-idea-wizard.tsx`
  (new `WizardProgress` rail covering all 6 screens, "Use my current location"
  quick action, expanded detail rebuilt as stat tiles + timeline + Budget/Savings/
  Flights/Stay tabs), `app/actions/places.ts` (`reverseGeocodeDestination`),
  `features/trips/components/destination-field.tsx` (new `autoSearch` prop),
  `lib/i18n/frontend-copy.ts` (EN/ES copy), `.ai/specs/scout-idea-wizard.md`.
- **Schema:** none. No Dexie version bump, no Supabase migration, no outbox change.
- **Verification:** `pnpm typecheck` ✅ · `pnpm lint` ✅ (no warnings) ·
  `pnpm test` ✅ 218 files / 1,411 tests · `pnpm build` ✅ (21 routes). The location
  flow and both detail themes were also exercised in a real browser (430px and
  900px, light + dark).
- **Gotchas:** geolocation needs a secure origin (localhost is fine) and is
  unavailable offline; the reverse-geocode action returns a city label only and
  never logs coordinates. Without `GOOGLE_MAPS_API_KEY` it falls back to the
  keyless BigDataCloud endpoint. Radix `Tabs` activates on `mousedown`/focus, so
  component tests must not rely on `click` alone.

### 2026-10-22 — Initialize agent context & persistent memory
- **Changed:** added `memory/MEMORY.md`, `memory/data-models.md`,
  `memory/components-ui.md`, `memory/roles-abilities.md`, scoped
  `.cursor/rules/*.mdc`; rewrote root `AGENTS.md` (kept the auto-generated
  `nextjs-agent-rules` block).
- **Schema:** none (audited Dexie v47 and 83 Supabase migrations).
- **Verification:** `pnpm typecheck` ✅ · `pnpm lint` ✅ (no warnings) ·
  `pnpm test` ✅ 217 files / 1,399 tests · `pnpm build` ✅ (21 routes).
- **Gotchas:** documented in §5. Notable: `proxy.ts` replaces middleware;
  Vitest excludes two home-trips tests; invitation accept/reject is remote-first;
  `mediaTranscripts` PK is `mediaId`.
