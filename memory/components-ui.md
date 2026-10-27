# Viatik UI, Design System & Client/Server Split

> **Authoritative runtime source:** [`app/globals.css`](../app/globals.css) (tokens) and
> [`components/ui/`](../components/ui/) (primitives). The written spec is
> [`.ai/specs/design-system.md`](../.ai/specs/design-system.md); the build protocol is
> [`.ai/skills/ui-component-generator.md`](../.ai/skills/ui-component-generator.md)
> (`READ → SCAN → ASSEMBLE → TEST`). If this document and the code disagree, **the code wins**.
>
> Last audited: 2026-10-23.

## 1. Stack facts

| Concern | Implementation |
|---|---|
| Framework | Next.js **16.3.3** App Router, React **19.2.8**, TypeScript strict |
| Styling | Tailwind CSS **v4** via `@import "tailwindcss"` + `@theme inline` in `app/globals.css` |
| Config | **No `tailwind.config.ts`** — tokens flow through `@theme`. PostCSS: `@tailwindcss/postcss` |
| Primitives | Radix UI (`dialog`, `dropdown-menu`, `tabs`, `label`, `slot`) + `class-variance-authority` |
| Class merging | `cn()` in [`lib/utils.ts`](../lib/utils.ts) = `twMerge(clsx(...))` |
| Icons | `lucide-react` (global `stroke-width: 1.75`) |
| Motion | `motion/react` + `framer-motion`, always gated by `useReducedMotion()` |
| Drag & drop | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
| Fonts | Geist Sans / Geist Mono via `next/font/google` → `--font-geist-sans` / `--font-geist-mono` |
| Images | `next/image` with `images.unoptimized: true` (Capacitor/offline friendly) |
| Mobile | Capacitor 8 (`capacitor.config.ts`, `ios/`, `android/`); `pnpm cap:sync` |
| i18n | `lib/i18n/` — `useI18n().t(key, vars)`, `en` + `es`, enforced by `i18n-coverage.test.ts` |

## 2. Design tokens (`app/globals.css`)

OKLCH tokens on `:root`, overridden on `[data-theme="dark"]` and mirrored for
`prefers-color-scheme`. Key tokens:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `oklch(0.985 0.004 260)` | `#090a0f` | App canvas |
| `--foreground` | `oklch(0.18 0.02 264)` | `oklch(0.95 0.005 264)` | Text |
| `--card` | `oklch(1 0 0)` | `oklch(0.2 0.015 264)` | Cards/popovers |
| `--primary` | `#a855f7` | `#a855f7` | Brand magenta (default fill, links) |
| `--muted` / `--muted-foreground` | — | — | Secondary surfaces/text |
| `--destructive` | `oklch(0.58 0.22 27)` | `oklch(0.55 0.2 27)` | Danger |
| `--success` | `oklch(0.65 0.16 150)` | `oklch(0.58 0.15 150)` | Success |
| `--border` / `--input` / `--ring` | — | — | Hairlines, inputs, focus |
| `--side*` (`--side`, `--side-active`, …) | — | — | Sidebar chrome |

Brand palette (registered as Tailwind colors):

- `viatik-blue` `#0ea5e9` — structural depth
- `viatik-magenta` `#a855f7` — primary brand / focus
- `viatik-red` `#f43f5e` — **reserved for primary CTAs & critical actions**
- `surface-dark` `#090a0f`

Helpers: `.bg-viatik-gradient` (blue→magenta→red, 135deg), `.glow-viatik`,
`.glow-magenta`.

Radii: `--radius: 0.75rem`; `rounded-lg` = default for buttons/inputs,
`rounded-2xl` = default for cards/dialogs/panels.

## 3. Component inventory (`components/ui/`)

