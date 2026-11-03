# Agent Tooling Ecosystem — skills library, MCP layer, context engine

**Status:** implemented (2026-11-02)
**Owner:** repository maintainers
**Related:** [`AGENTS.md`](../../AGENTS.md) §10 · [`memory/MEMORY.md`](../../memory/MEMORY.md) ·
[`.agents/skills/README.md`](../../.agents/skills/README.md) · [`.ai/skills/`](../skills/)

## What & Why

Viatik already documents *what* an agent must respect (constitution, `AGENTS.md`,
`memory/`), but the checks that enforce those rules live in prose. Every session
re-derives them by hand: reading `lib/db/dexie.ts` to guess whether a schema edit
is additive, grepping for unlocalized copy, guessing which Vitest suites cover a
diff, remembering to log to `memory/MEMORY.md`.

This change adds a **deterministic skill layer**: six instruction cards plus three
executables under `.agents/skills/`, an MCP server manifest, and package scripts
that any agent (Devin, Claude Code, Cursor, Copilot Workspace, Gemini CLI) can run
without re-deriving the rules. The goal is fewer hallucinated conventions and a
smaller context bill: a script answers "is this schema edit additive?" faster and
more accurately than an agent reading 800 lines of Dexie history.

## Scope

### In scope

| Deliverable | Path |
|---|---|
| Skills index | `.agents/skills/README.md` |
| Spec-first design card | `.agents/skills/spec-design.md` |
| Dexie schema guardian card + checker | `.agents/skills/db-guardian.md`, `.agents/skills/verify-schema.ts` |
| i18n checker | `.agents/skills/i18n-audit.sh` |
| Visual UI reviewer card | `.agents/skills/ui-standards.md` |
| Smart test runner | `.agents/skills/test-runner.sh` |
| Session closer card | `.agents/skills/session-close.md` |
| Skill wrappers (`SKILL.md`, agent-discoverable) | `.agents/skills/<skill>/SKILL.md` |
| MCP manifest | `mcp.json`, `.cursor/mcp.json`, `.agents/mcp.md` (trust + disable notes) |
| Package scripts | `package.json` → `agent:verify`, `agent:audit-i18n`, `agent:test:affected`, `agent:schema`, `repomix:pack` |
| Staged-file gate | `lint-staged.config.mjs`, `.husky/pre-commit` |
| Context bridges | `AGENTS.md` §10, `CLAUDE.md`, `memory/MEMORY.md` §8 |

### Out of scope

- No change to `lib/db/dexie.ts`, `lib/sync/**`, or any product behavior.
- No change to the Vitest/Playwright configuration or to existing test files.
- No new runtime dependency. `lint-staged` (dev-only) and
  `@vitest/coverage-v8` (dev-only, matching `vitest@4`) are the only additions.
- No CI workflow: the repository has no `.github/workflows`, so the commit hook
  stays the enforcement point.
- The `nextjs-agent-rules` block at the top of `AGENTS.md` is preserved verbatim.

## Removal / relocation inventory (AGENTS.md §9)

Nothing is deleted. Every change is additive or a *strengthening* of an existing
gate. Two items deserve explicit disclosure because they alter an existing file:

| Item | Classification | Effect |
|---|---|---|
| `.husky/pre-commit` | **requested** (task step 4) | `pnpm lint && pnpm typecheck` → `pnpm exec lint-staged && pnpm lint && pnpm typecheck`. Full-repo lint and full typecheck are **kept**, so the gate only grows. |
| `memory/MEMORY.md` section names | **adjacent — resolved by addition** | The task asked for four canonical section titles. The existing sections already cover them under different names; renaming would relocate content that other files cite by number (`§7`). Instead a **section map** was added at the top and the one genuinely missing section (system component & data-flow reference) was appended as §8. |
| `CLAUDE.md` | **requested** | Gains `@memory/MEMORY.md`; `@AGENTS.md` kept. |
| `.ai/codebase-snapshot.xml` | **adjacent** | Added to `.gitignore` so `pnpm repomix:pack` cannot commit a multi-megabyte generated file. |

## Design

### Skill contract

Every card states the same five things, so an agent can act without improvising:
**Trigger → Inputs → Procedure → Exit criteria → Rollback**. Rollback is required
because three of the skills can modify files (`session-close` stages, `verify-schema`
never writes).

### Why scripts, not more prose

