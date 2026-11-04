# AI Infrastructure Quality Layer — validation, evaluation, security, context

**Status:** implemented (2026-11-03)
**Owner:** repository maintainers
**Related:** [`AGENTS.md`](../../AGENTS.md) §12 · [`memory/MEMORY.md`](../../memory/MEMORY.md) ·
[`.ai/infra/README.md`](../infra/README.md) · [`agent-tooling-ecosystem.md`](./agent-tooling-ecosystem.md)

## What & Why

The 2026-11-02 agent tooling change (`.ai/specs/agent-tooling-ecosystem.md`) gave
Viatik a deterministic **skill** layer: six instruction cards, three guards, an MCP
manifest, and a three-tier verification gate. What it did not give the repository
is a way to check the **infrastructure itself**: whether a skill's frontmatter is
still valid, whether `AGENTS.md` still states the versions that `package.json`
ships, whether a documented command exists, whether an MCP package is still pinned,
or whether an agent actually behaved the way the instructions require.

Today those checks happen by reading prose. This change adds a small, deterministic
governance layer under `.ai/infra/` that validates, reports, evaluates, and records —
without replacing any existing skill, guard, or gate.

## Scope

### In scope

| Deliverable | Path | Command |
|---|---|---|
| Infrastructure validation (instructions, links, skills, lockfile, MCP config) | `.ai/infra/scripts/validate-infra.mjs` | `pnpm agent:infra` |
| Instruction + architecture drift report | `.ai/infra/scripts/drift-report.mjs` | `pnpm agent:drift` |
| Security and supply-chain audit | `.ai/infra/scripts/security-audit.mjs` | `pnpm agent:security` |
| Task context manifest | `.ai/infra/scripts/context-manifest.mjs` | `pnpm agent:context` |
| Change impact analysis | same script, `--impact` | `pnpm agent:impact` |
| Delegation claims + overlap detection | `.ai/infra/scripts/delegate.mjs` | `pnpm agent:delegate` |
| Usage/cost observability (opt-in, local) | `.ai/infra/scripts/usage-log.mjs` | `pnpm agent:usage` |
| Test reliability ledger | `.ai/infra/scripts/test-health.mjs` | `pnpm agent:test-health` |
| PR quality checklist (evidence collector) | `.ai/infra/scripts/review-checklist.mjs` | `pnpm agent:review` |
| Agent evaluation framework + scenarios | `.ai/infra/scripts/run-evaluations.mjs`, `.ai/infra/evaluations/` | `pnpm agent:eval` |
| Permission model | `.ai/infra/permission-model.md` | — (documentation) |
| Multi-agent contract | `.ai/infra/delegation-protocol.md` | — (documentation) |
| CI validation | `.github/workflows/ai-infra.yml` | GitHub Actions |
| Script unit tests | `.ai/infra/scripts/*.test.mjs` | `pnpm exec vitest run .ai/infra` |

### Out of scope

- No change to `lib/db/dexie.ts`, `lib/sync/**`, `supabase/**`, or any product
  behavior.
- No change to the six local skill cards, the fourteen pinned community skills, or
  their `SKILL.md` wrappers. The one exception is `.agents/skills/test-runner.sh`,
  which gains an opt-in `--health` flag (additive; default behavior unchanged).
- No new runtime dependency, and no new devDependency. Every script uses Node
  builtins and POSIX shell only.
- No mandatory LLM calls. Model-based evaluation is an opt-in adapter
  (`--model-cmd`), documented but not executed by default.
- No automatic rewriting of documentation. Drift is reported, never patched.

## Gap analysis (what already exists, and what this change adds)

