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
| Framework | Next.js **16.4.1** App Router (`proxy.ts` replaces `middleware.ts`) |
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
.agents/        agent skills (cards + guard scripts), MCP trust notes
mcp.json        portable MCP server manifest (.cursor/mcp.json mirrors it)
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

The one-command gate — lint, typecheck, and the full suite:

```bash
pnpm agent:verify     # pnpm lint && pnpm typecheck && pnpm test
```

Two guards cover rules that lint and tests cannot see:

```bash
pnpm agent:schema       # additive Dexie migrations + no outbox writes outside lib/sync
pnpm agent:audit-i18n   # raw copy in TSX + en/es parity
pnpm agent:test:affected  # only the suites that cover this diff (--dry-run to plan)
```

- Run lint, typecheck, and the **relevant** tests for every change; run `pnpm build`
  for routing/server-component/schema changes.
- Never report a command as passing unless it was actually run in this session.
- Husky pre-commit (`.husky/pre-commit`) runs `lint-staged` on the staged files,
  then `pnpm lint && pnpm typecheck` repo-wide. Full lint is kept on purpose: the
  repository has no CI, so the hook is the only enforcement point.
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

## 10. Agent skills, MCP, and the context map

Prose states the rule; the scripts under `.agents/skills/` check it. Prefer running
the guard over re-deriving the rule from the codebase.

| Skill | Card | Command |
|---|---|---|
| Spec first | [`.agents/skills/spec-design.md`](.agents/skills/spec-design.md) | — (writing gate) |
| Dexie guardian | [`.agents/skills/db-guardian.md`](.agents/skills/db-guardian.md) | `pnpm agent:schema` |
| i18n checker | [`.agents/skills/README.md`](.agents/skills/README.md) | `pnpm agent:audit-i18n` |
| Visual UI reviewer | [`.agents/skills/ui-standards.md`](.agents/skills/ui-standards.md) | `pnpm agent:audit-i18n` |
| Smart test runner | [`.agents/skills/README.md`](.agents/skills/README.md) | `pnpm agent:test:affected` |
| Session closer | [`.agents/skills/session-close.md`](.agents/skills/session-close.md) | `pnpm agent:verify` |

Index: [`.agents/skills/README.md`](.agents/skills/README.md). Each skill also has
an agent-discoverable `.agents/skills/<skill>/SKILL.md` wrapper (the `.agents`
skills standard, read by Devin CLI, Claude Code, Cursor, and others). The card is
the source of truth; the wrapper is frontmatter plus a pointer.

### Context map — read the smallest file that answers the question

| Need | File |
|---|---|
| Fast snapshot: stack, auth, features, commands | [`.ai/CONTEXT.md`](.ai/CONTEXT.md) |
| Non-negotiable rules | [`.ai/constitution.md`](.ai/constitution.md) |
| Roles and handoffs | [`.ai/AGENTS.md`](.ai/AGENTS.md) |
| Durable memory, invariants, session log | [`memory/MEMORY.md`](memory/MEMORY.md) |
| Schema, sync, migrations | [`memory/data-models.md`](memory/data-models.md) |
| UI, hooks, design tokens | [`memory/components-ui.md`](memory/components-ui.md) |
| Roles, permissions, RLS | [`memory/roles-abilities.md`](memory/roles-abilities.md) |
| UI tokens and surfaces | [`.ai/specs/design-system.md`](.ai/specs/design-system.md) |
| Bug-derived invariants | [`.ai/specs/bug-ledger.md`](.ai/specs/bug-ledger.md) |
| MCP servers, trust, disable steps | [`.agents/mcp.md`](.agents/mcp.md) |

### MCP

`mcp.json` is the portable manifest; `.cursor/mcp.json` mirrors it. Servers are
pinned to exact versions and carry no secrets. Read
[`.agents/mcp.md`](.agents/mcp.md) before enabling `codegraph` — it downloads a
native engine on first start. MCP access never overrides §3 or §8: no
force-pushes, no direct Supabase domain writes, no commits with secrets.

### Memory loop

[`memory/MEMORY.md`](memory/MEMORY.md) §7 is the session log (newest first) and §8
is the system component/data-flow reference. Dedupe before adding: update the
existing entry when the discovery is the same, and bump `Last updated` at the top.

## 11. Mandatory agent skills lifecycle

Every task runs through six phases. The phase skills are installed from the open
community registry with the Skills CLI (`npx skills`, recorded in
[`skills-lock.json`](skills-lock.json)); the local cards and guards in
[`.agents/skills/`](.agents/skills/README.md) enforce the Viatik-specific rules
inside each phase. **When a third-party skill and this repository disagree, this
repository wins** — the constitution, §3 invariants, and §9 removal gate are not
overridable by a skill.

| Phase | Skills | Viatik gate |
|---|---|---|
| 1. Scope & spec | `to-spec` · `domain-modeling` · `spec-first-design` | spec in `.ai/specs/<feature>.md` before code |
| 2. Plan | `writing-plans` · `executing-plans` | ordered checklist with file refs + test gates |
| 3. Implement | `frontend-design` · `tdd` · `implement` · `visual-ui-reviewer` | failing test first; `TransactionContext.append()` |
| 4. Debug | `systematic-debugging` · `diagnosing-bugs` | reproduction before any fix |
| 5. Verify | `verification-before-completion` · `smart-test-runner` | `pnpm agent:verify` + `agent:schema` + `agent:audit-i18n` |
| 6. Handoff | `handoff` · `code-review` · `git-session-closer` | `memory/MEMORY.md` entry + conventional commit |

