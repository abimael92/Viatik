# Skill — Dexie schema guardian

**Script:** `.agents/skills/verify-schema.ts` (read-only, Node builtins only).
**Enforced by:** `AGENTS.md` §3 rules 1–6 · `memory/data-models.md`.

## Trigger

Start this skill when a change touches any of:

- `lib/db/dexie.ts` (schema, versions, upgrades),
- a repository in `features/*/data/dexie-*-repository.ts`,
- `lib/sync/**` (outbox, engine, coordinator),
- `lib/supabase/mappers.ts`, `supabase/migrations/**`, `SYNC_TABLE_DEFINITIONS`,
  `OutboxEntityType`.

## Procedure

1. **Run the guardian first**, before and after the edit:

   ```bash
   node .agents/skills/verify-schema.ts          # exits 1 on a violation
   ```

   It reports three things: the version count and latest version, the number of
   `append()` call sites under `features/`, and any violation.

2. **Never edit a shipped version block.** Every `this.version(N)` that exists in
   the baseline commit must stay byte-identical (whitespace-insensitive). Need a
   different index, a new field, or a backfill? Add `this.version(N+1)`.
   The guardian compares against `HEAD` (`--base <ref>` to change the baseline).

3. **Re-declare the full index string.** Dexie replaces a table's index set, it
   does not merge. Changing `tripMedia` means repeating every index you still
   want.

4. **New version checklist** — all of it, in one change:

   - [ ] `this.version(N+1)` with `.stores({...})` (or `.stores({})` for a pure
         backfill) and an `.upgrade()` that fills the new fields.
   - [ ] Migration test under `lib/db/*-migration.test.ts`.
   - [ ] `supabase/migrations/000000000000NN_*.sql` for synced tables.
   - [ ] RLS policy for the new table/column.
   - [ ] `lib/supabase/mappers.ts` both directions.
   - [ ] `SYNC_TABLE_DEFINITIONS` + `OutboxEntityType` entries.
   - [ ] `memory/data-models.md` updated.
   - [ ] Local-only tables (`tripBudgets`, `tripPins`, `feedItems`, `packingItems`,
         `polls`, `profiles`, `currencyRates`, …) do **not** append outbox entries.

5. **Writes stay transactional.** A domain row and its outbox entry are written in
   one `TransactionContext.runInTransaction(...)` using `append()` from
   `lib/sync/outbox-transactional`. The guardian fails the run if anything under
   `features/`, `app/`, or `components/` writes to `outboxMutations` directly
   (`.add`, `.put`, `.bulkAdd`, `.bulkPut`, `.update`, `.delete`, or
   `.table("outboxMutations")`).

6. **Money** stays `bigint` minor units. If a migration introduces an amount, the
   upgrade must convert with `features/domain/money.ts`, never with floats.

## Exit criteria

- `node .agents/skills/verify-schema.ts` exits 0.
- Migration test passes; `pnpm typecheck` passes.
- The Supabase side of the checklist is complete, or the spec states explicitly
  that the table is local-only.

## Rollback

- **Uncommitted mistake:** restore the file (`git restore lib/db/dexie.ts`). Do
  not "fix" it by adding a version that compensates.
- **Shipped mistake** (a bad version already merged): ship the next version with
  an `.upgrade()` that repairs the data. Never rewrite history, never reuse a
  version number, never tell users to clear IndexedDB.
- If the guardian itself is wrong, fix the guardian in the same change and note
  it in `memory/MEMORY.md` — a guard that cries wolf gets ignored.
