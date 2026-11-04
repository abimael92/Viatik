# Agent evaluations

Repeatable scenarios that check whether an agent *can* behave correctly in this
repository. Each scenario is a JSON file describing a situation, the behavior it
expects, the behavior it prohibits, and deterministic checks that prove the
repository still contains the artifacts that behavior depends on.

```bash
pnpm agent:eval                    # all scenarios
pnpm agent:eval --list
pnpm agent:eval --scenario db-migration-safety
pnpm agent:eval --json
```

Deterministic by default: no model call, no network, safe for CI.

## Scenario schema

```json
{
  "id": "db-migration-safety",
  "title": "Dexie migrations stay additive and writes stay transactional",
  "category": "database-safety",
  "prompt": "The task handed to the agent",
  "initialContext": ["files the agent may read first"],
  "expectedBehavior": ["observable behavior"],
  "prohibitedBehavior": ["behavior that must not happen"],
  "criteria": ["what a grader checks"],
  "deterministicChecks": [
    { "type": "file-exists", "path": "AGENTS.md" },
    { "type": "file-contains", "path": "AGENTS.md", "pattern": "Dexie first" },
    { "type": "file-not-contains", "path": "AGENTS.md", "pattern": "npm install" },
    { "type": "json-field", "path": "skills-lock.json", "field": "skills" },
    { "type": "script-exits-zero", "command": "node", "args": [".agents/skills/verify-schema.ts", "--quiet"] }
  ]
}
```

Check types: `file-exists`, `file-contains`, `file-not-contains`, `json-field`
(`field` supports `a.b`, `exists: false` asserts absence), and
`script-exits-zero`.

## Coverage

| Scenario | Category |
|---|---|
| `architecture-discovery` | finds the Dexie/Supabase boundary before designing |
| `spec-first-compliance` | writes the spec before code |
| `db-migration-safety` | additive migrations, transactional writes |
| `preserve-existing-functionality` | removal inventory and scope control |
| `test-selection-and-verification` | selects suites and proves the gate ran |
| `git-safety` | no force-push, no hook bypass, no destructive reset |
| `security-sensitive-change` | server-side authorization, no secrets |
| `skill-discovery` | picks the phase-appropriate skill |
| `context-loading-efficiency` | loads the smallest useful set of files |
| `multi-agent-delegation` | explicit contract and disjoint ownership |

## Optional model grading

```bash
pnpm agent:eval --model-cmd "<command>"
```

The command receives one scenario JSON on stdin and must print
`{"pass": true|false, "rationale": "..."}`. It is an extension point: the
repository configures no provider, so this is never used in CI and never required
for a deterministic pass.

## Adding a scenario

1. Add `scenarios/NN-<id>.json` with every key above.
2. Prefer checks that assert a **contract**, not a wording: a file that must
   exist, a guard that must exit 0, a key that must be present.
3. Run `pnpm agent:eval` and `pnpm exec vitest run .ai/infra`.
4. Do not weaken a check to make a scenario pass — fix the repository or remove
   the scenario with a recorded reason.
