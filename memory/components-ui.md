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
- **Crew:** three `SelectableCard`s — Solo (1), duo (2), small crew (3+). Picking
  the crew card reveals a `type="number"` input (3–20, local string draft) plus a
  "Pick from my contacts" outline button that opens `ScoutCrewContactsDialog`
  (`scout-crew-contacts-dialog.tsx`, nested dialog) multi-selecting Dexie
  contacts via `contactRepository.watch(ownerId)`; badge for `linkedProfileId`;
  cap 19. crewSize = 1 + selected; contact data never reaches the Server Action.
  Editing the input while in contacts mode switches back to a plain count.
- **Timing:** four compact (`compact` prop on `SelectableCard`, 2×2
  `grid-cols-2`) cards — exact dates (`timing:"dates"`, two `type="date"`
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
  duration. The expanded detail opens with season/cabin/stops badges, then one
  compact `lg:grid-cols-2` summary panel: left = trip goal total + traveler
  count + an aria-hidden stacked proportion bar (flights blue / stay magenta /
  daily muted) + a 3-column `dl` with each leg's amount and one-line detail;
  right = the today → book-by → goal-reached timeline, pinned-dates/shortfall
  lines, and the summary sentence. Flight/Stay detail dialogs and the save CTA
  sit in one action row (`sm:flex-row`, save = `sm:flex-[1.4]` gradient).
- **Loading:** the wave-1 wait shows a pulsing gradient `Sparkles` tile, a
  2.8s rotating stage line (`scoutWizardStage1..5`, stops on the last), an
  indeterminate gradient bar, and `SCOUT_INITIAL_IDEA_COUNT` `ScoutSkeletonCard`
  shimmers (all behind `useReducedMotion`, inside `aria-busy`/`aria-live`).
- **Progressive results:** `askScout()` requests `SCOUT_FIRST_WAVE_COUNT` (2)
  ideas first, renders them at once, then requests the remainder excluding
  first-wave destinations (idea mode) or `routeSignature`s (route mode).
  `pendingCount` renders a "Scout is still finding n more…" `role="status"`
  line plus shimmer placeholders inside the results rail and disables "Add
  more"; a `runId` ref drops stale wave-2 responses after Try-again/close.
  Wave-2 failures keep the first wave and surface the normal inline error.

## 12. Trips page (`features/trips/components/trip-dashboard.tsx`)

- The Trips page is a **single view**: header (eyebrow, H1, "Create trip"),
  `MetricsRow`, search, invitations, then trips (skeleton / `EmptyTrips` /
  no-matches / `SegmentedTabs` Upcoming-Past), and finally
  `<TripPlannerView userId embedded />` rendered **unconditionally** as the
  last section — the wishlist, Scout wizard trigger, and Add-idea button are
  always on the page. There is no ideas tab and no page swap.
- `TripPlannerView` (`features/trip-planner/components/trip-planner-view.tsx`)
  takes optional `onBack` + `embedded`. Embedded mode replaces the back
  button/eyebrow/H1 header with a `sm:flex-row sm:items-end` section header:
  level-2 `Heading` "Want to go" (`id`ed, referenced by the section's
  `aria-labelledby`) + the device-local `tripPlannerDescription`, and the same
  shared action buttons. Non-embedded rendering is unchanged (still used by
  the `/e2e` harness).
- `TripFormDialog` (create mode only) has a "Save as idea" outline button on
  every step: it validates only name/destination/notes bounds (destination is
  required for ideas), skips the trip date/split/cover checks, and calls
  `tripIdeaRepository.create`; `onIdeaSaved` fires a success toast.
- `TripIdeaCard` shows a status chip ("Idea" muted / "Planned trip" success)
  driven by `convertedToTripId`; converted cards drop Edit, savings, and price
  sections, keep the "Open trip" link + delete, and add a muted note. The
  planner list stable-sorts unconverted ideas first.
- **Convert asks for the trip title.** "Plan this trip" only opens a
  `TripPlannerView`-owned dialog (`planner-trip-title` input prefilled with the
  idea name, 2–80 chars, `tripIdeaTripTitleError`); the conversion itself runs
  from `submitPlan`, so the card's `onConvert` is a plain `() => void` and the
  card no longer owns conversion state or errors.
- **`RevertToIdeaDialog`** (`features/trip-planner/components/revert-to-idea-dialog.tsx`)
  is the single "set back as idea" confirm. It never auto-picks a side: two
  option cards offer "Keep trip and set back" (`deleteTrip: false`) and
  "Delete trip and set back" (`deleteTrip: true`), plus Cancel. Both callers
  (`TripIdeaCard`, `TripIdeaLinkSection`) pass `onRevert` and let the dialog
  own pending/error state.
- **`TripIdeaLinkSection`** (`features/trip-planner/components/trip-idea-link-section.tsx`)
  renders on the trip Settings tab only when `tripIdeaRepository.watchByTripId`
  finds the idea that created the trip and `canSendBack` (owner) is true.
  "Keep trip" fires a success toast; "Delete trip" `router.replace("/trips")`.
- **Trip header action:** the workspace header's owner action row
  (`trip-workspace.tsx`, next to Share) has "Set back as idea" for **any** trip,
  wired to `tripIdeaRepository.sendTripBackToIdea(trip.id, { deleteTrip })`.
  That method reuses the linked idea when there is one, otherwise builds an idea
  from the trip + `tripBudgets` row, so trips made with "Create trip" also work.
  It is owner-only because the delete branch tombstones a shared trip.

## Wish-list idea card (2026-10-29)

- **Destination is the headline.** `TripIdeaCard` renders `idea.destination` as
  the `h2`. Never render `idea.name` as the title: it repeats the city.
- **The season leads with its value.** Scout stores the recommended window as a
  `Best season: …` line in `idea.notes`; `extractBestSeason()` reads it and
  `splitSeason()` separates the month range from the trailing descriptor on `·`.
  The header renders an amber sun badge, a 10px uppercase label
  (`Best time to go` / `Mejor época para ir`), the range at 15px semibold in
  `text-foreground`, and the descriptor at 13px muted underneath. A hand-written
  name (no `Best season:` line) falls back to a plain muted subtitle with no
  label. Never dump the raw string unlabeled, and never let the label outweigh
  the value — "dic – abr · días cálidos" means nothing on its own.
- **Fact tiles, not an inline `<dl>`.** Origin / When / Travelers / Duration are
  four `FactTile` items inside one `<dl>` (`auto-rows-fr grid-cols-2 sm:grid-cols-4`),
  each a `h-full min-h-20 rounded-xl border` tile with an accent color per type
  (`FACT_ACCENTS`: blue origin, magenta when, emerald travelers, amber duration),
  a 28px tinted icon badge, a 10px uppercase label, and a 14px semibold value.
  Labels must stay short enough to fit on one line ("Salida", not "Lugar de
  salida"); the grid uses `auto-rows-fr` so tiles never end at different heights.
- **Budget block.** One `rounded-2xl` section: an 11px uppercase heading, the
  total at `text-2xl` tabular-nums, an optional unallocated chip, then a
  proportional `BudgetBar` (one segment per category, `CATEGORY_BAR_STYLES`)
  and a two-column legend with amount + rounded percentage. `formatMinorUnits`
  already prints the currency symbol — never append the ISO code again.
- **Notes stay out of the card.** `idea.notes` (the mapper stores
  `"<pitch>\n\nBest season: …"`) is intentionally **not** rendered on the card;
  the title/season subtitle, facts, budget and map carry the view. Do not
  re-add a "Scout's note" panel without an explicit request.
- **Map panel** (`IdeaMapCard`, `features/trip-planner/components/idea-map-card.tsx`):
  keyless OpenStreetMap embed with a marker when coordinates exist and the device
  is online; otherwise a static location tile with a status line and an external
  OSM link. `autoResolve` geocodes once on mount (used by the Scout detail);
  `onResolveLocation` persists coordinates through
  `tripIdeaRepository.updateIdea`. Rendering never requires a network round-trip.
- **Primary CTA** uses `bg-viatik-gradient text-white`, matching the Scout
  wizard's save button.

## Savings plan timeline (2026-10-29)

- `SavingsPlanner` reads as three plain sentences in a timeline: **Start saving**
  (`$2,045 every month` + `From today until <date>`), **Buy the flights**
  (`By <date>` + booking window), **You travel** (`On <date>`). A goal card on
  top carries the target, a gradient progress bar, and `{{current}} of
  {{target}}`. Do not split "how much" from "from when to when" — that was the
  original complaint: the numbers were there but the sentence was not.
- When the target is already covered the first step says `Goal already covered`
  instead of quoting a zero contribution; a past trip shows the remaining amount
  with `The goal is due now`.
- `calculateSavingsSuggestion` now returns `readyOn` and `bookBy` (ISO dates) on
  both `scheduled` and `due-now`, and accepts an optional `bookingWindowDays`.
  `bookBy` is clamped to today, so it can never quote a past date.
- The booking window lives in `domain/flight-booking-window.ts`
  (`flightBookingWindowDays`), shared with `scout-idea-plan` so Scout's timeline
  and the saved plan never disagree.
- Missing inputs (no start date or no target) show the explanation and still
  render the `Trip departs` step — never invent a schedule.

## Idea plan comes from Scout's answers (2026-10-29, schema v49)

- `tripIdeas` now persists `savingsCapacityMinor`, `savingsCadence`, `timing`,
  `targetMonth`, `tripLength` and `constraints`. **`targetMonth` used to be
  dropped by `mapScoutIdeaToTripIdea`** — if you add a Scout answer, persist it
  there or the card can never use it.
- `buildIdeaSchedule` (`domain/idea-schedule.ts`) is the single source of dates:
  pace-driven when the idea carries a savings capacity, date-driven otherwise.
  It returns `contributionMinor`, `periods`, `readyOn`, `bookBy`,
  `departureStart`/`departureEnd` (≤30 days) and `shortfallMinor`.
- **Never derive dates from the free-text "best season".** The season is months
  long and the traveler rejected it as a plan input. If there is no pace and no
  pinned date/month, the card says what is missing instead of estimating.
- `flightBookingWindowDays(fare, currency)` converts the fare to USD first; the
  700 threshold is USD, so raw MXN/JPY amounts used to look long-haul.

## Scout loading state (2026-10-29)

- `features/trip-planner/components/scout-loading-state.tsx` owns the search
  screen: `ScoutOrbit` (the `Scout.png` fennec inside a rotating conic-gradient
  ring, with Plane/Bed/MapPin/Compass orbiting and counter-rotating), the stage
  line, a gradient progress bar with a magenta glow, and brand-tinted shimmer
  skeletons (`ScoutSkeletonCard`, also used for the "add 2 more" placeholders).
- Use `--color-viatik-blue` / `--color-viatik-magenta` / `--color-viatik-red` in
  inline gradients — Tailwind v4 `@theme` tokens, not `--viatik-*`.
- Everything is transform/opacity only and every animation is gated by
  `useReducedMotion()`; the reduced-motion path renders a still mascot with no
  orbit.

## Idea plan sentence (2026-10-29)

- The card states the plan as **one paragraph of three sentences**, in this
  order: *start setting aside `<amount>` every `<unit>` for `<periods>`* →
  *book the flights by `<date>`* → *the trip could be `<range>`*. Not a header
  date line, not separate tiles: `tripIdeaPlanSaveLead/Tail`, `tripIdeaPlanBuy`,
  `tripIdeaPlanTravel`.
- It renders only when `buildIdeaSchedule` can produce dates. With a covered
  goal the first sentence becomes `tripIdeaPlanGoalMet`.
- Style: `rounded-2xl` panel with a blue→magenta wash, the amount in
  `font-semibold tabular-nums`, `text-sm leading-relaxed`.

## Scout loading until five ideas (2026-10-29)

- `askScout` accumulates the first wave plus the top-up and only calls
  `setSuggestions` once five ideas are ready (or the top-up resolves/fails).
  Partial results are **not** revealed: showing two cards and three placeholders
  read as unfinished work. `pendingCount` is no longer used for the first wave.
- Do not reintroduce "still finding N more…" between waves; the loading state
  owns that period.

## Idea card tabs + colored tags (2026-10-29, schema v50)

- The saved idea card is **tabbed into three**: Overview · Details · Savings (the
  last one only while the idea is unconverted). **Details merges flights, stay and
  daily** under small uppercase section headings. Grid follows the visible count
  (`grid-cols-2` converted, `grid-cols-3` otherwise). Do not split Details again —
  a Daily tab was added and reverted on request. The **Prices** tab is parked
  behind `SHOW_PRICE_TAB = false` in `trip-idea-card.tsx` — the trigger, the
  manual price-check form and its copy are all still wired, so flipping the flag
  restores it. Its two tests in `trip-planner-view.test.tsx` are `it.skip`ped. Tabs sit directly
  under the fact tiles; the map moved inside Overview. Triggers share
  `TAB_TRIGGER` (stacked icon + 11px label, `grid-cols-3 sm:grid-cols-6`) so every
  cell is the same size. Radix `Tabs` activates on mousedown, so tests must use
  `fireEvent.mouseDown` on the trigger, not `click`.
- Action cluster: the secondary actions (Edit / Set back + Delete) live in one
  **segmented control** — `overflow-hidden rounded-xl border`, inner `Button
  variant="ghost"` with `rounded-none` and a 1px divider — and the primary CTA
  (gradient + soft magenta shadow) sits beside it. Everything is `min-h-11`; on
  mobile the group is `flex-1` so nothing wraps. Each segment carries its own
  colour: **Edit = viatik-blue**, **Set back = amber**, **Delete = destructive**
  (tinted `bg-*/5`, stronger `bg-*/15` on hover), so the action type is readable
  before the label. Icons are `size-4` for weight parity with the labels.
- The plan is a **single short line above the fact tiles**, never collapsed:
  `Save <amount> per <unit> for <periods> · trip <range>` with the amount and the
  range in `<strong>`. Fact tiles are compact (`min-h-16 p-2.5`, 24px badge).
- Every tab panel uses `TAB_PANEL` (`h-[22rem] overflow-y-auto`) so switching
  tabs never resizes the card; taller content scrolls inside the panel.
  `SavingsPlanner` takes `bare` when embedded: no card chrome, no heading, no
  disclosure, and a **compact** layout — one row for the goal + progress, one
  1.5px line per step (`amount · cadence · periods`, `buy by`, `travel range`)
  with no uppercase labels or hints, and the input + save on a single row.
- Overview puts the **budget in a collapsible** (`Budget · <total>` when closed)
  and the **map below it**. Label is short: `Budget` / `Objetivo`. The collapse
  changes only how the section is folded — the inside keeps its heading, bar and
  breakdown exactly as before.
- Tabs: one brand accent only — inactive neutral (`text-muted-foreground`),
  active `bg-card` + `ring-viatik-magenta/30` + soft shadow. Labels are **12px
  sentence case** (`text-xs font-semibold`, no uppercase), icons 18px, cells
  `min-h-14`. Uppercase 10px was too small to read. Per-tab colour coding was tried and rejected as too busy; keep a single
  accent.
- Budget panel: the header — uppercase `Objetivo` + 24px amount + unallocated
  chip — is **always visible**. The chevron is an icon button pinned to the
  section's **top-right corner** (`absolute right-2 top-2`, 36px, `aria-expanded`
  + `aria-controls`), not a row of its own. Opening it renders, with **no top
  margins** (label `mt-2`), the `Cómo se reparte` label, the proportional bar and
  the category rows. The label only exists while open. The panel animates with
  `AnimatePresence` + `height: 0 → auto` and opacity (`0.26s`,
  `cubic-bezier(0.23,1,0.32,1)`), gated by `useReducedMotion`; the chevron shares
  that easing at `duration-300`.
- Tab column count follows the visible tab count (`grid-cols-2 sm:grid-cols-4`
  when converted, `grid-cols-3 sm:grid-cols-6` otherwise) and every trigger uses
  `TAB_TRIGGER` (`h-full min-h-12`, stacked 16px icon + 11px label) so no cell
  is taller or narrower than its neighbours.
- The status pill ("Idea" / "Planned trip") is **commented out** on request; the
  gradient rail already signals the state. Do not re-enable it without asking.
  Interest chips are colour-coded by vibe through `interestTone()` (beach → blue,
  city → magenta, nature → emerald, food → amber, default → muted). The matcher
  covers EN and ES keywords because the vibe is stored in the language Scout
  answered in.
- `tripIdeas` (v50) stores `flightCostPerPersonMinor`, `hotelPerNightMinor`,
  `altStayPerNightMinor` and `dailyPerPersonMinor`, so Flights/Stay/Daily show
  Scout's own numbers. When they are null (legacy rows) the card derives
  averages from `categoryEstimates` instead.

## Trip date labels (2026-10-29)

- All trip dates go through `domain/date-format.ts`
  (`formatTripDay`, `formatIsoTripDay`, `formatTripRange`). **Months are always
  capitalized**, including in Spanish (`29 Oct 2027`, not `29 oct 2027`), and the
  trailing dot some locales add is stripped. Do not hand-roll
  `Intl.DateTimeFormat` in a component.
- The compact savings rows bold the actionable values: amount, book-by date and
  travel range. Keep that emphasis — the labels alone are not the information.

## Idea tab content (2026-10-29)

- `DetailStat` takes an `accent` (blue / magenta / emerald / amber) that tints the
  tile border and background, prints the value at `text-lg font-bold tabular-nums`
  and the hint at 13px. Use it for every number inside a tab so the panel reads as
  a grid of comparable figures.
- Flights legs are cards with a 2px blue rail on the left, `from → to` in
  semibold and the duration right-aligned in tabular figures; a layover renders as
  an amber chip with a clock icon.
- Stay shows hotel and rental side by side (magenta / emerald) plus the total in
  blue; Daily shows food (amber) and activities (emerald) plus the per-person
  total in blue.

## Ahorro tab (2026-10-29)

- Compact (`bare`) savings panel: goal card (`OBJETIVO` label, 18px bold amount,
  `%` in magenta, 6px gradient bar) then three steps with 28px tinted icon badges
  — PiggyBank magenta (amount + cadence + months), PlaneTakeoff blue (book-by
  date), CalendarClock amber (travel range + days). Input + save share one row.
- No bullet dots: the icon badges carry the colour coding, same language as the
  Flights/Stay/Daily tabs.

## Editing an idea (2026-10-29)

- `TripIdeaForm` already binds every field to the idea, but the **budget section
  used to start closed**, so the target cost, the estimates and the notes looked
  missing when editing. It now opens by default whenever the idea carries a
  target, estimates or notes, and the trigger shows the target as a `badge` so it
  is visible even when collapsed.
- Covered by `trip-idea-form.test.tsx` → "prefills every field and opens the
  budget section".

## Filling the edit form (2026-10-29)

- When editing, `TripIdeaForm` shows a **Scout context** block at the top
  (magenta panel): savings pace (`MX$2,000 / mes`) and the free-text preferences.
  The budget section opens by default and its trigger carries the target amount.
- Every prefilled value must be visible without expanding anything the traveler
  did not collapse themselves.

## Edit form tabs (2026-10-29)

- `TripIdeaForm` has **two tabs**, and that is intentional: **Viaje** (tinted
  blue: name/origin/destination/interests, dates/month/duration, adults/children)
  and **Detalles** (tinted magenta: target, category estimates, per-day figures,
  notes, savings pace, trip length, preferences, Scout's estimates). Several
  `role="tabpanel"` divs share one tab (`hidden={tab !== "trip"}`). Do not split
  this further unless the traveler asks for it.
  **Do not use Radix `TabsContent` here**: with `forceMount` it keeps the panel
  mounted but never sets `hidden`, so all five sections render at once. The
  panels are plain `div[role="tabpanel"]` with `hidden={tab !== value}`, which
  keeps every field mounted (validation refs, prefilled values, tests) while
  showing exactly one. A failed submit jumps to the tab that owns the first error
  (`tabForField`). Each panel is a card surface (`rounded-2xl border bg-card p-5`).
- The sentence-to-draft section is parked behind `SHOW_DRAFT_SECTION = false`;
  its test is `it.skip`ped.
- The **Scout** tab is read-only and shows everything stored: status, savings
  pace + cadence, best season (from notes), preferences, route chain, coordinates
  and the per-person/night/day estimates.

## Derived per-day figures in the edit form (2026-10-29)

- The card's Daily tab numbers (food/day, activities/day, daily per person) are
  **derived**, not stored per day: they come from `categoryEstimates.food` /
  `.activities` divided by `durationDays`, and `dailyPerPersonMinor` when present.
  The edit form now shows the same three figures (read-only) at the bottom of the
  Budget tab, so what the card displays is visible while editing.

## Editable Scout fields (2026-10-29)

- The Scout tab is now **editable**: savings pace + cadence, trip length,
  preferences, flight per person, hotel per night, rental per night and daily per
  person. Status, best season, route chain and coordinates stay read-only because
  they are derived or AI-authored.
- Those values must be carried by `NewTripIdea` **and** by `ideaPatch` in
  `trip-planner-view.tsx`; forgetting the patch silently drops them on update.

## Edit idea form (2026-10-29)

- `TripIdeaForm` opens with a **read-only preview header** (gradient panel: "You
  are editing" + destination + amount · duration · travelers) that updates live
  as the fields change, so the editor reads as the same object the card shows.
- The form has **three tabs**: Viaje · Presupuesto (target + category estimates)
  · Detalles (Scout pace, trip length, per-unit estimates, constraints, notes).
  `tabForField()` routes a validation error to the right tab: `targetTripCost`
  and `estimate:*` → budget, `notes` → details, everything else → trip.
- All labels inside the form are styled by one form-level rule:
  `[&_label]:text-[11px] [&_label]:uppercase [&_label]:tracking-[0.06em]
  [&_label]:text-muted-foreground` — same language as the card labels.
- The preview parses the amount inside a try/catch: rendering must never throw
  while the traveler is mid-typing an invalid amount.
- Fields are prefilled from `idea` in `useState` initializers and the dialog keys
  the form by idea id; the "prefills every field" test covers it.
