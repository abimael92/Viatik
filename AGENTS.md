<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Viatik — Agent Operating Manual

Viatik is a **collaborative, offline-first travel workspace**. It is **not** a
standard Next.js + Supabase CRUD app. Dexie (IndexedDB) is the domain source of
truth; Supabase is the sync and authorization target.

## 1. Required reading before any work

In order:

1. [`.ai/llms.txt`](.ai/llms.txt) — framework entry point and workflow.
2. [`.ai/constitution.md`](.ai/constitution.md) — non-negotiable engineering, security,
   spec-first, SOLID, and metadata rules.
3. [`.ai/AGENTS.md`](.ai/AGENTS.md) — Main / Architect / Implementation / QA / Security roles.
4. [`.ai/CONTEXT.md`](.ai/CONTEXT.md) — fast project snapshot (auth, features, commands).
5. [`memory/MEMORY.md`](memory/MEMORY.md) — persistent memory index, invariants, session log.
6. The applicable memory file:
   [`memory/data-models.md`](memory/data-models.md),
   [`memory/components-ui.md`](memory/components-ui.md),
   [`memory/roles-abilities.md`](memory/roles-abilities.md).
7. The applicable spec: `.ai/specs/<feature>.md`, `.ai/specs/bug-<slug>.md`,
   `.ai/specs/bug-ledger.md`, `.ai/specs/design-system.md`.

If a spec does not exist for the change, write one from
`.ai/templates/feature-spec.md` (or `.ai/templates/bug-report.md`) **before** coding.

## 2. Stack constraints (authoritative: `package.json`)

| Area | Version / choice |
|---|---|
| Runtime | Node 20+, **pnpm 11.3.0** (`packageManager` field) |
| Framework | Next.js **16.3.3** App Router (`proxy.ts` replaces `middleware.ts`) |
| UI | React **19.2.8**, TypeScript strict, Tailwind CSS **v4** (no `tailwind.config.ts`) |
| Local DB | Dexie **4.4.5** + `dexie-react-hooks`, `fake-indexeddb` in tests |
| Remote | Supabase (`@supabase/ssr` 0.12, `@supabase/supabase-js` 2.112) — Postgres, Auth, Storage, Realtime |
| State | Zustand for transient UI only |
| Validation | Zod 4 |
| Tests | Vitest 4 + Testing Library (jsdom), Playwright (E2E) |
| Mobile | Capacitor 8 (`ios/`, `android/`) |

**Package manager:** use `pnpm` only. Never `npm install` or `yarn`; never edit
`pnpm-lock.yaml` by hand. Add dependencies with `pnpm add` and prefer versions
published at least 7 days ago.

## 3. Architectural invariants (hard rules)

1. **Dexie first.** Every domain read/write goes through a repository in
   `features/<feature>/data/dexie-*-repository.ts`. UI components never touch
   IndexedDB directly.
2. **No direct Supabase domain queries.** UI/features must not `.from("trips")`,
   `activities`, `expenses`, etc. Allowed remote calls are infrastructure only:
   auth (`lib/supabase/`), storage signed URLs, public-profile RPCs, and
   **server-side** auth/profile gating in server components and server actions.
3. **Transactional writes.** A domain row and its outbox entry are written in one
   `TransactionContext.runInTransaction(...)` using `append()` from
   `lib/sync/outbox-transactional.ts`. Never call `db.outboxMutations.add(...)`
   directly. Local-only tables must not append outbox entries.
4. **Money is `bigint` minor units** (`features/domain/money.ts`). Never floats,
   never `number` for amounts. Rounding and conversion live in the money domain.
5. **Schema migrations are additive.** Add `this.version(N)` to `lib/db/dexie.ts`;
   never edit a shipped version block. Changing indexes requires re-declaring the
   full index string for that table. Backfill in `.upgrade()`.
6. **Remote changes need a migration.** Any Dexie schema change that syncs also
   needs a `supabase/migrations/000000000000NN_*.sql` file, RLS policies, mapper
   updates in `lib/supabase/mappers.ts`, and the table added to
   `SYNC_TABLE_DEFINITIONS` / `OutboxEntityType`.
7. **Authorization is server-side.** Client `canEdit`/`isOwner` checks are UX only.
   Every protected operation needs an RLS policy. See
   [`memory/roles-abilities.md`](memory/roles-abilities.md).
8. **Offline is the default path.** No feature may require a network round-trip to
   render or to accept a write. Remote-first flows (e.g. invitation
   accept/reject) must be documented as exceptions.
9. **Secrets never enter the repo, logs, or specs.** `.env.local` is local-only;
   `.env.encrypted` is unlocked via `pnpm secrets:unlock`.
10. **Preserve the `nextjs-agent-rules` block** at the top of this file.

## 4. Repository layout

