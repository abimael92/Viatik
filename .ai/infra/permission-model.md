# Agent permission model

This document classifies agent operations and, for each class, states **what
actually enforces it**. A prose rule is not a sandbox: where the only control is
an instruction in `AGENTS.md`, this file says so.

Status legend:

- **Enforced** — a tool, hook, or CI check blocks the operation.
- **Advisory** — a script reports the operation, but the agent can ignore it.
- **Instruction** — nothing technical stops it; the rule lives in `AGENTS.md` /
  `.ai/constitution.md`.

## 1. Read-only

Inspect files, search the repository, analyze architecture, read documentation,
run safe inspection commands (`git status`, `git diff`, `rg`, the `.ai/infra`
validators, `pnpm lint --help`).

| Control | Status |
|---|---|
| Client/agent read permissions | **Enforced** by the agent runtime, not by this repository |
| `.ai/infra/scripts/*` are read-only | **Enforced** by the scripts themselves (no write calls) |
| No domain data is fetched | **Instruction** — there is no read-only sandbox here |

## 2. Controlled modifications

Edit source files, add tests, modify documentation, update configuration, add a
dependency.

| Control | Status |
|---|---|
| `pnpm lint` + `pnpm typecheck` | **Enforced** by `.husky/pre-commit` and `pnpm agent:verify` |
| Staged-file lint | **Enforced** by `lint-staged.config.mjs` |
| Dexie additive migrations + no outbox writes outside `lib/sync/` | **Enforced** by `pnpm agent:schema` (when run; pre-commit does not run it) |
| i18n parity and raw-copy check | **Enforced** by `pnpm agent:audit-i18n` (when run) |
| Skill/MCP/instruction consistency | **Enforced** by `pnpm agent:infra` in CI |
| Documentation/version drift | **Enforced** by `pnpm agent:drift` in CI |
| Dependency pinning (exact version, >7 days old) | **Instruction** — no automated age check |
| Two agents not editing one file | **Advisory** — `delegate.mjs claim/check` refuses an overlap, but nothing prevents an edit without a claim |

## 3. Approval-required

These operations need an explicit human decision **before** they happen. None of
them is blocked by a repository hook; the agent must ask.

| Operation | Control |
|---|---|
| Delete or rewrite significant existing functionality | **Instruction** — `AGENTS.md` §9 removal inventory; no automated gate |
| Modify production data | **Instruction** — no agent credential for production exists in this repository |
| Destructive database operations (`supabase db reset`, `Dexie.delete`, `drop table`, bulk delete) | **Instruction** — not run automatically by any script here |
| Change security policies (RLS, auth, branch protection) | **Instruction** — CI validates syntax, not intent |
| Expose credentials | **Advisory** — `security-audit.mjs` detects common shapes, but a novel secret can pass |
| Commit, push, merge, publish | **Instruction** — `AGENTS.md` §8 and the session-closer card; the agent runtime may also require approval |
| Modify external services or production environments | **Instruction** — no MCP server in `mcp.json` can write to production (the git server can rewrite a local branch if asked) |

## 4. What a hook actually stops

The repository has one commit hook (`.husky/pre-commit`):

```text
pnpm exec lint-staged && pnpm lint && pnpm typecheck
```

It blocks a commit on lint or type errors. It does **not** run the schema guard,
the i18n audit, the infra validator, or the tests — those are required by
`AGENTS.md` §5 and are the agent's responsibility (CI covers the infrastructure
subset).

## 5. Delegation is coordination, not a lock

`delegate.mjs` records a short-lived claim and refuses an overlapping claim. It
cannot stop an agent from editing a file without claiming it, and the state file
is machine-local and gitignored. Treat it as a coordination protocol that makes
overlap visible, not as a mutex.

## 6. Escalation

When an operation falls in §3, the agent must state the exact command or change,
why it is needed, and what it affects — then wait. If a rule here and a third-party
skill disagree, this repository wins (`AGENTS.md` §11).