**Phase 1 — Scope & spec.** For any new feature or substantial change, invoke
`to-spec` and `domain-modeling`. Write the technical specification to
`.ai/specs/<feature-name>.md` and state the entity impact before touching code:
Dexie tables/indexes (schema v50 as of 2026-11-02), Supabase tables + RLS
policies, `SYNC_TABLE_DEFINITIONS` / `OutboxEntityType`, and which tables are
local-only. Viatik's §9 removal inventory still applies.

**Phase 2 — Plan.** Invoke `writing-plans` to produce an ordered checklist with
file references and a test gate per stage, then `executing-plans` to work through
it. A plan that skips the failing-test gate is not a plan.

**Phase 3 — Implementation & design.** UI work: apply `frontend-design` **and**
the local [`ui-standards.md`](.agents/skills/ui-standards.md) card — ≥44px touch
targets, Radix `aria-expanded`/`aria-controls`, Tailwind v4 `@theme` tokens from
`app/globals.css`, no `tailwind.config.ts`. Logic and data: follow `tdd` (failing
Vitest test first, then the minimal implementation). Every domain write goes
through `TransactionContext.runInTransaction(...)` + `append()`; money is `bigint`
minor units; databases stay isolated per user (`viatik_<userId>` /
`viatik_anonymous`).

**Phase 4 — Debugging.** On any failure, apply `systematic-debugging` or
`diagnosing-bugs`. Speculative fixes are prohibited: reproduce, isolate, explain
the root cause, then patch. Record a durable invariant in
`.ai/specs/bug-ledger.md` when the bug teaches something permanent.

**Phase 5 — Verification gate (mandatory).** Run `verification-before-completion`
before claiming anything is done, fixed, or passing. You must actually run:

```bash
pnpm agent:verify        # pnpm lint && pnpm typecheck && pnpm test
pnpm agent:schema        # additive Dexie migrations + outbox write guard
pnpm agent:audit-i18n    # raw copy in TSX + en/es parity
```

Plus `pnpm build` for routing, server-component, or schema changes. Report only
commands that ran in this session, with their numbers.

**Phase 6 — Session handoff & memory loop.** Run `handoff` and `code-review` over
the staged diff, then append what changed — new tables, components, gotchas — to
`memory/MEMORY.md` §7 (dedupe first, bump `Last updated`), and commit with a
conventional message describing the why.

### Installed skills (pinned in `skills-lock.json`)

| Source | Skills |
|---|---|
| `vercel-labs/skills` | `find-skills` |
| `mattpocock/skills` | `to-spec` · `domain-modeling` · `tdd` · `implement` · `diagnosing-bugs` · `improve-codebase-architecture` · `code-review` · `handoff` |
| `obra/superpowers` | `writing-plans` · `executing-plans` · `systematic-debugging` · `verification-before-completion` |
| `anthropics/skills` | `frontend-design` |
| this repository | `spec-first-design` · `dexie-schema-guardian` · `i18n-checker` · `visual-ui-reviewer` · `smart-test-runner` · `git-session-closer` |

Management:

```bash
pnpm skills:list     # what is installed, and from where
pnpm skills:update   # bump to upstream latest — review the diff before committing
npx skills find      # search the registry for a new skill
```

Skills are third-party instructions that run with full agent permissions. They
are reviewed at install time, pinned by content hash in `skills-lock.json`, and
installed into `.agents/skills/` only (no `.claude/`, no per-agent copies).
Re-read a skill's `SKILL.md` before trusting an update.

## 12. AI infrastructure quality layer

`.ai/infra/` validates the infrastructure itself — the instructions, skills,
manifests, memory and evaluation scenarios that this file depends on. It does not
re-implement `pnpm agent:verify`, `agent:schema` or `agent:audit-i18n`; those stay
the authorities for code. Index: [`.ai/infra/README.md`](.ai/infra/README.md).

| Command | Answers |
|---|---|
| `pnpm agent:infra` | Are instruction files, links, skill frontmatter, `skills-lock.json` and the MCP manifests valid and consistent? |
| `pnpm agent:drift` | Does the documentation still match `package.json`, the Dexie schema, documented commands and code symbols? |
| `pnpm agent:security` | Secrets, unpinned MCP packages, unsafe shell in agent assets, over-broad guard permissions, skill provenance |
| `pnpm agent:context` / `pnpm agent:impact` | What must I read, which skills apply, and which suites cover these files? |
| `pnpm agent:delegate` | Which task owns which files right now? |
| `pnpm agent:eval` | Do the ten agent-behavior scenarios still pass deterministically? |
| `pnpm agent:review` | What evidence is missing before a reviewer reads the diff? |
| `pnpm agent:test-health` | Repeated failures, flaky candidates, slow tests, duration trend |
| `pnpm agent:usage` | Counts-only usage/cost report (opt-in; no provider telemetry exists) |
| `pnpm agent:infra:all` | The CI job (validation + drift + security), runnable locally |

Rules for this layer:

- **Report, do not rewrite.** Drift findings are actionable output; no script
  edits a document or restructures code.
- **Accepted drift is explicit.** `.ai/infra/drift-baseline.json` entries need a
  reason and an `expiresAt`; an expired entry fails again.
- **Derive versions from configuration.** `package.json` and
  `lib/db/dexie.ts` are the sources of truth; the checks compare the docs to them.
- **No new dependencies and no mandatory LLM calls.** Node builtins only; the
  model grader is opt-in (`--model-cmd`) and absent from CI.
- **Permissions are documented honestly.** See
  [`.ai/infra/permission-model.md`](.ai/infra/permission-model.md) for the split
  between what a hook enforces and what is instruction only.
- **Delegation is coordination, not a lock.** See
  [`.ai/infra/delegation-protocol.md`](.ai/infra/delegation-protocol.md).
- **CI covers infrastructure only.** `.github/workflows/ai-infra.yml` runs on
  infrastructure path changes; the product gate remains `pnpm agent:verify`.
