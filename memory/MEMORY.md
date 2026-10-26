# Viatik — Persistent Agent Memory

> **Purpose:** durable, incremental context for every agent session. Read this
> before exploring the codebase; update it before ending a task.
> **Companions:** [`data-models.md`](data-models.md) ·
> [`components-ui.md`](components-ui.md) · [`roles-abilities.md`](roles-abilities.md)
> **Last updated:** 2026-10-23 · schema v47 · 218 test files / 1,418 tests

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
- Vitest **excludes** `features/trips/lib/home-trips-temporal.test.ts` and
  `features/trips/components/home/home-page.test.tsx`; changes there have no unit
  coverage in `pnpm test`.
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
