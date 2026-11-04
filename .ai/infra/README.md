# AI infrastructure layer

Deterministic checks for the **agent infrastructure** in this repository — the
instructions, skills, MCP manifests, memory files, and evaluation scenarios that
tell an agent how to work. It complements, and never replaces, the product gates:
`pnpm agent:verify`, `pnpm agent:schema`, and `pnpm agent:audit-i18n` remain the
authorities for application code.

Entry point for agents stays [`AGENTS.md`](../../AGENTS.md); this layer is §12.

## Commands

| Command | Script | What it answers |
|---|---|---|
| `pnpm agent:infra` | `scripts/validate-infra.mjs` | Are the instruction files, skills, lockfile and MCP manifests valid and consistent? |
| `pnpm agent:infra:probe` | same, `--probe` | Do the pinned MCP packages still answer `--help`? (network, opt-in) |
| `node .ai/infra/scripts/validate-infra.mjs --provenance` | same, `--provenance` | Which external skills are pinned, from where, and is each still installed? |
| `pnpm agent:drift` | `scripts/drift-report.mjs` | Does the documentation still match `package.json`, the Dexie schema, and the code? |
| `pnpm agent:security` | `scripts/security-audit.mjs` | Secrets, unpinned MCP packages, unsafe shell, over-broad guards, provenance |
| `pnpm agent:context` | `scripts/context-manifest.mjs` | What must I read and run for these files? |
| `pnpm agent:impact` | same, `--impact` | Same, plus regression areas and the affected test plan |
| `pnpm agent:delegate` | `scripts/delegate.mjs` | Who owns which files right now? |
| `pnpm agent:usage` | `scripts/usage-log.mjs` | Counts-only usage and cost report (opt-in) |
| `pnpm agent:test-health` | `scripts/test-health.mjs` | Repeated failures, flaky candidates, slow tests, duration trend |
| `pnpm agent:review` | `scripts/review-checklist.mjs` | Evidence a reviewer needs before reading the diff (advisory) |
| `pnpm agent:eval` | `scripts/run-evaluations.mjs` | Do the agent-behavior scenarios still pass deterministically? |
| `pnpm agent:infra:all` | validate + drift + security | The CI job, runnable locally |

Direct invocation works too; every script has `--help` and most accept `--json`.

## Layout

```
.ai/infra/
├── README.md                  # this file
├── permission-model.md        # read-only / controlled / approval-required, and what actually enforces it
├── delegation-protocol.md     # multi-agent contract + ownership + conflict rules
├── context-routing.md         # how the task-context manifest works
├── usage-observability.md     # usage log schema and the telemetry limitation
├── review-checklist.md        # PR evidence checklist (complements the code-review skill)
├── drift-baseline.json        # accepted drift, with a reason and an expiry date
├── evaluations/
│   ├── README.md
│   └── scenarios/*.json       # 10 deterministic behavior scenarios
└── scripts/
    ├── lib.mjs                # shared helpers (Node builtins only)
    ├── validate-infra.mjs
    ├── drift-report.mjs
    ├── security-audit.mjs
    ├── context-manifest.mjs
    ├── delegate.mjs
    ├── usage-log.mjs
    ├── test-health.mjs
    ├── review-checklist.mjs
    ├── run-evaluations.mjs
    └── *.test.mjs             # Vitest suites for the scripts above
```

## Design rules

1. **One responsibility per script.** A script validates, reports, or records —
   never all three.
2. **No new dependencies.** Node builtins and POSIX shell only, so the checks keep
   working when the toolchain moves. No LLM call is required for any deterministic
   command.
3. **Read-only by default.** `validate-infra`, `drift-report`, `security-audit`,
   `context-manifest`, `review-checklist` and `run-evaluations` never write.
   `delegate`, `usage-log` and `test-health` write only inside `.ai/infra/`.
4. **Fail on errors, not on noise.** Warnings print and exit 0. Pre-existing drift
   is recorded in `drift-baseline.json` with a reason and an expiry date; an
   expired baseline fails again.
5. **Derive, do not duplicate.** Version claims are checked against
   `package.json`; the schema version against `lib/db/dexie.ts`; commands against
   the `scripts` block. No second list of versions lives here.
6. **Report, never rewrite.** Drift is actionable output, not an auto-fix.

## What this layer deliberately does not do

- It does not re-implement lint, typecheck, Vitest, the schema guard, or the i18n
  audit.
- It does not call a model. `--model-cmd` is an optional adapter and is not used
  in CI.
- It does not claim skill content-hash verification: the Skills CLI's
  `computedHash` is not reproducible locally (checked 2026-11-03), so the
  validator verifies provenance fields and presence instead.
- It does not sandbox an agent. See
  [`permission-model.md`](./permission-model.md) for the honest split between
  what a tool enforces and what is instruction only.

## CI

[`.github/workflows/ai-infra.yml`](../../.github/workflows/ai-infra.yml) runs
`agent:infra:all` and the script unit tests when infrastructure paths change. It
uses the repository lockfile and adds no tooling.