```
app/            routes: (app) authenticated shell, (auth) login/register/reset,
                share/[slug] public guest view, auth/confirm, actions/ (server actions)
components/     ui/ primitives, app-shell/, auth/, pro/ command palette
features/       domain (entities, money, categories, repositories)
                <feature>/{components,data,domain,lib}
lib/            db (Dexie, providers), sync (outbox/engine/coordinator), supabase,
                auth, i18n, security, health, weather, notifications, validation
supabase/       migrations/, functions/, config.toml, *-security.test.ts
e2e/            Playwright specs
memory/         persistent agent memory (this system)
.ai/            constitution, agents, specs, skills, templates
```

## 5. Standard verification (run before claiming completion)

```bash
pnpm install          # only if dependencies changed
pnpm lint             # eslint --max-warnings 0  (pre-commit runs this + typecheck)
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run — 217 files / 1,399 tests at last audit
pnpm build            # next build (21 routes)
pnpm test:e2e         # playwright (when touching flows covered by e2e/)
```

- Run lint, typecheck, and the **relevant** tests for every change; run `pnpm build`
  for routing/server-component/schema changes.
- Never report a command as passing unless it was actually run in this session.
- Husky pre-commit (`.husky/pre-commit`) runs `pnpm lint && pnpm typecheck`.
- Baseline at 2026-10-22: all four commands pass with no warnings.

## 6. Change protocols

**New feature**
1. Spec in `.ai/specs/` (What/Why, scope, acceptance criteria, security, tests).
2. Architect review: boundaries, data ownership, migration, offline behavior.
3. Test first (Vitest, colocated `*.test.ts(x)`; `fake-indexeddb` for Dexie).
4. Implement through repository → outbox → sync; add UI last.
5. QA + Security review; update `memory/MEMORY.md`.

**Bug fix**
1. `.ai/templates/bug-report.md` → reproduce → root cause.
2. Regression test, then the smallest correct fix.
3. Record any durable invariant in `.ai/specs/bug-ledger.md`.

**Schema change**
1. New `this.version(N)` in `lib/db/dexie.ts` + `.upgrade()` backfill.
2. Migration test under `lib/db/*-migration.test.ts`.
3. Supabase migration + RLS + mappers + sync table lists.
4. Update [`memory/data-models.md`](memory/data-models.md).

**UI change**
Follow `.ai/skills/ui-component-generator.md` (`READ → SCAN → ASSEMBLE → TEST`) and
[`.ai/specs/design-system.md`](.ai/specs/design-system.md); reuse
`components/ui/*`; all copy via `useI18n().t()`; 44px touch targets; client
components only where browser APIs/Dexie are needed.

## 7. Persistent memory loop (mandatory)

At the end of **every** task or PR, update [`memory/MEMORY.md`](memory/MEMORY.md):

- new features / changed behavior,
- schema or migration changes,
- new gotchas, commands, or conventions,
- a dated session-log entry.

Update the topic files (`data-models.md`, `components-ui.md`, `roles-abilities.md`)
whenever their subject matter changes, and `.ai/CONTEXT.md` for stack/feature-level
changes.

## 8. Do not

- Do not refactor unrelated code, reformat whole files, or "clean up" while fixing.
- **Do not delete, relocate, or change the meaning of anything the request did
  not name.** See §9 — a removal inventory and approval are required first.
- Do not weaken or skip tests to make a change pass.
- Do not bypass pre-commit hooks, force-push, or rewrite history.
- Do not add `tailwind.config.ts`, a second styling system, or a second state library.
- Do not import Dexie/repositories into server components or server actions.
- Do not run destructive database commands (`supabase db reset`, `Dexie.delete`)
  against user data without explicit approval.

## 9. Change & removal protocol (hard gate)

Deleting or redefining working behavior is a product decision, not a refactor.
Before touching anything that already ships:

1. **Inventory first.** List every surface, string, translation key, export,
   route, test, or behavior that will be removed, relocated, or change meaning —
   including copy that reads differently after a "localization" or a formatting
   refactor.
2. **Split by authorization.** Mark each item *requested* (named in the task) or
   *adjacent* (the agent's own judgment). Adjacent items need explicit approval
   before the edit; if the task does not name it, it is not authorized.
3. **Stop when in doubt.** "Unused", "duplicated", "dead", "inconsistent", or
   "cleanup" are reasons to *propose* a change, never to delete.
4. **Remove only what was named.** A relocation counts as a removal from the old
   place — say so in the inventory, and keep the capability reachable unless the
   request says otherwise.
5. **Never trade away functionality to go green.** No deleting tests, copy keys,
   or UI to make lint/typecheck/tests/build pass.
6. **Record the decision.** Put the approved inventory in the spec and the
   outcome in `memory/MEMORY.md`.

A task that says "remove X" authorizes removing X only — not its neighbours,
helpers, or the copy it no longer appears to use.