| Component | Notes |
|---|---|
| `Button` | `variant`: `primary` (magenta→red CTA gradient), `default`, `secondary`, `ai` (blue tint), `destructive`, `outline`, `ghost`, `link`. `size`: `default`/`lg` (`h-11`), `sm` (`h-9`), `icon` (`size-11`). Supports `asChild`. |
| `Card` | `CardHeader/CardTitle/CardDescription/CardContent`; `glass` prop toggles translucent blurred surface. `p-5` gutters. |
| `Dialog` | Radix wrapper: `Dialog`, `DialogTrigger`, `DialogClose`, `DialogContent/Header/Footer/Title/Description`. |
| `DropdownMenu` | Radix wrapper (see exports in file). |
| `Tabs` | Radix: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`. |
| `Badge` / `StatusBadge` | CVA badge variants; `StatusBadge` is a lightweight pill. |
| `Heading` | Semantic heading levels + `headingVariants`. |
| `Input` / `Label` | Base form controls. |
| `IconTile` | Square icon container used by the shell/nav. |
| `UserAvatar` | DiceBear avatars: `parseAvatarSeed`, `randomAvatarSeed`, `avatarDataUri`, `AvatarStyle`, presence status. |
| `AvatarPicker` | Seed/upload avatar selection; `fileToDataUrl` helper. |
| `ConfirmDialog` | Destructive-action confirmation. |
| `Collapsible` | Disclosure primitive. |
| `Toast` | `ToastProvider`, `Toaster`, `useToast()` (mounted in `app/(app)/layout.tsx`). |
| `dialog-dismiss.ts` | `isDialogDismissExempt()` keeps portaled place results, Radix popper menus and nested dialogs from dismissing the parent dialog. Reuse it instead of ad-hoc event hacks. |

`components/app-shell/`: `app-shell.tsx` (sidebar + mobile bottom nav + skip link),
`sync-status-pill.tsx`, `sync-error-banner.tsx`, `theme-toggle.tsx`,
`language-switcher.tsx`. `components/pro/command-palette.tsx` is the ⌘K palette.
`components/error-boundary.tsx` wraps the app.

## 4. Layout hierarchy

```
app/layout.tsx                       SERVER  <html> fonts, ThemeInitScript, I18nProvider,
                                             RecoveryLinkCatcher, ErrorBoundary
