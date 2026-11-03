---
name: smart-test-runner
description: Run the Vitest suites that actually cover the current diff, flag .only/.skip, gate coverage regressions
allowed-tools:
  - read
  - grep
  - glob
  - exec
---

```bash
bash .agents/skills/test-runner.sh --dry-run      # show the plan, run nothing
bash .agents/skills/test-runner.sh                # affected suites only
bash .agents/skills/test-runner.sh --full         # whole suite
bash .agents/skills/test-runner.sh --full --coverage
bash .agents/skills/test-runner.sh --full --coverage --update-baseline
```

Maps changed paths to suites: `lib/db/**` → `lib/db/*.test.ts`, `lib/i18n/**` →
`lib/i18n/*.test.tsx?`, `features/<area>/**` → that area's suites,
`components/<dir>/**` → that directory's suites. Docs and `.agents/` / `.ai/` /
`memory/` changes run nothing. An unmapped path falls back to the full suite
rather than silently running zero tests.

It fails the run on a focused test (`.only` silently disables the rest of the
suite), reports `.skip`/`.todo` with line numbers, and — on `--full --coverage` —
compares total line coverage against the committed
`.agents/skills/coverage-baseline.json`. Coverage is only gated for full-suite
runs; comparing a subset to a whole-repo baseline would report false regressions.

Never delete or `.skip` a failing test to get a green run (`AGENTS.md` §9).
