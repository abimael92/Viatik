# PR quality checklist

An **evidence collector**, not a second reviewer. The `code-review` skill remains
the review; this script gathers the facts a reviewer needs before reading the
diff and refuses to guess about verification.

```bash
pnpm agent:review                 # diff vs HEAD
pnpm agent:review --base main     # diff vs a branch
pnpm agent:review --json
pnpm agent:review --strict        # WARN/REVIEW items fail the run
```

## Items

| Item | What it checks | Status meaning |
|---|---|---|
| Scope | files grouped by area (`app`, `components`, `features`, `lib`, `supabase`, tests, agent infra, config) | INFO — read it, decide if the scope matches the request |
| Tests | code changed without a test change | WARN — add a regression test or explain why none is needed |
| i18n | TSX changed without `lib/i18n/frontend-copy.ts` | REVIEW — run `pnpm agent:audit-i18n` |
| Accessibility | TSX changed | REVIEW — 44px targets, Radix aria state (`visual-ui-reviewer`) |
| Memory | `memory/MEMORY.md` not updated | WARN — `AGENTS.md` §7 requires a dated entry |
| Spec | no spec filename matches a changed feature area | REVIEW — confirm a spec exists |
| Security | auth/RLS/server-action surface changed | REVIEW — Security Agent review required |
| Schema | `lib/db`, `lib/sync`, repositories or mappers changed | REVIEW — run `pnpm agent:schema`, complete the migration checklist |
| Verification | always | UNKNOWN — the script cannot infer results; run `pnpm agent:verify && pnpm agent:schema && pnpm agent:audit-i18n` (plus `pnpm build` for routes/schema) |
| Review | always | INFO — run the `code-review` skill over the same base |

## Why not another mandatory gate

The repository already has a three-tier verification gate and a code-review
skill. A second mandatory review layer would duplicate them and slow every
change. This checklist is advisory (`--strict` is opt-in) and its only job is to
make missing evidence visible before a human reads the diff.