├── app/(auth)/…                     login | register | forgot-password | reset-password | onboarding
├── app/(app)/layout.tsx             SERVER  auth guard (redirect /login), profile guard
│                                    (redirect /onboarding), then:
│                                    DatabaseProvider → SyncProvider → ToastProvider → AppShell
├── app/(app)/home                   dashboard / timeline
├── app/(app)/trips, trips/[tripId]  trip list + trip workspace
│                                    tabs: overview · itinerary · tasks · map · money ·
│                                          photos · people · journal · settings
│                                    (overview also hosts packing / health / polls / vault tools)
├── app/(app)/contacts, /community, /notifications, /settings, /gemini
├── app/share/[slug]                 PUBLIC guest view (no auth)
└── app/auth/confirm                 password-recovery link landing
```

Nav links (desktop sidebar + mobile bottom bar): `/home`, `/trips`, `/contacts`,
`/community` (marked *coming soon*, disabled), `/settings`. Root `proxy.ts`
(Next 16's renamed middleware) refreshes the Supabase session and redirects
unauthenticated users away from protected paths.

## 5. Client/server split — the hard rules

`'use client'` is required for **anything that touches** Dexie, `liveQuery`,
Zustand (`lib/store/ui-store.ts`), `window`/`localStorage`, Radix portals, DnD,
media capture, or `useSyncStatus`. 115 files currently declare it.

| Layer | Kind | Rule |
|---|---|---|
| `app/**/layout.tsx`, `app/**/page.tsx` | Server by default | May call Supabase **server** client (`lib/supabase/server-client.ts`) for auth/profile gating only. No Dexie. |
| `app/actions/*.ts` | Server Actions | Auth, profile, places, weather, exchange rates, Scout/Gemini generation. Never import Dexie. |
| `app/(app)/**/*-client.tsx`, `app/(auth)/**/*-form.tsx` | Client | Interactive shells; may use Dexie via repositories. |
| `features/**/components/*.tsx` | Client | Nearly all feature UI is client (they read live data). |
| `features/**/data/dexie-*.ts` | Client-only module | Repositories; must not be imported by server components. |
| `features/**/lib/*.ts` (pure) | Isomorphic | Money math, ordering, status resolution — no browser APIs. |
| `lib/sync/*`, `lib/db/*` | Client | Outbox/engine/provider. `lib/db/database-provider.tsx` instantiates the DB inside `useEffect` so it never runs during SSR. |

Practical rule: a page is a thin server component that renders one client
workspace component. If you need Dexie data during render, do it in a hook
inside the client tree, never in the server component.

## 6. Data-access hooks

Repositories expose `watch*` methods built on `dexie`'s `liveQuery`; hooks
subscribe in `useEffect` and return the disposer. There is **no generic `useTrip`
hook** — the trip workspace uses `tripRepository.watchById`.

| Hook | File | Purpose |
|---|---|---|
| `useDatabase()` | `lib/db/database-provider.tsx` | Current namespaced Dexie instance |
| `useSyncStatus()` | `lib/sync/use-sync-status.ts` | status, pending/retryable counts, conflicts, online state |
| `useSyncRetryCountdown()` | `lib/sync/use-sync-status.ts` | retry countdown + manual retry |
| `useI18n()` | `lib/i18n/i18n-provider.tsx` | `locale`, `setLocale`, `t()` |
| `useToast()` | `components/ui/toast.tsx` | transient notifications |
| `useHomeData()` | `features/trips/components/home/use-home-data.ts` | home timeline aggregation |
| `useTripBalances()` / `useSettlement()` | `features/expenses/lib/` | ledger + pairwise debts + transfers |
| `useTripSpending()` | `features/finance/lib/use-trip-spending.ts` | budget pacing |
| `useTravelJournal()` | `features/journal/lib/use-travel-journal.ts` | journal entries |
| `useSharedTripFeed()` / `useRecentActivity()` | `features/feed/lib/` | collaborative feed |
| `useEmergencyCenterData()` | `features/emergency/lib/` | emergency center |
| `useTransitSegments()` | `features/transit/components/use-transit.ts` | flights/trains |
| `useLocalProfile()` | `features/profile/lib/use-local-profile.ts` | offline profile mirror |
| `useTripCrew()` | `features/trips/components/trip-task-dialog.tsx` | task assignee roster |
| `useAudioRecorder()` | `features/media/lib/use-audio-recorder.ts` | voice notes |

Canonical hook shape:

```tsx
const [trips, setTrips] = useState<Trip[] | null>(null);
useEffect(() => tripRepository.watchAll(setTrips), []);
```

## 7. Interaction & accessibility conventions

- **44×44px minimum touch target** (`h-11`, `size-11`). `sm` (`h-9`) only in dense toolbars.
- Focus: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.
- Radix owns keyboard/focus-trap/Esc — do not reimplement.
- Use `aria-expanded`/`aria-controls` for disclosure, `role="region"` + `aria-labelledby`
  for panels, `role="alert"`/`aria-live` for status, `aria-label` on icon-only buttons.
- Motion tokens: surfaces `duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]`; overlays
  `0.15s` opacity+scale; interactive `duration-200 ease-out active:scale-[0.98]`.
  `prefers-reduced-motion` is handled globally in `globals.css`.
- Mobile-first: stack, then `sm:`/`md:`; `DialogFooter` is `flex-col-reverse sm:flex-row`.

## 8. Copy & localization

All user-facing strings go through `t("...")` with keys in
`lib/i18n/translations.ts` (and `lib/i18n/frontend-copy.ts` for larger copy blocks).
`lib/i18n/i18n-coverage.test.ts` fails when a key is missing from either locale.
Errors surfaced to users use `lib/i18n/localize-error.ts` (`localizeThrownError`)
and `lib/i18n/error-copy.ts`. Locale persists in `localStorage["viatik-language"]`
(`en` | `es`); theme persists in `localStorage["viatik-theme"]`.

## 9. Testing UI

- Vitest + jsdom + Testing Library (`vitest.config.mjs`, `vitest.setup.mjs`),
  `fake-indexeddb` for repository tests.
- Tests are colocated: `component.test.tsx`, `repository.test.ts`.
- Two files are intentionally excluded from Vitest:
  `features/trips/lib/home-trips-temporal.test.ts` and
  `features/trips/components/home/home-page.test.tsx` (see `exclude` in `vitest.config.mjs`).
- E2E: Playwright (`e2e/`, `pnpm test:e2e`), plus a smoke route at `/e2e`.

## 10. UI gotchas

- **Hydration:** theme/language are read from `localStorage` only after mount.
  `ThemeInitScript` re-applies preferences in `useLayoutEffect` before paint, and
  `I18nProvider` starts at `"en"` to match server HTML. Never read
  `localStorage` during render.
- `suppressHydrationWarning` on `<html>` is intentional (theme attribute).
- Server components must never import a repository — it will pull Dexie into the
  server bundle and fail at build/runtime.
- `next/image` is `unoptimized`; remote images need explicit sizing to avoid CLS.
- Radix portaled content inside dialogs needs `isDialogDismissExempt()` guards.
- `lucide-react` icons inherit `size-5` from `Button`; pass `aria-hidden` when decorative.
- Radix `Tabs` activates on **focus/mousedown**, not `click`; tests must use
  `fireEvent.mouseDown(tab, { button: 0 })`. Inactive `TabsContent` unmounts, so
  keep always-visible actions (e.g. provider links) outside the tab panels.
- `DestinationField` (`features/trips/components/destination-field.tsx`) takes
  `autoSearch={false}` to suppress the suggestion dropdown while a value is
  filled programmatically (device location). Re-enable it when the traveler types.
- `Collapsible` accepts controlled `open` / `onOpenChange` (added 2026-10-25) as
  well as `defaultOpen`. Its panel stays mounted through the motion exit
  animation, so jsdom tests assert `aria-expanded` rather than DOM absence after
  collapsing.

## 11. Scout wizard patterns (`features/trip-planner/components/scout-idea-wizard.tsx`)

- **Named steps:** `getScoutWizardSteps(hasDestination)`
  (`features/trip-planner/domain/scout-wizard-steps.ts`) returns the ordered id
  list — idea mode `where · vibe · crew · budget · takeoff · timing` (6), route
  mode skips `vibe` (5). `where` is always first so toggling the destination
  never shifts the step. `WizardProgress`/`stepId`/`validateStep` key off ids,
  not indexes.
- **Where step:** `ScoutWhereStep` (`scout-where-step.tsx`) = `DestinationField`
  (Places autocomplete; `placeId/latitude/longitude/timeZone` kept client-side)
  - a "Surprise me" card that clears the destination. Empty = idea mode.
- **Crew:** count cards or "From my contacts" — `ScoutCrewContactsDialog`
  (`scout-crew-contacts-dialog.tsx`, nested dialog) multi-selects Dexie contacts
  via `contactRepository.watch(ownerId)`; badge for `linkedProfileId`; cap 19.
  crewSize = 1 + selected; contact data never reaches the Server Action.
- **Timing:** four cards — exact dates (`timing:"dates"`, two `type="date"`
  inputs validated start ≥ today, end ≥ start, ≤60 days), calculate-for-me
  (asap), month, cheapest. Exact dates hide trip-length/exact-days and the badge
  shows "N days".
- **Results:** `FlightRouteSummary`/`FlightRouteLegs`
  (`scout-flight-route-view.tsx`) render `A → B → C`, stops, elapsed time, and
  same-day/next-day badge from `deriveRouteFacts` (never same-day ≥24h); idea
  mode adds a continent chip; route mode titles cards "Route option N".
  `plan.dates.pinned` shows pinned dates + `shortfallMinor` line in the savings
  section; flight submodal lists legs + estimate note.
- **Voice:** dialog title **Let's find your kind of trip** — a spoken invitation,
  never a branded feature name; rail labels
  *Vibe · The Crew · Budget · Takeoff · Timing*; questions are invitations
  ("Picture your next getaway…", "Who are we scheming this trip for?") and every
  helper line is Scout speaking in the first person.
- **Progress rail:** `WizardProgress` renders one segment per screen (5) and is
  the only step indicator; the header subtitle carries
  `copy.scoutWizardStepProgress` ("Step 5 of 5 · Timing"). Past segments use
  `bg-viatik-blue/40`, the current one `bg-viatik-gradient`, future `bg-muted`.
  Never cap the counter below the real screen count.
- **Trigger vs title:** `copy.scoutWizardTrigger` ("Ask Scout for ideas") is the
  planner button; `copy.scoutWizardTitle` ("Let's find your kind of trip") is the dialog
  heading. They must stay different strings — reusing one for both reads as a
  duplicated screen.
- **No emoji.** The user explicitly rejected emoji in this flow. Answer anchors
  are `lucide-react` icons (Waves / Building2 / Trees, User / Heart / Users,
  PiggyBank / CalendarDays / TrendingDown), always `aria-hidden`, and the
  primary CTA is plain text.
- **Answer primitives:** vibe is a row of chips (icon + label, where the label
  *is* the value sent to Scout); crew and timing use `SelectableCard`
  (`rounded-xl border border-border/80 bg-card/60 p-4`, selected
  `ring-2 ring-primary border-primary bg-primary/5 shadow-sm`) with a
  `LucideIcon` anchor and an optional subtitle. Both expose `aria-pressed`;
  never convey selection with color alone.
- **Micro-feedback:** `ScoutReaction` renders one line in an `aria-live` region
  inside the bubble. It is *derived* from the current answer (custom vibe text
  clears it) and timing needs the `timingTouched` flag because `asap` is the
  default. Keep reactions to one short sentence.
- **Budget:** optional amount plus `scoutBudgetPresets(currency)` pills
  (`features/trip-planner/domain/scout-budget-presets.ts`). Presets are
  per-currency whole-unit constants in minor units — no FX lookup, because the
  wizard must render offline. Pills set the input via `decimalFromMinorUnits`.
- **Last screen:** timing + consent stay visible. Trip length, exact day count,
  and free-text constraints live in a closed-by-default `Collapsible`
  (`scout-trip-details`) whose badge summarizes what is set; `validateStep`
  reopens it before focusing an invalid day count.
- **Fixed footer:** Back / Next / Show my trip ideas live in a `<footer>` sibling
  of the `overflow-y-auto` body, never inside it — otherwise the primary CTA
  scrolls out of reach at 430×900.
- **Motion:** the step panel is keyed by `step` and slides in the travel
  direction (`x: 18 * direction`, `direction` set by `goNext` / `goBack`), always
  behind `useReducedMotion()`.
- **Validation:** Next is never disabled for a missing answer. `validateStep`
  checks the fields owned by the current step (vibe ≥ 2 chars, crew, savings
  parse, pinned month, exact days, consent), writes per-field errors, and moves
  focus to the first invalid control. Each error is inline (`role="alert"`) with
  `aria-invalid` + `aria-describedby`; errors clear as the traveler edits.
  Mandatory/optional answers carry a localized `Required` / `Optional` pill
  (`RequirementHint`): bubble hint on the first four screens, per-field badges on
  the timing screen.
- **Savings is optional:** an empty amount sends `"0"`; check
  `plan.savings.hasPace` before rendering any savings date, and show
  `copy.scoutIdeaNoSavingsPace` instead.
- **Device location:** the departure screen's "Use my current location" action
  calls `navigator.geolocation.getCurrentPosition` once (10s timeout, coarse) and
  then `reverseGeocodeDestination` (`app/actions/places.ts`, Google Geocoding when
  `GOOGLE_MAPS_API_KEY` is set, keyless BigDataCloud otherwise). Only the city
  label enters wizard state; coordinates are never stored or sent to the AI.
  Denied/unavailable/timeout/unresolved each have their own localized message.
  `DestinationField` gets its own short `helpText` so the bubble and the field
  never repeat the same sentence.
- **Results:** rows lead with the destination, the **Top Match for You** pill
  (gradient border, first card only, which also gets a thicker gradient rail),
  the `scout_pitch` clamped to two lines, and only then the trip goal pill +
  duration. The expanded detail opens with season/traveler/cabin/stops badges,
  then three stat pills (trip goal = gradient, fare = blue, stay = magenta), a
  today → book-by → goal-reached timeline, then `Tabs` (Budget · Savings ·
  Flights · Stay) with a 2×2 grid on mobile and 4-up on `sm`. Provider submodals
  stay in the always-visible footer next to the save CTA.
- **Loading:** skeletons are preceded by `copy.scoutWizardThinking` ("Scout is
  matching routes, stays, and vibes...") inside the `aria-busy` region.
