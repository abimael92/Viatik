# Skill — git session closer

**Script:** none; this card orchestrates the others.
**Enforced by:** `.ai/constitution.md` rule 1 · `AGENTS.md` §5 and §7.

## Trigger

End of **every** agent turn that changed a file — including "small" ones.

## Procedure

Run the steps in order. Stop at the first failure and report it; never skip a
step to make the turn look finished.

### 1. Verification gate

```bash
pnpm agent:verify        # pnpm lint && pnpm typecheck && pnpm test
```

Run `pnpm build` too when the change touches routing, server components, server
actions, or schema. A command may only be reported as passing if it actually ran
in this session — quote the numbers.

### 2. Targeted suites (cheap feedback while iterating)

```bash
bash .agents/skills/test-runner.sh              # suites affected by the diff
bash .agents/skills/test-runner.sh --full --coverage
```

### 3. Domain guards

```bash
node .agents/skills/verify-schema.ts            # additive migrations + outbox writes
bash .agents/skills/i18n-audit.sh               # raw copy + en/es parity
```

Both exit 1 on a violation. Fix the code, not the guard.

### 4. Memory update (dedupe first)

Read `memory/MEMORY.md` §7 before writing. If this discovery already exists,
**update that entry** (or skip it) instead of adding a near-duplicate. Then:

- append a dated entry at the top of §7 using the four-field format
  (`Changed` / `Schema` / `Verification` / `Gotchas`),
- bump `Last updated` at the top of the file,
- update the topic file whose subject changed: `memory/data-models.md` (schema,
  sync), `memory/components-ui.md` (UI, hooks), `memory/roles-abilities.md`
  (permissions), and `.ai/CONTEXT.md` (stack, features).

A "gotcha" worth writing is one the next agent would otherwise re-discover the
hard way: a non-obvious invariant, a flaky test cause, a framework quirk, a
command that does not do what its name says.

### 5. Conventional commit message

Summarize the **why**, not a file list. Scope in parentheses when it helps.

```text
<type>(<scope>): <imperative summary>

<body: what changed and why, only when the subject is not enough>
```

Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `perf`, `build`, `ci`.
Examples that fit this repository:

- `feat(scout): price vibe cards from Scout's own results`
- `fix(expenses): keep settlement ledger append-only on retry`
- `chore(agents): establish enterprise AI skills suite, MCP config, and context engine`

Do not push, do not force-push, do not amend a published commit. Do not commit
when there is nothing staged.

### 6. Report

State: what changed, the commands that ran and their result, what is still open,
and anything the user must decide. If a check failed, say so in the first line.

## Exit criteria

- `pnpm agent:verify` ran and passed (or the failure is reported with its output).
- Both guards exit 0.
- `memory/MEMORY.md` has exactly one new entry for this turn.
- A commit message exists that a reviewer can read without the diff.

## Rollback

- Gate failure → fix forward; never delete a test, a copy key, or UI to go green
  (`AGENTS.md` §9 rule 5).
- Wrong commit already made and **not** pushed → `git reset --soft HEAD~1`, restage,
  re-commit.
- Wrong commit already pushed → add a corrective commit. History is not rewritten.
