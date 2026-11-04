# Viatik — Persistent Agent Memory

> **Purpose:** durable, incremental context for every agent session. Read this
> before exploring the codebase; update it before ending a task.
> **Companions:** [`data-models.md`](data-models.md) ·
> [`components-ui.md`](components-ui.md) · [`roles-abilities.md`](roles-abilities.md)
> **Last updated:** 2026-11-03 · schema v50 · AI infrastructure quality layer (validation, drift, security, evaluations)
> **Last updated:** 2026-11-02 · schema v50 · agent skills suite + 14 community skills
> **Last updated:** 2026-11-01 · schema v49 · 243 test files / 1,654 tests
> **Last updated:** 2026-10-31 · schema v48 · 239 test files / 1,629 tests
> **Last updated:** 2026-10-30 · schema v48 · 232 test files / 1,568 tests

> **Section map.** Other agent frameworks ask for four canonical memory sections.
> This file has always been organized slightly differently; the mapping is:
>
> | Canonical name | Section here |
> |---|---|
> | Project Domain & Architecture Invariants | §1 Project identity · §2 Architectural invariants |
> | System Component & Data Flow Reference | §8 (added 2026-11-02) · §3 Current state snapshot · §6 Where to look first |
> | Session Changelog & Context History | §7 Session log (newest first) |
> | Known Gotchas, Quirks & Framework Exceptions | §5 Known gotchas & quirks |
>
> Sections were not renamed: other files cite them by number, and renaming would
> relocate content no task asked to move. See `AGENTS.md` §9.

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
9. **Removals are product decisions (process).** Deleting, relocating, or
   redefining working UI, copy keys, exports, routes, tests, or behavior needs a
   written removal inventory and explicit approval for anything the task did not
   name. "Unused", "duplicated", "dead", or "cleanup" is not authorization.
   See `AGENTS.md` §9 and `.ai/constitution.md` rule 7.

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
- **Nav + account menu (2026-10-31):** the mobile tab bar renders
  `primaryLinks` (Home · Trips · Contacts · Settings, `grid-cols-4`); the
  desktop sidebar renders `links`, which keeps the disabled Community entry.
  Sign-out is only a destructive `DropdownMenuItem` inside the avatar
  `AccountMenu` — never a standalone sidebar/drawer button. The mobile menu is
  an account sheet (profile card + language + sync), not a second nav.
  Trip countdown copy comes from `formatCountdown(startDate, t, today)`
  (`copy.countdown*` keys); do not hand-roll countdown strings.

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

### 2026-11-03 — AI infrastructure quality layer (validation, drift, security, evaluations)

- **Changed:** new `.ai/infra/` layer — 9 dependency-free scripts under
  `.ai/infra/scripts/` (`validate-infra`, `drift-report`, `security-audit`,
  `context-manifest`, `delegate`, `usage-log`, `test-health`, `review-checklist`,
  `run-evaluations`) plus `lib.mjs`; 6 Vitest suites (39 tests); 6 documents + evaluations README
  (`README`, `permission-model`, `delegation-protocol`, `context-routing`,
  `usage-observability`, `review-checklist`); 10 evaluation scenarios;
  `drift-baseline.json` (one accepted finding). Spec:
  `.ai/specs/ai-infra-quality-layer.md`. CI:
  `.github/workflows/ai-infra.yml` (path-filtered; no CI existed before).
  `package.json` gained 13 `agent:*` scripts (`agent:infra`, `agent:drift`,
  `agent:security`, `agent:context`, `agent:impact`, `agent:delegate`,
  `agent:usage`, `agent:test-health`, `agent:review`, `agent:eval`,
  `agent:infra:probe`, `agent:infra:all`). `AGENTS.md` §12 added; `.ai/llms.txt`
  and `.ai/CONTEXT.md` cross-references added; `.agents/skills/README.md`
  command list extended; `.gitignore` ignores usage log, delegation claims,
  test-health ledger and generated reports. `.agents/skills/test-runner.sh`
  extended additively: `--health` writes a JSON report and ingests the ledger,
  `.ai/infra/scripts/*` maps to its suites, and root plumbing (`.github/`,
  `.husky/`, `.gitignore`, `mcp.json`, `skills-lock.json`) is skipped.
  `memory/data-models.md` corrected from the stale schema v48 claim to v50.