| Rule | Prose cost | Deterministic check |
|---|---|---|
| Dexie migrations are additive | read `lib/db/dexie.ts` (800+ lines) and diff mentally | `verify-schema.ts` compares every `this.version(N)` block against `HEAD` |
| Writes go through `append()` | grep-by-hand across `features/**` | `verify-schema.ts` flags `outboxMutations` writes outside `lib/sync/` |
| Copy goes through `t()` | read `frontend-copy.ts` (3.4k lines) | `i18n-audit.sh` + existing `i18n-coverage.test.ts` |
| Which tests cover this diff | guess, then run everything | `test-runner.sh` maps changed paths → suites |

`verify-schema.ts` is dependency-free (Node builtins only) and runs on the
repository's Node 26 via native type stripping, so it cannot drift from the
toolchain. TypeScript's `**/*.ts` include **skips dot-directories**, so the guard
is listed explicitly in `tsconfig.json` `include` — otherwise `pnpm typecheck`
silently ignores it. (Found the hard way on 2026-11-02: `tsc --listFiles` showed
no `.agents/` entry while typecheck reported success.) ESLint does traverse
`.agents/` and lints the guard.

### MCP manifest — three substitutions (verified, not assumed)

The task named three servers. Checked against the npm registry on 2026-11-02:

| Requested | Registry | Shipped instead | Why |
|---|---|---|---|
| `@codegraph/mcp-server` | **404** | `@astudioplus/codegraph-mcp@0.21.0` | same capability (symbol graph, 38 languages); third-party — see trust note |
| `@modelcontextprotocol/server-git` | **404** | `@cyanheads/git-mcp-server@2.15.3` | official git server is Python-only (`uvx mcp-server-git`) and `uv` is not installed here |
| `@modelcontextprotocol/server-playwright` | **404** | `@playwright/mcp@0.0.84` | Microsoft's official Playwright MCP server |

All three are pinned to exact versions (no `latest`, no `-y pkg` without a
version) so a compromised release cannot be pulled in silently. Trust level,
binary-download behavior, and the disable procedure are documented in
`.agents/mcp.md`.

### Coverage gating

"Block commits that lower line coverage" needs a coverage provider, which the repo
does not have. `@vitest/coverage-v8@4.1.12` is added (dev-only, matches
`vitest@4.1.11`). `test-runner.sh --coverage` compares total line coverage against
`.agents/skills/coverage-baseline.json` **only for full-suite runs** — comparing a
subset run to a whole-repo baseline is meaningless and would produce false
regressions. `--update-baseline` rewrites the file; it is committed, so a
regression is visible in review.

## Acceptance criteria

1. `pnpm agent:verify` exits 0 (lint + typecheck + full Vitest).
2. `node .agents/skills/verify-schema.ts` exits 0 on a clean tree and exits 1 when
   a shipped `this.version(N)` block is edited or a new version number skips a
   step.
3. `bash .agents/skills/i18n-audit.sh` exits 0 on the current tree.
4. `bash .agents/skills/test-runner.sh --dry-run` maps a changed path to suites and
   never silently runs zero tests.
5. `pnpm lint` lints `.agents/skills/verify-schema.ts` clean (no ignores added).
6. `mcp.json` parses as JSON and every referenced package resolves on npm.
7. `CLAUDE.md` imports `AGENTS.md` and `memory/MEMORY.md`.
8. `memory/MEMORY.md` carries the section map and a dated session-log entry.

## Security

- No secrets in any skill, manifest, or script; MCP entries carry no `env` block.
- `i18n-audit.sh` and `test-runner.sh` only read; `verify-schema.ts` only reads.
- The `npx -y` risk is bounded by exact version pins and documented in
  `.agents/mcp.md`. `@astudioplus/codegraph-mcp` downloads a native engine at
  install time — flagged as the highest-trust-cost server, with a one-line
  disable path.
- `repomix:pack` writes a full-source snapshot; the output path is gitignored so a
  packed tree cannot leak into a commit or a PR.

## Verification

```bash
pnpm agent:verify                    # lint + typecheck + vitest
node .agents/skills/verify-schema.ts
bash .agents/skills/i18n-audit.sh
bash .agents/skills/test-runner.sh --dry-run
pnpm build                           # routing/server files untouched, run for safety
```

Results are recorded in `memory/MEMORY.md` §7.
