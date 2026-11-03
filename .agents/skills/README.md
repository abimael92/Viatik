# Viatik agent skills

Deterministic procedures for the rules in `AGENTS.md`, `CLAUDE.md`, and
`.ai/constitution.md`. A card tells you *when* to use it, *how* to run it, and how
to undo it. A script does the checking, so the answer does not depend on how much
of the codebase you have read this turn.

## Library

| Skill | Card | Script | Run it when |
|---|---|---|---|
| Spec first | [`spec-design.md`](spec-design.md) | — | any feature, route, schema, dependency, or behavior change |
| Dexie guardian | [`db-guardian.md`](db-guardian.md) | `verify-schema.ts` | `lib/db/**`, `lib/sync/**`, repositories, mappers, migrations |
| i18n checker | — | `i18n-audit.sh` | any `.tsx` under `app/`, `components/`, `features/` |
| Visual UI reviewer | [`ui-standards.md`](ui-standards.md) | — | any `.tsx` or `app/globals.css` change |
| Smart test runner | — | `test-runner.sh` | after every code change |
| Session closer | [`session-close.md`](session-close.md) | — | end of every turn |

Each skill also has an agent-discoverable wrapper at
`.agents/skills/<skill>/SKILL.md` (the `.agents` skills standard, read by Devin
CLI, Claude Code, Cursor, and others). The wrapper is frontmatter plus a pointer —
the card is the source of truth.

## Community skills (installed, pinned)

Fourteen skills from the open registry are installed alongside the local ones by
the Skills CLI and pinned by content hash in [`skills-lock.json`](../../skills-lock.json).
They are copied into `.agents/skills/<name>/` only — no `.claude/` copies, no
symlinks.

| Source | Skills |
|---|---|
| `vercel-labs/skills` | `find-skills` |
| `mattpocock/skills` | `to-spec` · `domain-modeling` · `tdd` · `implement` · `diagnosing-bugs` · `improve-codebase-architecture` · `code-review` · `handoff` |
| `obra/superpowers` | `writing-plans` · `executing-plans` · `systematic-debugging` · `verification-before-completion` |
| `anthropics/skills` | `frontend-design` |

They are wired into the six-phase lifecycle in `AGENTS.md` §11. Local cards win
when the two disagree.

```bash
pnpm skills:list     # installed skills + source
pnpm skills:update   # bump upstream — review the diff, then commit the lockfile
npx skills remove <name>   # drop one
```

Two rules for these: **review before you trust an update** (they run with full
agent permissions, and an update can change instructions), and **never commit a
skill that contradicts `AGENTS.md` §3** — the invariants are not negotiable.
`npx skills` collects anonymous telemetry; run installs with
`DISABLE_TELEMETRY=1` in this repository.

## Commands

```bash
pnpm agent:verify                                  # lint + typecheck + test
pnpm agent:schema                                  # node .agents/skills/verify-schema.ts
pnpm agent:audit-i18n                              # bash .agents/skills/i18n-audit.sh
pnpm agent:test:affected                           # bash .agents/skills/test-runner.sh
pnpm agent:test:affected --full --coverage         # whole suite + coverage gate
pnpm skills:list                                   # installed community skills
pnpm repomix:pack                                  # .ai/codebase-snapshot.xml (gitignored)
```

Direct invocation works too and takes the same flags:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .agents/skills/verify-schema.ts
bash .agents/skills/i18n-audit.sh --all --warn
bash .agents/skills/test-runner.sh --dry-run
```

## Ground rules for every script here

- **Read-only by default.** `verify-schema.ts` and `i18n-audit.sh` never write.
  `test-runner.sh` writes only `coverage/` and, with `--update-baseline`,
  `coverage-baseline.json`.
- **Fail loudly, exit non-zero.** No guard silently passes because it could not
  run; it says so on stderr.
- **No new runtime dependencies.** Node builtins and POSIX shell only, so the
  guards keep working when the toolchain moves.
- **macOS-safe shell.** `/bin/bash` is 3.2 here: no `mapfile`, no associative
  arrays, no `set -u` with empty arrays.
- **A guard that cries wolf is worse than no guard.** If a check produces a false
  positive, fix the check in the same change and record it in `memory/MEMORY.md`.

## Adding a skill

1. Card at `.agents/skills/<name>.md` with the five headings: Trigger, Inputs,
   Procedure, Exit criteria, Rollback.
2. Script (if any) at `.agents/skills/<name>.{sh,ts}`, read-only, exit 1 on
   violation, no dependencies.
3. Wrapper at `.agents/skills/<name>/SKILL.md` with `name`, `description`,
   `allowed-tools`.
4. Row in the table above and in `AGENTS.md` §10.
5. Add the package script if the skill is run often enough to deserve one.