- **Schema:** none (Dexie stays v50; no Supabase change).
- **Verification:** `pnpm lint` ✅ · `pnpm typecheck` ✅ ·
  `pnpm exec vitest run .ai/infra` ✅ 6 files / 39 tests ·
  `pnpm test` 249 files / 1,692 tests — **1,686 passed, 3 failed, 3 skipped**;
  the 3 failures are the **pre-existing time-zone-dependent**
  `features/trips/components/home/home-page.test.tsx` cases documented on
  2026-11-02 (`TZ=UTC` → 13/13 pass) · `pnpm agent:schema` ✅ (v50, 17 append
  sites) · `pnpm agent:audit-i18n` ✅ · `node .ai/infra/scripts/validate-infra.mjs`
  ✅ · `drift-report` ✅ (1 known finding) · `security-audit` ✅ ·
  `run-evaluations` ✅ 10/10 · `pnpm agent:infra:all` ✅ ·
  `bash .agents/skills/test-runner.sh --health` ✅ (ingested 1,692 tests).
  `pnpm build` not run: no routing, server-component or schema change.
- **Gotchas:**
  - **ESLint traverses `.ai/` and lints `.mjs` with the TypeScript rules.**
    `pnpm lint` is `--max-warnings 0`, so every new script must be lint-clean
    (no unused imports, no unused bindings).
  - **Vitest rewrites `import.meta.url` to a non-file URL.** `lib.mjs` therefore
    falls back to `process.cwd()` for `ROOT`; tests spawn scripts via
    `path.join(process.cwd(), ".ai/infra/scripts", …)`, never `fileURLToPath`.
  - **`test-runner.sh` used to treat every `.ai/*` file as documentation.** That
    would silently run zero suites for this layer; the mapping now has an
    explicit `.ai/infra/scripts/*` row. `package.json` still maps to the full
    suite on purpose (a dependency change can affect anything).
  - **The Skills CLI `computedHash` is not sha256(`SKILL.md`)** (verified
    2026-11-03), so `validate-infra` checks lock provenance/presence and does
    **not** claim content-hash verification.
  - **Documented `SYNC_TABLE_DEFINITIONS` does not exist** — the implementation is
    `const tableDefinitions` in `lib/sync/cloud-sync.ts`. It is recorded in
    `drift-baseline.json` until 2027-02-03 rather than silently rewritten.
  - **No AI provider telemetry exists.** `usage-log.mjs` records counts-only
    data supplied by an agent or wrapper (`source: "manual"`) and never invents a
    cost; the report prints cost coverage.
  - Delegation claims are machine-local and gitignored: they coordinate agents in
    one working tree, not across machines. `delegate.mjs` is coordination, not a
    mutex (see `.ai/infra/permission-model.md`).

### 2026-11-02 — Community skills installed via the Skills CLI + six-phase lifecycle

- **Changed:** 14 community skills installed into `.agents/skills/<name>/` with
  `npx skills@1.7.4 add <repo> --skill <names> -a universal -y`:
  `find-skills` (vercel-labs/skills); `to-spec`, `domain-modeling`, `tdd`,
  `implement`, `diagnosing-bugs`, `improve-codebase-architecture`, `code-review`,
  `handoff` (mattpocock/skills); `writing-plans`, `executing-plans`,
  `systematic-debugging`, `verification-before-completion` (obra/superpowers);
  `frontend-design` (anthropics/skills). `skills-lock.json` (14 entries, each
  pinned by `computedHash`). `package.json` gained `skills:list` / `skills:update`
  (`agent:verify` already existed — not duplicated). `AGENTS.md` gained §11, the
  mandatory six-phase lifecycle plus an installed-skills table.
  `.agents/skills/README.md` documents the community set and the rules for
  trusting updates. `tsconfig.json` now lists `.agents/skills/verify-schema.ts`
  explicitly (see Gotchas).
- **Schema:** none (Dexie v50 is current — the task brief said v47; the code is
  the authority).
- **Verification:** `pnpm lint` ✅ · `pnpm typecheck` ✅ (and the guard is now
  genuinely in the type graph — `tsc --listFiles` lists it) · `pnpm test` **243
  files / 1,654 tests, 3 failing** in
  `features/trips/components/home/home-page.test.tsx` — **pre-existing and
  time-zone dependent, not caused by this change**: `TZ=UTC pnpm exec vitest run
  <that file>` → 13/13 pass. Cause below. `pnpm agent:verify` therefore exits 1
  at this hour; lint and typecheck are green.
