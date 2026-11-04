# Usage and cost observability

Optional, local, counts-only. This is an **integration point**, not telemetry:
the repository has no provider or client telemetry endpoint, so nothing is
captured automatically.

```bash
echo '{"model":"<model>","inputTokens":1200,"outputTokens":300,"workflow":"feature","task":"trip-wrap-up"}' \
  | pnpm agent:usage record
pnpm agent:usage report
pnpm agent:usage report --since 2026-11-01 --json
```

The log is `.ai/infra/usage/usage-log.jsonl` (gitignored).

## Record schema

| Field | Type | Notes |
|---|---|---|
| `timestamp` | ISO string | defaults to now |
| `source` | string | `manual` unless a wrapper supplies another value |
| `task` | string | task or session identifier |
| `agent` | string | agent name or role |
| `model` | string | model identifier as reported by the client |
| `provider` | string | optional |
| `workflow` | string | e.g. `feature`, `bugfix`, `review`, `infra` |
| `inputTokens` | number | optional |
| `outputTokens` | number | optional |
| `toolCalls` | number | optional |
| `durationMs` | number | optional |
| `estimatedCostUsd` | number | only when the caller has real pricing; never invented |

Any other field is allowed except the content fields below.

## What is rejected

`prompt`, `prompts`, `messages`, `message`, `content`, `contents`, `sourceCode`,
`code`, `diff`, `patch`, `request`, `response`, `transcript`, `stdout`, `stderr`.

The writer refuses the record instead of truncating it. This keeps the log safe
to leave on disk and impossible to turn into a prompt archive by accident.

## Report

Aggregates runs, token totals, tool calls, total duration, cost (with the number
of runs that actually reported a cost), and counts by workflow, model and agent.
Missing fields are reported as unknown.

## Limitation

No AI client in this repository exposes per-interaction token accounting to a
file, so:

- `source: "manual"` means the numbers were supplied by the agent or a wrapper,
  not measured by the repository;
- a missing `estimatedCostUsd` is not estimated — the report prints cost coverage
  (`reported for N/M runs`);
- the log is machine-local and gitignored, so it is not an organization-wide
  cost ledger.

If a client later exposes usage, a wrapper can write the same JSON to
`usage-log.mjs record` without changing the schema. That is the extensible point.