| Capability | State before | Decision |
|---|---|---|
| Centralized agent instructions | `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*` | **Reuse** — no rewrite |
| Persistent memory | `memory/MEMORY.md` + 3 topic files | **Reuse** — add session entry only |
| Skills | 20 skills (6 local + 14 pinned) | **Reuse** — validate, do not modify |
| Spec-first workflow | `.ai/specs/`, `.ai/templates/` | **Reuse** — this file is the spec |
| Schema/outbox guard | `verify-schema.ts` | **Reuse** — untouched |
| i18n guard | `i18n-audit.sh` | **Reuse** — untouched |
| Smart test runner | `test-runner.sh` | **Extend** — `--health` flag only |
| Verification gate | `pnpm agent:verify` | **Reuse** — untouched |
| MCP manifest + trust notes | `mcp.json`, `.agents/mcp.md` | **Reuse** — validate, no new server |
| Git lifecycle | Husky + `lint-staged` | **Reuse** — untouched |
| CI | **absent** (`.github/workflows` did not exist) | **Add** — minimal, path-filtered |
| Infra validation | absent | **Add** |
| Skill metadata validation | absent | **Add** |
| Drift detection | absent | **Add** |
| Permission model doc | absent (rules exist in prose only) | **Add** |
| Security audit of agent assets | absent (GitGuardian config exists, no local run) | **Add** |
| Context manifest | absent (context map is a static table) | **Add** |
| Evaluations | absent | **Add** |
| Delegation contract | prose handoff format only | **Add** (contract + claim tool) |
| Usage observability | absent | **Add** (opt-in, local) |
| Test reliability ledger | absent (runner only runs) | **Add** |
| PR checklist | `code-review` skill reviews, no evidence collector | **Add** (advisory) |
| Skill integrity | content hashes pinned by the Skills CLI | **Partially** — verify lock shape and provenance; the CLI's `computedHash` algorithm is not reproducible locally (verified 2026-11-03: sha256 of `SKILL.md` ≠ `computedHash`), so hash **recomputation is not claimed** |
| MCP health | trust notes + one manual smoke test | **Add** — config validation always, `--probe` opt-in |
| Architecture drift | prose invariants | **Add** — directory, import-boundary, sync-table checks |

## Removal / relocation inventory (AGENTS.md §9)

Nothing is deleted or relocated. Two existing files change, both additively:

| Item | Classification | Effect |
|---|---|---|
| `.agents/skills/test-runner.sh` | **requested** (task item K: "extend the existing smart test runner") | Gains `--health`, which writes a JSON report and calls `test-health.mjs ingest`. Default runs are byte-for-byte the same behavior. |
| `package.json` `scripts` | **requested** | Adds `agent:*` entries. No existing script changes. |
| `AGENTS.md` | **requested** (documentation must reflect implementation) | Adds §12. The `nextjs-agent-rules` block and §1–§11 are untouched. |
| `.ai/llms.txt` | **adjacent, additive** | One cross-reference row so the entry point can find the new layer. |
| `.gitignore` | **adjacent, additive** | Ignores generated usage log, evaluation results, delegation claims, and test reports. |
| `memory/MEMORY.md` | **requested** (repo memory loop) | New dated session entry + `Last updated` bump. |
| `.ai/CONTEXT.md` | **adjacent, additive** | Three command lines so the snapshot stays true. |

## Design

### One script, one responsibility

Every script is a single-purpose CLI with `--help`, `--json` where useful, and a
non-zero exit only for **errors**. Warnings print and exit 0 so a first run on a
real repository does not become noise. The shared code is `.ai/infra/scripts/lib.mjs`
(argument parsing, frontmatter, markdown links, glob overlap, git file lists).

| Script | Reads | Writes | Exit 1 when |
|---|---|---|---|
| `validate-infra.mjs` | instruction docs, skills, lockfile, MCP manifests, package scripts | nothing | a required file is missing, a core link is broken, skill metadata is invalid, a pinned package is unpinned, manifests disagree |
| `drift-report.mjs` | `package.json`, `lib/db/dexie.ts`, docs, imports | nothing | a **new** drift finding is not baselined |
| `security-audit.mjs` | tracked text files, manifests, skill assets | nothing | a secret pattern, tracked `.env`, unpinned MCP package, or unsafe shell snippet is found |
| `context-manifest.mjs` | changed files, repo layout | nothing | nothing (advisory); `--json` for tooling |
| `delegate.mjs` | claims file | claims file | two active claims overlap |
| `usage-log.mjs` | JSON input | `.ai/infra/usage/usage-log.jsonl` | input contains prompt/source fields |
| `test-health.mjs` | Vitest JSON report | `.ai/infra/test-health.json` | never (reporting only) |
| `review-checklist.mjs` | `git diff`, docs | nothing | `--strict` and a required item is missing |
| `run-evaluations.mjs` | scenario JSON | nothing (or `--json`) | a deterministic check fails |

### Drift baseline instead of silent suppression

Pre-existing drift is recorded in `.ai/infra/drift-baseline.json` with a reason, a
`reviewedAt`, and an `expiresAt`. A baselined finding prints as `KNOWN` and does not
fail the run; once `expiresAt` passes the finding fails again, so a baseline cannot
become a permanent excuse.

### Version claims derive from `package.json`