- **Gotchas:**
  - **`**/*.ts` in `tsconfig.json` does not traverse dot-directories.** The
    `verify-schema.ts` guard was never typechecked even though `pnpm typecheck`
    passed; `tsc --listFiles` showed no `.agents/` entry. Fixed by adding the file
    to `include` explicitly (only our guard — the third-party `.ts` payloads stay
    out). ESLint *does* traverse `.agents/` and lints it clean.
  - **`home-page.test.tsx` fails every day between 18:00 and 24:00 CST.** Three
    tests (`composes the hero…`, `renders active trip action links…`,
    `offers Start trip seven days before departure`) mix local getters
    (`getFullYear/getMonth/getDate`) with `setUTCDate` + `toISOString()`. Once the
    UTC date rolls past the local date, a trip "+7 days" reads as 8 days out and
    the `Start trip` button never renders. Not fixed here (unrelated to this
    change, and §9 forbids trading tests to go green) — the fix is to build those
    date keys from local components like the neighbouring tests do.
  - Skills CLI facts: `-a universal` writes real copies into `.agents/skills/`
    and creates **no** `.claude/` symlinks (the default install does create
    `.claude/skills/*` and skips Devin/Windsurf when their dirs are absent).
    It produces `skills-lock.json` only — **there is no `.skills.json`** in 1.7.4
    or 1.7.5. It sends telemetry unless `DISABLE_TELEMETRY=1` / `DO_NOT_TRACK=1`.
    Installs were run pinned to `1.7.4` because `1.7.5` was published hours before.
  - `pnpm skills:list` labels this repo's own six skills as source `local` — that
    is expected, not a broken install.
  - Installed skills ship non-markdown payloads (a `.ts` example, `.sh` scripts,
    `agents/openai.yaml`). They are lint-clean but outside the type graph; do not
    copy them into `app/`, `lib/`, or `features/`.
  - The previous commit in this branch (`chore(agents): establish enterprise AI
    skills suite…`) was dropped by an external `git reset HEAD~` between turns —
    `git reflog` shows it. Its files were re-committed with this change.


### 2026-11-02 — Agent skills suite, MCP manifest, and context engine

- **Changed:** new `.agents/` tree — six instruction cards (`spec-design.md`,
  `db-guardian.md`, `ui-standards.md`, `session-close.md`, index `README.md`),
  three dependency-free guards (`verify-schema.ts`, `i18n-audit.sh`,
  `test-runner.sh`), and six agent-discoverable wrappers at
  `.agents/skills/<skill>/SKILL.md`. `mcp.json` + `.cursor/mcp.json` (playwright,
  git, codegraph — exact pins, no secrets) and `.agents/mcp.md` (trust + disable
  steps). `lint-staged.config.mjs`, `.husky/pre-commit` now runs
  `pnpm exec lint-staged && pnpm lint && pnpm typecheck`. `package.json` gained
  `agent:verify`, `agent:schema`, `agent:audit-i18n`, `agent:test:affected`,
  `repomix:pack`. `CLAUDE.md` imports `AGENTS.md` + `memory/MEMORY.md`.
  `AGENTS.md` §4/§5 gained the one-command gate and §10 the skill/context/MCP map.
  This file gained the section map at the top and §8 (system component &
  data-flow reference). `.gitignore` covers `.ai/codebase-snapshot.xml` and local
  MCP overrides. Spec: `.ai/specs/agent-tooling-ecosystem.md`.
- **Deps:** `lint-staged@17.6.0`, `@vitest/coverage-v8@4.1.11` (exact, matches
  `vitest@4.1.11`; `pnpm peers check` clean). No runtime dependency added.
- **Schema:** none. `lib/db/dexie.ts` untouched (v50 is still the latest).
- **Verification:** `pnpm agent:verify` ✅ (lint, typecheck, 243 files / 1,654
  tests — 1,651 pass, 3 skipped) · `pnpm build` ✅ · `pnpm agent:schema` ✅ ·
  `pnpm agent:audit-i18n` ✅ (i18n parity suite green) ·
  `test-runner.sh --full --coverage` ✅ 75.18% lines, baseline written to
  `.agents/skills/coverage-baseline.json` · each guard also exercised against a
  deliberately broken tree (see Gotchas).
