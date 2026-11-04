# Multi-agent delegation protocol

Use this when a task is split across more than one agent. It extends the handoff
format in [`.ai/AGENTS.md`](../AGENTS.md) and the six-phase lifecycle in
[`AGENTS.md`](../../AGENTS.md) §11 — it does not replace either.

Delegation is a cost, not a default. One agent that can finish the task should
finish the task. Split only when the work is genuinely parallel, or when a
read-only investigation would pollute the implementer's context.

## Delegation contract

Every delegated task starts with this block, written into the task description
(not improvised in chat):

```markdown
## Delegation contract
- Objective: <one outcome, testable>
- Scope: <paths and behaviors in>
- Out of scope: <paths and behaviors explicitly not touched>
- File ownership: <globs this agent may edit — nothing else>
- Relevant context: <docs, specs, skills, memory topics to read>
- Restrictions: <removal gate, no schema edits, no dependency changes, ...>
- Deliverables: <code, tests, spec update, report>
- Verification owner: <who runs the final gate — normally the lead agent>
- Claim: <task id registered with delegate.mjs>
```

File ownership is the load-bearing field. Two agents must never own the same
path. Claim paths before editing:

```bash
pnpm agent:delegate claim --task expenses-a --agent impl-1 --files "features/expenses/data/**,features/domain/money.ts"
pnpm agent:delegate check --files "features/expenses/components/expense-form-sheet.tsx"
pnpm agent:delegate status
pnpm agent:delegate release --task expenses-a
```

Overlap is conservative: if two globs could touch the same file, the claim is
refused. `--takeover --reason "<decision>"` is the only way through, and it
records who decided and why.

## Protocols

### Parallel investigation (read-only)

Several agents may inspect the same paths. No claim is needed because nothing is
edited. Each returns findings to the lead; the lead merges them and is
responsible for contradictions.

### Independent implementation

- Disjoint file ownership, one claim per task.
- Each agent writes its own tests for its own paths.
- Neither agent runs the final gate; the lead does, after integration.
- Shared files (`lib/db/dexie.ts`, `lib/sync/**`, `lib/i18n/frontend-copy.ts`)
  are owned by exactly one agent — normally the lead.

### Conflicting findings

When two agents disagree about a root cause or a design:

1. The lead asks each for the evidence (file, line, command output), not the
   conclusion.
2. The lead reproduces the smallest case.
3. If the evidence does not settle it, the lead stops and escalates to the user.
   Silently picking one finding is prohibited.

### Overlapping file modifications

If a second agent needs a path that is already claimed:

1. `delegate.mjs check --files <path>` shows the owner.
2. Coordinate with the owner: either the owner makes the edit, or ownership is
   transferred with `--takeover --reason "..."`.
3. Never edit first and disclose later.

### Lead-agent integration

The lead agent owns:

- the shared files listed above,
- the spec and `memory/MEMORY.md` entry,
- conflict resolution,
- the final verification run.

### Final verification

The lead runs the full gate after integration, on the combined tree:

```bash
pnpm agent:verify
pnpm agent:schema
pnpm agent:audit-i18n
pnpm agent:infra && pnpm agent:drift && pnpm agent:security
```

A delegated agent may report its own results, but the lead must not report a
command as passing unless it ran in the lead's session (or the output is attached
verbatim with the command and exit code).

## Limits

- Claims are machine-local and gitignored; they coordinate agents sharing a
  working tree, not agents on different machines.
- Claims expire after 8 hours by default (`--ttl`). An expired claim is not a
  lock.
- This protocol does not sandbox anything. See
  [`permission-model.md`](./permission-model.md).
