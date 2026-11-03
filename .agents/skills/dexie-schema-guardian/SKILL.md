---
name: dexie-schema-guardian
description: Prove a Dexie change is additive and that every write goes through TransactionContext.append()
allowed-tools:
  - read
  - grep
  - glob
  - exec
---

Read `.agents/skills/db-guardian.md`, then run the guard before and after the edit:

```bash
pnpm agent:schema
# or: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .agents/skills/verify-schema.ts
```

Exit 1 means a shipped `this.version(N)` block was edited, a new version skipped a
number, or something under `features/` / `app/` / `components/` writes to
`outboxMutations` outside `lib/sync/`.

Never edit a shipped version block — add `this.version(N+1)` with an `.upgrade()`
backfill. A synced table also needs a Supabase migration, an RLS policy, a mapper
in `lib/supabase/mappers.ts`, and entries in `SYNC_TABLE_DEFINITIONS` /
`OutboxEntityType`. Local-only tables must not append outbox entries. Money stays
`bigint` minor units.