- **Gotchas:**
  - **Three requested MCP packages do not exist** (`@codegraph/mcp-server`,
    `@modelcontextprotocol/server-git`, `@modelcontextprotocol/server-playwright`
    → all 404 on npm). Shipped instead: `@astudioplus/codegraph-mcp@0.21.0`,
    `@cyanheads/git-mcp-server@2.15.3`, `@playwright/mcp@0.0.84`. The git server
    was smoke-tested over stdio (28 tools); codegraph was **not** run — it
    downloads a native engine on first start.
  - **`verify-schema.ts` must slice a version block through its chained
    `.stores(...)` / `.upgrade(...)`.** The first implementation stopped at
    `this.version(N)`'s own `)`, so editing an index string passed silently. It
    now walks parens with a string/comment-aware scanner; verified against a
    mutated `v1` index (fails), an appended `v51` (passes), a `v53` gap (fails),
    and a probe repository calling `outboxMutations.add` (fails).
  - **`.agents/skills/<name>/SKILL.md` is the discoverable layout** (the `.agents`
    skills standard Devin CLI/Claude/Cursor read); the flat `.agents/skills/*.md`
    cards are the source of truth and the wrappers only point at them. A flat
    `.md` alone is not auto-discovered.
  - Node runs the TS guard through native type stripping but prints
    `MODULE_TYPELESS_PACKAGE_JSON`; the `agent:schema` script passes
    `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` instead of adding
    `"type": "module"` to `package.json` (which would break the CommonJS scripts).
  - macOS `/bin/bash` is 3.2: no `mapfile`, no associative arrays, and `set -u`
    breaks empty array expansion. Both shell scripts avoid arrays entirely.
  - **Coverage is only gated on full-suite runs.** Comparing a subset run against
    a whole-repo baseline would report false regressions, so `test-runner.sh`
    reports subset coverage without failing.
  - The full lint is deliberately kept in `pre-commit` after `lint-staged`: this
    repo has no CI workflow, so the hook is the only enforcement point. Removing
    it would weaken the gate.


### 2026-11-01 — Home travel ideas: five community cards with real trip details

- **Changed:** `features/community/components/suggestions-drawer.tsx` — the Home
  "Travel ideas" sheet now lists **five** ideas and every card shows the details
  that are set on the idea: duration, travelers, activity count, a whole-party
  **Trip cost**, and the per-month figure for a **3-month** and **5-month**
  saving window. Cards widened `w-56` → `w-72`, the description is two lines,
  and the sheet states the figures are estimates for the whole party in the
  traveler's currency.
- **Data:** `features/community/data/public-templates.ts` —
  `PublicTripTemplate` gained `durationDays` and a `cost` baseline
  (`flightPerPerson` / `dailyPerPerson` / `hotelPerNight`, whole units of
  `baseCurrency`), plus a fifth template **Marrakech & the Atlas** (5 days,
  culture / adventure / food). `budgetMinor` was left exactly as it was.
- **New domain module:** `features/community/domain/template-cost-estimate.ts`
  (`templateCostEstimate`, `TEMPLATE_SAVINGS_HORIZONS = [3, 5]`). Flights and
  daily spending are per traveler, the nightly rate covers the party, nights are
  `max(1, days - 1)`, all `bigint`; currency comes from
  `budgetUserCurrency(preferred, baseCurrency)` + `convertBudget` (offline
  default rates) and an unsupported currency returns `null` so the card omits
  the block. Saving windows round **up**.
- **Copy:** `communityIdeaTravelers`, `communityIdeaTripCost`,
  `communityIdeaSavePerMonth`, `communityIdeasEstimateNote` (en + es). Reuses
  `copy.tripIdeaDurationDays` and `common.activities`.
- **Schema:** none.
- **Verification:** `pnpm lint` ✅ · `pnpm typecheck` ✅ ·
  `template-cost-estimate.test.ts` 7/7 ✅ · `suggestions-drawer.test.tsx` 3/3 ✅ ·
  full `pnpm test` = 243 files / 1,654 tests: 1,648 pass, 3 skipped, plus the
  same **3 pre-existing** `home-page.test.tsx` failures from commit `3e7bc6e`.
  Visually checked at 1280×900 and 430×900 through the dev `/e2e` harness
  (temporary render, reverted).
- **Gotchas:** the `/community` page preview still prints `budgetMinor`
  (activities × 85.00) under `common.estimatedBudget`, which is **not** the same
  number as the card's trip cost — do not reuse `common.estimatedBudget` for the
  new figure. `templateCostEstimate` throws for `days < 1` or `travelers < 1`;
  the drawer always passes the authored party size
  (`adultCount + childCount`). See `.ai/specs/community-idea-cards.md`.

### 2026-11-01 — Scout vibe step: five options, what each one does, and a 5-day cost estimate

- **Changed:** `features/trip-planner/components/scout-idea-wizard.tsx` — the
  vibe question went from three chips to five `SelectableCard`s (beach, city,
  nature, food, surprise) in a `minmax(15rem, 1fr)` grid. Each card carries a
  one-line description of what Scout does with that vibe and a per-traveler
  cost line. `SelectableCard` gained an optional `meta` slot for that line.
  Results now gate on `showingResults = completedQuestion && !editingAnswers`,
  and the results footer gained **Change the vibe**, which walks back to the vibe
  step with `suggestions` intact so the cards can re-price from a real run.
