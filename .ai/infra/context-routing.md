# Context routing

`AGENTS.md` is the entry point. This document describes the optional
**task-context manifest** that helps an agent load the smallest useful set of
files for a change, without reading the whole repository.

```bash
pnpm agent:context                      # current diff vs HEAD
pnpm agent:context --files lib/db/dexie.ts,features/expenses/data/x.ts
pnpm agent:impact                       # + regression areas and affected tests
pnpm agent:context --json               # for tooling
```

## What it maps

| Input signal | Output |
|---|---|
| Path family (`lib/db`, `lib/sync`, `supabase`, `features/*/data`, `features/*/components`, `app`, `lib/i18n`, tests, dependencies) | documents to read, skills to invoke, memory topics, affected modules, verification commands, regression notes |
| Changed file names | related specs in `.ai/specs/` (filename token match, generic words excluded) |
| The working-tree diff | the affected Vitest suites, via the existing `test-runner.sh --dry-run` (reused, not reimplemented) |

The rule table lives in `scripts/context-manifest.mjs` (`RULES`). Adding a path
family means adding one row, not editing every document.

## Why it is a map, not an index

- It reads path patterns and existing filenames. There is no embedding store, no
  build step, and no cache to invalidate.
- It reuses `test-runner.sh` for test selection instead of duplicating the
  mapping.
- It never replaces `AGENTS.md`, the constitution, or a spec. It points at them.
- An explicit `--files` list skips the test plan: the runner maps a real diff, and
  pretending an arbitrary list is one would be wrong.

## Cost notes

- The manifest is one Node process over a directory listing — well under a
  second on this repository.
- Prefer `--files` while planning and the default diff mode before closing a turn.
- `pnpm repomix:pack` (a full-source snapshot) remains available for a deliberate
  whole-repository review, not for routine context loading.