`drift-report.mjs` reads the installed version strings from `package.json` and
asserts that `AGENTS.md`, `.ai/CONTEXT.md`, and `memory/MEMORY.md` state the same
values. The documentation never becomes the source of truth for a version number.

### Permission model: what is enforced, what is instruction

`.ai/infra/permission-model.md` separates operations that a **tool or hook**
actually blocks (Husky gate, schema guard, i18n guard, MCP version pins, CI) from
operations that are **behavioral instructions only** (removal gate, destructive
database commands, push/commit discipline). It never calls a prose rule a sandbox.

### Evaluations are deterministic first

Ten scenarios cover architecture discovery, spec-first compliance, schema safety,
functionality preservation, test selection, git safety, security-sensitive work,
skill selection, context efficiency, and delegation. Each scenario is a JSON file
with a prompt, expected behavior, prohibited behavior, and `deterministicChecks`
that assert the repository still contains the artifacts the behavior depends on
(for example, that `verify-schema.ts` exits 0 and that the removal gate text still
exists in `AGENTS.md` §9). Model-based grading is an optional adapter:
`--model-cmd "<command>"` receives the scenario JSON on stdin and must print a JSON
verdict. It is not run by default and is not part of CI.

## Acceptance criteria

1. `node .ai/infra/scripts/validate-infra.mjs` exits 0 on the repository.
2. `node .ai/infra/scripts/drift-report.mjs` exits 0 (baselined findings listed).
3. `node .ai/infra/scripts/security-audit.mjs` exits 0.
4. `node .ai/infra/scripts/run-evaluations.mjs` runs 10 scenarios, all pass.
5. `node .ai/infra/scripts/context-manifest.mjs --files lib/db/dexie.ts` names
   `memory/data-models.md`, the schema guardian, and `agent:schema`.
6. `node .ai/infra/scripts/delegate.mjs claim/check/release` detects an overlap and
   exits 1.
7. `node .ai/infra/scripts/usage-log.mjs` rejects prompt/code fields and aggregates
   recorded runs.
8. `node .ai/infra/scripts/test-health.mjs ingest` records a run and reports a test
   that failed twice.
9. `.github/workflows/ai-infra.yml` is valid YAML and runs the checks on
   infrastructure path changes.
10. `pnpm lint`, `pnpm typecheck`, and `pnpm exec vitest run .ai/infra` pass.
11. Existing gates still pass: `pnpm agent:verify`, `pnpm agent:schema`,
    `pnpm agent:audit-i18n`, and `bash .agents/skills/test-runner.sh --dry-run`.

## Security

- No secrets are read, printed, or written by any script. The secret audit prints
  `file:line` and a pattern name only.
- The usage log deliberately excludes prompts, source, diffs, and responses; the
  writer rejects those field names.
- MCP probing (`--probe`) is opt-in and runs `npx <pkg>@<version> --help`; it never
  starts a server session, never downloads the codegraph engine (the engine is
  fetched on first *start*, not on `--help`), and is excluded from CI.
- `delegate.mjs` writes only inside `.ai/infra/delegation/` (gitignored).
- CI uses the repository's existing lockfile; it installs no extra tooling.

## Known limitations (documented, not hidden)

- **Skill content-hash recomputation is not implemented.** The Skills CLI's
  `computedHash` is not sha256 of `SKILL.md` (verified), so the validator checks
  provenance fields and presence instead of claiming an integrity guarantee it
  cannot provide.
- **Usage telemetry is manual.** No provider or client telemetry endpoint is
  available to this repository, so `usage-log.mjs` records what an agent or wrapper
  supplies. Missing fields are allowed and reported as `unknown`.
- **Delegation claims are machine-local.** The claims file is gitignored, so it
  coordinates agents sharing a working tree, not agents on different machines.
- **Architecture drift is rule-based, not a full graph analysis.** It checks
  documented directories, three import boundaries, and the sync-table contract; it
  is not a substitute for `codegraph` on a deep refactor.
- **The model-based evaluation adapter is not exercised in CI.** It requires a
  provider the repository does not configure.

## Verification

```bash
pnpm agent:infra
pnpm agent:drift
pnpm agent:security
pnpm agent:eval
pnpm agent:context --files lib/db/dexie.ts
pnpm agent:impact
pnpm agent:review --base HEAD
pnpm exec vitest run .ai/infra
pnpm lint && pnpm typecheck
```

Results are recorded in `memory/MEMORY.md` §7.