- **New domain modules:**
  `domain/scout-vibe-category.ts` (`SCOUT_VIBE_CATEGORIES` +
  `selectFallbackCategory`, moved out of `app/actions/scout-trip-ideas.ts` so
  the wizard and the deterministic generator share one classifier) and
  `domain/scout-vibe-cost-estimate.ts` (`SCOUT_VIBE_TRIP_DAYS = 5`,
  `SCOUT_VIBE_WINDOW_MONTHS = 3–5`, `SCOUT_VIBE_REFERENCE_CREW = 2`,
  `scoutVibeCostEstimate`). The estimate averages Scout's reference
  destinations per vibe, or the ideas Scout already returned re-priced at
  exactly 5 days, and converts currency with an exact rational
  (`SCOUT_CURRENCY_RATIO`) — never a float. Unsupported currency returns `null`.
- **Copy:** `scoutWizardVibeFood`, `scoutWizardVibeSurprise`, five
  `...Detail` keys, two `...Reaction` keys, `scoutWizardVibeCostLine`,
  `scoutWizardVibeCostFromSearch`, `scoutWizardVibeCostHint`, and
  `scoutWizardChangeVibe` in `en` + `es`.
- **Schema:** none.
- **Verification:** `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm build` ✅ (21
  routes) · `scout-idea-wizard.test.tsx` 58/58 ✅ · new domain suites
  (`scout-vibe-cost-estimate`, `scout-vibe-category`) ✅ ·
  `app/actions/scout-trip-ideas.test.ts` + `lib/i18n` 39/39 ✅. Full `pnpm test`
  = 241 files / 1,644 tests: 1,638 pass, 3 skipped, **3 pre-existing failures**
  in `features/trips/components/home/home-page.test.tsx` (`Active · Day 1 of 1`,
  `Active Trip Actions`, `Start trip`) that commit `3e7bc6e` introduced by
  removing that UI — untouched here because it is a product decision, not this
  task.
- **Gotchas:** the vibe card's accessible name is title + description + cost
  line (the label is still the value sent to Scout), so tests must query it with
  a regex. The city chip's label contains "good food", which
  `selectFallbackCategory` classifies as `food` — that is why each chip declares
  its `category` instead of being re-classified from its label. `showResults`
  must stay the view gate; gating on `suggestions.length > 0` hides the
  questions and makes **Change the vibe** look broken.

### 2026-10-31 — Sidebar bottom bar: sign-out restored, collapse control moved to the header

- **Changed:** `components/app-shell/app-shell.tsx` — destructive sign-out row is
  back at the bottom of `#app-sidebar` (`min-h-12`, `border-destructive/40
  bg-destructive/10 text-destructive`, `aria-label`/`title` = `common.signOut`,
  disabled while `pending`; icon-only in the rail because `.sidebar-label` is
  hidden there). The collapse toggle left the bottom bar and is now an icon-only
  44px ghost button in the brand row, right of `ThemeToggle` (same
  `aria-expanded` / `aria-controls` / i18n labels), drawn with `ChevronsLeft`
  (expanded) / `ChevronsRight` (collapsed) — `PanelLeftClose`/`Open` were
  unreadable at 20px. `app/globals.css` — the
  orphaned `html[data-sidebar="collapsed"] .sidebar-toggle-btn` rule was replaced
  by `.sidebar-brand-actions { flex-direction: column }` (two 44px buttons do not
  fit the 56px rail side by side).
- **Schema:** none.
- **Verification:** `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` 239 files /
  1,631 tests — 1,628 pass, 3 skipped ✅ · `pnpm build` ✅. Visual check at 1024px
  (expanded + rail, ES) via a temporary `app/e2e-shell` route (deleted after;
  screenshots in `/tmp/viatik-sidebar/`): toggle 44×44 at the brand row's right
  edge, sign-out 287×48 expanded / 55×48 in the rail, keyboard Tab reaches the
  toggle in 4 presses with a visible focus ring.
- **Gotchas:** the collapse button carries `hover:bg-side-hover` because
  `Button variant="ghost"` hovers with `bg-muted` (a *solid* `oklch(0.26 …)`
  fill in dark) instead of the nav rows' `white/5%`. Do **not** try to "fix" the
  theme toggle the same way: `.theme-toggle:hover` in `globals.css` deliberately
  paints amber (dark) / magenta (light) and beats any utility, so a
  `hover:bg-side-hover` class on it is dead weight. Deleting the temporary
  `app/e2e-shell` route leaves a stale
  `app/e2e-shell/page.js` import in `.next/types/validator.ts`, so `pnpm
  typecheck` fails with TS2307 until types are regenerated — `pnpm build` fixes
  it (hitting the dev server does not). Two `app-shell` tests assert exact
  `logout()` call counts, so `beforeEach` now calls `vi.clearAllMocks()`.

