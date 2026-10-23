# Viatik — Persistent Agent Memory

> **Purpose:** durable, incremental context for every agent session. Read this
> before exploring the codebase; update it before ending a task.
> **Companions:** [`data-models.md`](data-models.md) ·
> [`components-ui.md`](components-ui.md) · [`roles-abilities.md`](roles-abilities.md)
> **Last updated:** 2026-10-22 · schema v47 · 217 test files / 1,399 tests

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