### 2026-10-31 — Scout wave tests: stale expectations repaired (suite green)

- **Changed:** `features/trip-planner/components/__tests__/scout-idea-wizard.test.tsx`
  only (no production code): the three "progressive waves" failures were stale
  tests, not a component bug.
  - `drops a stale second wave after Try again` → `drops a stale second wave
    after the wizard is reopened and re-run`: closes the dialog mid-top-up
    (`runId` reset), re-runs Scout, then resolves the abandoned top-up and
    asserts its ideas/errors never reach the DOM. The old version clicked a
    "Try again" button that has never existed (the copy is "Try different
    answers").
  - `excludes first-wave routings in route mode`: asserts the loading view
    hides partial cards while the top-up is in flight, keeps the
    `count/excludeDestinations/excludeRoutes` payload assertions, and then
    matches the route-mode card title (`/Route option 1 · Kyoto, Japan/`).
  - `rotates through stage messages while Scout searches`: waits on the real
    2.8s interval (`findByText(..., { timeout: 5000 })`).
- **Schema:** none.
- **Verification:** `pnpm typecheck` ✅ · scoped
  `pnpm exec eslint features/trip-planner/components/__tests__/scout-idea-wizard.test.tsx`
  ✅ · `pnpm vitest run …/scout-idea-wizard.test.tsx` 56/56 ✅ · `pnpm test`
  239 files / 1,629 tests — 1,625 pass; the only failure is
  `i18n-coverage` flagging a *concurrent session's* temporary
  `app/e2e-shell/page.tsx` ("Content preview"), and repo-wide `pnpm lint` also
  fails on that session's `tmp-nav.cjs` / `tmp-probe.cjs` scratch files.
- **Gotchas:** the root cause was doc/implementation drift, not a bug —
  `memory/components-ui.md` §"Scout loading until five ideas (2026-10-29)" is
  the contract (first wave is hidden until five are ready). The three tests
  predate it and had **never** passed (one even referenced a non-existent
  button). Don't reintroduce "Scout is still finding N more…" between waves.
  `AnimatePresence mode="wait"` deadlocks under `vi.useFakeTimers()`: the state
  advances (verified stage 0→2) but the exiting child never completes, so the
  new line never mounts. `act()` + `advanceTimersByTimeAsync` cannot fix it;
  use real timers for that assertion.

### 2026-10-31 — Wider fluid sidebar + larger nav menu type

- **Changed:** `app/globals.css` (`--sidebar-w` is now
  `clamp(20.5rem, 22vw, 22rem)` instead of a flat `18rem`; collapsed rail stays
  `5rem`), `components/app-shell/app-shell.tsx` (`navLinkClasses` labels
  `text-[17px]` → `text-[20px]`, rows `min-h-11` → `min-h-12`; the disabled
  coming-soon row gets `w-full` and its chip `px-2` → `px-1.5`). Only the
  destination menu got bigger — profile card, search pill, sync pill, and mobile
  tab bar are untouched.
- **Schema:** none.
- **Verification:** `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` 239 files /
  1,629 tests — 1,623 pass, only the 3 pre-existing `scout-idea-wizard`
  "progressive waves" failures reproduce · `pnpm build` ✅ (21 routes).
  Visual check at 1024/1600px in EN + ES via a temporary `app/e2e-shell` route
  (deleted after; screenshots in `/tmp/viatik-sidebar/`): sidebar 328px → 352px,
  nav labels 20px/48px rows, no truncated nav label in either locale, chip stays
  inside the panel padding, profile name fits at the `lg` edge, collapsed rail
  unchanged (all five rows 55×48, icons centered).
- **Gotchas:** `--sidebar-w` also pads `<main>`, so widening it shrinks content
  space at `lg`. The floor is now `20.5rem` (328px) because 20px labels plus the
  "Próximamente" chip need it; at `19.5rem` the profile name and the Community
  label ellipsize. A `<button>` inside the nav sizes to content (form controls
  ignore block width), so the coming-soon row overflowed the nav's right padding
  until it was given `w-full` — keep that class if the row is ever restyled.

### 2026-10-31 — Localized countdowns + nav/sign-out polish

- **Changed:** `features/trips/lib/home-trips.ts` (`formatCountdown(startDate, t, today)`
  now takes the translator; "Today" / "Tomorrow" / "{{count}} days left" /
  "Started yesterday" / "Started {{count}} days ago"),
  `features/trips/components/home/up-next-rail.tsx` and
  `trip-countdown-hero.tsx` (both call it — the hero's duplicate inline
  countdown and `common.todayLabel`/`startedLabel`/`daysLeft` keys are gone),
  `lib/i18n/translations.ts` (new `Translate` type), `lib/i18n/frontend-copy.ts`
  (EN/ES `countdown*` + `accountMenu`/`openAccountMenu`/`accountSettings`),
  `components/app-shell/app-shell.tsx` (new avatar-anchored `AccountMenu`
  dropdown; sidebar sign-out block removed; mobile tab bar = 4 live tabs;
  mobile menu is an account sheet with no duplicate nav links),
  `components/app-shell/app-shell.test.tsx`, `features/trips/lib/home-trips.test.ts`.
- **Schema:** none.
- **Verification:** `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` 239 files /
  1,629 tests — 1,623 pass, only the 3 pre-existing `scout-idea-wizard`
  "progressive waves" failures reproduce · `pnpm build` ✅ (21 routes).
- **Gotchas:** `formatCountdown` takes `(startDate, t, today = new Date())` —
  the translator is positional second so `today` stays optional. The
  `common.todayLabel`/`startedLabel`/`daysLeft` keys were deleted; use the
  `copy.countdown*` keys. The mobile tab bar renders `primaryLinks` (Home,
  Trips, Contacts, Settings) while the desktop sidebar still renders `links`
  (which inserts the disabled Community entry) — do not reuse `links` in the
  bar or the dead 5th slot comes back. Sign-out exists only as a destructive
  `DropdownMenuItem` inside `AccountMenu`; there is no standalone sign-out
  button in the sidebar or drawer. `app-shell.test.tsx` mocks
  `@/components/ui/dropdown-menu` (Radix needs pointer events jsdom lacks) so
  the menu items render inline.

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
### 2026-10-29 — Scout proximity ranking + wish-list idea card redesign
- **Changed:** `app/actions/scout-trip-ideas.ts` (system prompt and
  `buildUserPromptPayload` rewritten around proximity), `app/actions/places.ts`
  (new `resolveDestinationCoordinates`), `features/trip-planner/components/idea-map-card.tsx`
  (new), `features/trip-planner/components/trip-idea-card.tsx` (redesign),
  `features/trip-planner/components/scout-idea-wizard.tsx` (map in the detail,
  budget/duration chips, background coordinate hydration on save),
  `lib/i18n/frontend-copy.ts` (EN/ES keys), spec
  `.ai/specs/scout-nearby-destinations-and-idea-card.md`.
- **Behavior:** "one continent" is gone. The prompt now treats proximity as a
  ranking input (same country → same region/neighbors → same continent →
  long-haul only when clearly better) and explicitly welcomes nearby underrated
  destinations next to famous ones. The payload carries an `anchor` block with
  the departure city, a widening order, and concrete guidance. `FALLBACK_POOLS`
  is untouched and remains only the no-provider path — it is **not** the ranking
  mechanism.
- **Map:** keyless OpenStreetMap embed (`export/embed.html?bbox=…&marker=lat,lon`)
  when coordinates exist and `navigator.onLine`; otherwise a static tile with an
  OSM link. Scout-saved ideas geocode in the background **after** the local write
  (`resolveDestinationCoordinates` → `tripIdeaRepository.updateIdea`), so an
  offline save still succeeds and a failed lookup is silent.
- **Schema:** none. `tripIdeas` already had `placeId`/`latitude`/`longitude`/
  `timeZone` and is local-only (no outbox, no Supabase table).
- **Verification:** `pnpm typecheck` ✅ · `pnpm lint` ✅ (no warnings) ·
  `pnpm test` ✅ 226 files / 1,528 passed, 3 failed · `pnpm build` ✅ (21 routes).
  The 3 failures are **pre-existing** in `scout-idea-wizard.test.tsx`
  ("drops a stale second wave after Try again", "excludes first-wave routings in
  route mode", "rotates through stage messages while Scout searches"); they fail
  identically on `HEAD` with the working tree stashed.
- **Idea card tabs (v50):** `tripIdeas` also stores `flightCostPerPersonMinor`,
  `hotelPerNightMinor`, `altStayPerNightMinor`, `dailyPerPersonMinor`. The card
  now uses tabs (Overview/Flights/Stay/Daily/Savings/Prices) instead of
  collapsibles, and the status + interest chips moved under the title with
  per-vibe colours.
- **Scout loading state:** extracted to
  `features/trip-planner/components/scout-loading-state.tsx` (mascot + orbit +
  gradient shimmer). Uses the `--color-viatik-*` theme tokens.
- **Idea plan context (2026-10-29, v49):** `tripIdeas` now stores the Scout
  answers that drive the plan — `savingsCapacityMinor`, `savingsCadence`,
  `timing`, `targetMonth` (was silently dropped by the mapper), `tripLength`,
  `constraints`. Dexie v49 backfills nulls/`""`. `buildIdeaSchedule`
  (`domain/idea-schedule.ts`) rebuilds the wizard's plan from those answers:
  pace-driven when there is a capacity, date-driven otherwise; the travel window
  is always capped at 30 days and `bookBy` never lands in the past.
  `flightBookingWindowDays(fare, currency)` converts to USD before comparing
  against the 700 long-haul threshold, so a MX$3,366 fare is short-haul (56
  days), not long-haul.
- **Savings timeline:** `calculateSavingsSuggestion` returns `readyOn` and
  `bookBy` (ISO) and takes an optional `bookingWindowDays`; the window constants
  moved to `domain/flight-booking-window.ts` and are shared with
  `scout-idea-plan`. `SavingsPlanner` renders goal + progress + cadence, then a
  three-step timeline (buy flights / goal complete / trip departs).
- **Gotchas:** `formatMinorUnits` already prints the currency symbol — appending
  the ISO code duplicated it ("MX$17,428.00 MXN"). `TripIdea.name` is
  `"<destination> - <season>"`, so rendering both name and destination repeats
  the city; the card now splits the suffix into a subtitle. `IdeaMapCard` must
  not call `setState` synchronously in an effect (React lint
  `react-hooks/set-state-in-effect`); the auto-resolve path uses a ref guard and
  only sets state in the promise callbacks. `idea.notes` is deliberately **not**
  rendered on the wish-list card (product decision 2026-10-29) — it stays in the
  record only.

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

---

## 8. System component & data-flow reference

Where a write goes, end to end. Read this before tracing a bug across layers.

```text
UI (client component)
  └─ useLiveQuery / watch*            ← features/*/data/dexie-*-repository.ts
       └─ TransactionContext.runInTransaction(...)      lib/db/transaction-context.ts
            ├─ domain table write     (Dexie, source of truth)
            └─ append(entityType, op, data)             lib/sync/outbox-transactional.ts
                 └─ outboxMutations row  ← only lib/sync writes here
                      └─ SyncEngine      lib/sync/engine.ts
                           └─ CAS RPC    supabase/migrations/*.sql  (RLS enforced)
                                └─ pull by updated_at cursor → mappers → Dexie
                                     └─ Realtime per table → other tabs/devices
```

| Stage | Owns | Never does |
|---|---|---|
| `app/` routes, `(app)` shell | auth gating, server components, redirects | touch Dexie; import repositories |
| `features/*/components` | rendering, `t()` copy, `canEdit` UX | query Supabase domain tables |
| `features/*/data/dexie-*-repository.ts` | every domain read/write, `watch*` | write `outboxMutations` directly |
| `lib/db/` | Dexie schema, versions, `TransactionContext`, per-user DB names | hold domain rules |
| `lib/sync/` | outbox, retries, lease, conflict resolution | decide permissions |
| `lib/supabase/` | clients, mappers, auth/profile RPCs | be imported by server components for domain data |
| `supabase/migrations/` | tables, RLS policies, CAS RPCs | be skipped for a synced Dexie change |

**Failure path.** A failed push keeps the row local and retries 5× with
1/5/15/30/60s backoff; an RLS error resets the attempt counter instead of
exhausting it; a missing remote table is skipped with a warning, so an unapplied
migration never blocks the app. Conflicts auto-resolve remote-wins.

**Entry points when lost.** `lib/db/dexie.ts` (schema) · `lib/sync/outbox.ts` and
`lib/sync/engine.ts` (sync) · `features/domain/entities.ts` (types) ·
`features/domain/money.ts` (money) · `supabase/migrations/` (authorization).

**Agent-infrastructure checks.** `.ai/infra/` validates the instructions, skills,
lockfile, MCP manifests, drift, security posture and evaluation scenarios
(`pnpm agent:infra`, `agent:drift`, `agent:security`, `agent:eval`); the product
gate remains `pnpm agent:verify`. See `AGENTS.md` §12.
