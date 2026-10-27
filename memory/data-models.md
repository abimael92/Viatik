# Viatik Data Models & Offline Persistence

> **Authoritative source:** [`lib/db/dexie.ts`](../lib/db/dexie.ts) (schema v48),
> [`features/domain/entities.ts`](../features/domain/entities.ts) (domain types),
> [`lib/sync/`](../lib/sync/) (outbox + sync engine), [`lib/supabase/mappers.ts`](../lib/supabase/mappers.ts)
> (row ⇄ entity mapping). If this document and the code disagree, **the code wins** —
> correct this file.
>
> Last audited: 2026-10-22 against Dexie schema version **48**.

## 1. Storage topology

```
UI (client components)
  └─ features/<feature>/lib/use-*.ts          (live hooks)
      └─ features/<feature>/data/dexie-*.ts   (repositories)
          └─ Dexie / IndexedDB                ← LOCAL SOURCE OF TRUTH
              └─ outboxMutations (same Dexie transaction)
                  └─ lib/sync/sync-engine.ts  → Supabase Postgres / Storage
                                              (remote sync + authorization only)
```

- **Dexie is the domain source of truth.** Every read/write of trips, activities,
  expenses, etc. goes through a repository first.
- **Supabase is never read directly by UI/features.** The only exceptions are
  infrastructure calls: auth, storage signed URLs, public-profile RPC
  (`get_profile_public_data`), and server components reading `profiles` for
  display/auth gating.
- **Per-user databases.** `getDatabase(userId)` namespaces the IndexedDB database
  `viatik_<userId>`; anonymous sessions use `viatik_anonymous`
  (`lib/db/dexie.ts` → `getDatabaseName`). `DatabaseProvider` sets the "current"
  instance so repositories never take a db argument.

### Money invariant

All monetary amounts are `MinorUnits = bigint` (`features/domain/money.ts`),
bounded by `MAX_MINOR_UNITS = 9_999_999_999n`. Currency exponents are explicit
(`JPY` = 0, `USD/EUR/GBP/CAD/MXN` = 2). Legacy `number` columns were migrated in
schema v12 (`migrateMinorUnits`). Never store money as a float.

### Metadata convention

Synced domain entities carry the tiered metadata columns from the constitution:

| Field | Meaning |
|---|---|
| `createdBy` / `createdAt` | Immutable creation actor + timestamp |
| `updatedBy` / `updatedAt` | Last writer |
| `deletedBy` / `deletedAt` / `restoredAt` / `restoredBy` | Soft-delete + restore |
| `version` | Optimistic concurrency / CAS guard (remote RPCs use `base_updated_at` too) |
| `statusChangedAt` / `statusChangedBy` | Lifecycle transitions (trips, invitations, shares) |

Legacy rows were backfilled with actor UUID `0fb843db-9c96-4021-92f8-f143ddd3efe8`
and the current timestamp (see `.ai/constitution.md` → Metadata Invariant).

## 2. Table catalog (current schema)

`PK` = primary key. `&` = unique index. `[a+b]` = compound index.
"Sync" column: **outbox** = written through the outbox to Supabase; **pull** = also
pulled/realtime; **local** = device-only, never leaves the browser.

| Dexie table | PK | Indexes (latest definition) | Sync | Owning feature |
|---|---|---|---|---|
| `trips` | `id` | `ownerId`, `updatedAt`, `deletedAt` | outbox + pull | trips |
| `tripMembers` | `id` | `tripId`, `userId`, `[tripId+userId]` | outbox + pull | collaboration |
| `tripInvitations` | `id` | `tripId`, `email`, `status`, `updatedAt` | outbox + pull | collaboration |
| `activities` | `id` | `tripId`, `[tripId+dayDate]`, `[tripId+dayDate+position]`, `updatedAt`, `deletedAt` | outbox + pull | activities |
| `activityPersonalBudgets` | `id` | `activityId`, `tripId`, `userId`, `[activityId+userId]`, `updatedAt` | outbox + pull | activities/finance |
| `expenses` | `id` | `tripId`, `activityId`, `date`, `category`, `[tripId+date]`, `updatedAt`, `deletedAt` | outbox + pull | expenses |
| `expenseShares` | `id` | `expenseId`, `userId`, `splitType`, `settlementStatus`, `[expenseId+userId]` | outbox + pull | expenses |
| `expenseSettlements` | `id` | `tripId`, `fromUserId`, `toUserId`, `date`, `updatedAt`, `deletedAt` | outbox + pull | expenses |
| `tripMedia` | `id` | `tripId`, `activityId`, `uploadStatus`, `takenAt`, `kind`, `updatedAt`, `deletedAt` | outbox + pull (+ Storage) | media |
| `stagedTripMedia` | `id` | `tripId`, `createdBy`, `createdAt`, `[tripId+createdAt]` | local | media |
| `mediaTranscripts` | `mediaId` | `tripId`, `status`, `updatedAt` | pull only (server-written) | media |
| `contacts` | `id` | `ownerId`, `linkedProfileId`, `connectionStatus`, `updatedAt`, `deletedAt` | outbox + pull | contacts |
| `tripTravelers` | `id` | `tripId`, `contactId`, `[tripId+contactId]`, `updatedAt`, `deletedAt` | outbox + pull | trips/contacts |
| `vaultKeysets` | `id` | `ownerId`, `updatedAt` | outbox + pull | vault |
| `vaultEntries` | `id` | `tripId`, `ownerId`, `[tripId+ownerId]`, `updatedAt`, `deletedAt` | outbox + pull | vault |
| `tripWeatherForecasts` | `id` | `[tripId+locationRevision]` | outbox + pull | weather |
| `userWallets` | `id` | `tripId`, `userId`, `[tripId+userId]`, `updatedAt` | outbox + pull | finance |
| `shareLinks` | `id` | `tripId`, `slug`, `active`, `[tripId+active]`, `updatedAt`, `deletedAt` | outbox + pull | sharing |
| `notifications` | `id` | `userId`, `type`, `isRead`, `[userId+isRead]`, `updatedAt` | outbox + pull | notifications |
| `decisions` | `id` | `tripId`, `type`, `status`, `[tripId+status]`, `updatedAt`, `deletedAt` | outbox + pull | polls |
| `decisionOptions` | `id` | `decisionId`, `position`, `[decisionId+position]`, `updatedAt`, `deletedAt` | outbox + pull | polls |
| `decisionVotes` | `id` | `decisionId`, `optionId`, `userId`, `[decisionId+userId]`, `updatedAt`, `deletedAt` | outbox + pull | polls |
| `tripNotes` | `id` | `tripId`, `userId`, `createdAt`, `updatedAt`, `deletedAt` | outbox + pull | trips |
| `tripTasks` | `id` | `tripId`, `creatorId`, `assigneeId`, `status`, `createdAt`, `updatedAt`, `deletedAt` | outbox + pull | trips |
| `outboxMutations` | `id` | `tripId`, `userId`, `entityType`, `createdAt` | engine queue | sync |
| `syncMetadata` | `key` | — | local | sync |
| `syncLeases` | `key` | `expiresAt` | local (cross-tab) | sync |
| `syncConflicts` | `id` | `tripId`, `entityType`, `resolvedAt` | local | sync |
| `tripBudgets` | `id` | `tripId`, `updatedAt`, `deletedAt` | **local** | finance |
| `tripIdeas` | `id` | `updatedAt`, `convertedToTripId` | **local** (v48 backfills `travelerContactIds`, `flightRoute`) | trip-planner |
| `tripSavingsPlans` | `id` | `&tripIdeaId` (unique), `updatedAt` | **local** | trip-planner |
| `profiles` | `id` | `updatedAt` | **local** (mirror) | profile |
| `tripPins` | `id` | `tripId`, `category`, `updatedAt`, `deletedAt` | **local** | maps |
| `feedItems` | `id` | `tripId`, `actorId`, `verb`, `createdAt`, `[tripId+createdAt]` | **local** (derived) | feed |
| `packingItems` | `id` | `tripId`, `category`, `isPacked`, `[tripId+category]`, `position`, `updatedAt`, `deletedAt` | **local** | packing |
| `travelDocuments` | `id` | `userId`, `type`, `expiryDate`, `[userId+type]`, `updatedAt`, `deletedAt` | **local** | health |
| `polls` | `id` | `tripId`, `status`, `[tripId+status]`, `updatedAt`, `deletedAt` | **local** (legacy) | polls |
| `pollVotes` | `id` | `pollId`, `userId`, `optionId`, `[pollId+userId]`, `updatedAt` | **local** (legacy) | polls |
| `currencyRates` | `id` | `baseCurrency`, `quoteCurrency`, `[baseCurrency+quoteCurrency]`, `updatedAt` | **local** | finance |
| `transitSegments` | `id` | `tripId`, `dayDate`, `mode`, `scheduledDeparture`, `[tripId+dayDate]`, `updatedAt`, `deletedAt` | **local** | transit |
| `journalDayEntries` | `id` | `tripId`, `dayDate`, `[tripId+dayDate]`, `updatedAt` | **local** | journal |
| `dailyStepCounts` | `id` | `tripId`, `userId`, `dayDate`, `[tripId+userId]`, `[userId+dayDate]`, `updatedAt` | **local** | steps |

> `dailyBudgetOverrides` was **removed** in v31 (folded into `tripBudgets`).
> `polls`/`pollVotes` are legacy local-only stores; new voting code uses
> `decisions`/`decisionOptions`/`decisionVotes`, which sync.

## 3. Remote ⇄ local mapping

`lib/sync/cloud-sync.ts` (`SYNC_TABLE_DEFINITIONS`) is the authoritative pull map:

| Supabase table | Entity type | Dexie store |
|---|---|---|
| `trips` | `trip` | `trips` |
| `trip_members` | `tripMember` | `tripMembers` |
| `trip_invitations` | `invitation` | `tripInvitations` |
| `activities` | `activity` | `activities` |
| `activity_personal_budgets` | `activityPersonalBudget` | `activityPersonalBudgets` |
| `expenses` | `expense` | `expenses` |
| `expense_shares` | `expenseShare` | `expenseShares` |
| `trip_media` | `media` | `tripMedia` |
| `expense_settlements` | `settlement` | `expenseSettlements` |
| `contacts` | `contact` | `contacts` |
| `connections` | `connectionRequest` | `contacts` (linked) |
| `trip_travelers` | `tripTraveler` | `tripTravelers` |
| `vault_keysets` | `vaultKeyset` | `vaultKeysets` |
| `vault_entries` | `vaultEntry` | `vaultEntries` |
| `trip_weather_forecasts` | `tripWeatherForecast` | `tripWeatherForecasts` |
| `user_wallets` | `userWallet` | `userWallets` |
| `trip_share_links` | `tripShareLink` | `shareLinks` |
| `notifications` | `notification` | `notifications` |
| `decisions` | `decision` | `decisions` |
| `decision_options` | `decisionOption` | `decisionOptions` |
| `decision_votes` | `decisionVote` | `decisionVotes` |
| `trip_notes` | `tripNote` | `tripNotes` |
| `trip_tasks` | `tripTask` | `tripTasks` |
| `media_transcripts` | — | `mediaTranscripts` (read-only mirror) |

The outbox `OutboxEntityType` union in `lib/sync/types.ts` is the authoritative
list of pushable entity types. If you add a table, you must update **both** lists,
plus `lib/supabase/mappers.ts`.

## 4. Relationships

```
Trip (1) ──< TripMember >── (1) auth user            role: owner | editor | viewer
  │
  ├──< TripInvitation                                  pending|accepted|rejected|revoked
  ├──< Activity (per dayDate) ──< ActivityPersonalBudget (per user)
  │        └── attachments[], checklist[], participants[]
  ├──< Expense ──< ExpenseShare (per user/traveler) ──> settlementStatus
  │        └── lineItems[] (itemized receipts with per-item allocations)
  ├──< ExpenseSettlement                               repayment ledger (immutable expenses)
  ├──< TripTraveler >── Contact                        offline (non-app) travelers
  ├──< TripMedia (kind: photo|audio) ──< MediaTranscript
  ├──< TripNote (optional audioMediaId)
  ├──< TripTask (creatorId / assigneeId)
  ├──< Decision ──< DecisionOption ──< DecisionVote
  ├──< TripBudget (total + dailyTarget + categoryAllocations)   local-only
  ├──< TripShareLink (guest read-only access)                  synced
  ├──< TransitSegment / JournalDayEntry / PackingItem / TripPin / Poll / TripWeatherForecast
  └──< FeedItem (derived from the synced rows above)           local-only
```

Key identity nuances:

- `Expense.paidBy` / `ExpenseShare.userId` accept **either** a Viatik profile id
  **or** a synthetic `traveler:<uuid>` key for offline travelers. Helpers must
  handle both.
- `TripMember.viatikId` being `null` means the member is not eligible for group
  voting.
- `Contact.connectionStatus` (`unverified_offline`, …) models the bidirectional
  `connections` graph; only linked contacts get a `tripMembers` row
  (`features/collaboration/lib/ensure-member.ts`).
- Activities are positioned by the fractional `position` within
  `(tripId, dayDate)`; [`lib/ordering.ts`](../lib/ordering.ts) owns the key math.

## 5. Offline-first write path (mandatory)

```ts
// features/<feature>/data/dexie-*-repository.ts
return TransactionContext.runInTransaction([db.expenses, db.expenseShares], async (ctx) => {
  await ctx.table<Expense>("expenses").put(expense);
  await append("expense", "insert", expense, { tx: ctx, baseUpdatedAt: null });
  return expense;
});
```

Rules:

1. **Never** call `db.outboxMutations.add(...)` directly. Use
   `append()` from `lib/sync/outbox-transactional.ts`.
2. **Always** write the domain row and its outbox entry inside one
   `TransactionContext.runInTransaction` — they commit or roll back together.
3. `append` stores the **full current row** as the payload (idempotent PUT
   semantics), collapses repeated edits per entity, and drops an unsent
   `insert` when the entity is deleted before syncing.
4. `append` dispatches the `viatik:sync-request` window event so the sync engine
   wakes immediately.
5. Local-only tables (`tripBudgets`, `packingItems`, `currencyRates`, …) must
   **not** append outbox entries.
6. Soft-delete (`deletedAt`) rather than hard-delete synced rows so the delete can
   replicate.

## 6. Sync engine

`lib/sync/sync-engine.ts` (push + orchestration), `lib/sync/cloud-sync.ts`
(pull + Storage + Realtime), `lib/sync/sync-coordinator.ts` (multi-tab leases).

- **Push:** drains `outboxMutations` (ordered by `createdAt`) with a stable
  dependency sort — `activity` → `expense` → `expenseShare` → everything else
  (`mutationDependencyRank`). Replay goes through compare-and-swap RPCs: generic
  `sync_cas_upsert` plus per-entity variants (`sync_activity_cas_upsert`,
  `sync_decision_cas_upsert`, `sync_vault_entry_cas_upsert`,
  `sync_trip_note_cas_upsert`, …) using `baseUpdatedAt`.
- **Pull:** pages each table by an `(updated_at, id)` cursor into the local Dexie
  store. Missing remote tables (migration not yet applied) are skipped with a
  warning rather than failing the whole sync. Pull also reconciles trip access:
  local memberships no longer present remotely are deleted (unless they have a
  pending outbox mutation), along with that user's staged photos.
- **Realtime:** Supabase `postgres_changes` subscriptions per table feed the same
  apply path; `media_transcripts` has its own channel.
- **Multi-tab:** a lease row in `syncLeases` (`ownerToken`, `heartbeatAt`,
  `expiresAt`) guarantees only one tab pushes at a time. `SyncCoordinationInterruptedError`
  means another tab took over — treat as a normal stop, not a failure.
- **Retries:** `lib/sync/outbox.ts` — `MAX_RETRY_ATTEMPTS = 5`, backoff
  `[1s, 5s, 15s, 30s, 60s]`. Mutations can be `blocked` (needs user action) and are
  excluded from pending counts. RLS errors reset attempts instead of burning them.
- **Conflicts:** `syncConflicts` rows record `localUpdatedAt` / `remoteUpdatedAt` /
  `resolution`. Conflicts auto-resolve **remote wins**; only `resolvedAt === null`
  rows are surfaced in the UI.
- **Media:** blobs live in Dexie (`tripMedia.blob`), upload to the `trip-media`
  Storage bucket, then get signed URLs (1h). `stagedTripMedia` holds member-only
  pre-publish photos. `mediaTranscripts` is a read-only mirror of server-generated
  transcripts.

## 7. Schema evolution rules

- **Additive only.** Add a new `this.version(N).stores({...})` block; never edit a
  previously shipped version block.
- Changing a table's index string requires re-declaring **all** indexes for that
  table in the new version (Dexie replaces the index set).
- Backfill inside `.upgrade(async (tx) => …)`; tolerate missing/invalid legacy
  values rather than throwing (see `migrateMinorUnits`).
- Removing a store uses `null` (e.g. `dailyBudgetOverrides: null` in v31).
- Mirror every schema change with a Supabase migration in `supabase/migrations/`
  (timestamped `000000000000NN_*.sql`), an RLS review, and a mapper update.
- Migration tests exist under `lib/db/*-migration.test.ts` and
  `supabase/*-schema.test.ts` — extend them.

## 8. Known data-layer gotchas

- Dexie is **client-only**. Any module touching it must be a client component or
  run inside `useEffect`; `DatabaseProvider` renders `null` until the DB is open.
- `getCurrentDatabase()` throws if no provider is mounted — repositories guard with
  `"No database is open. Wrap calls in DatabaseProvider."`.
- BigInt does not survive `JSON.stringify`; outbox payloads are structured-cloned
  by IndexedDB, and remote mappers convert to integers explicitly.
- Compound indexes must match the exact query shape; `.where("[tripId+dayDate]")`
  will silently return nothing if the index string drifted.
- `liveQuery` subscriptions must be unsubscribed on unmount; repositories return a
  disposer from every `watch*` method.
- `tripMedia` requires `blob` for pending uploads but not after upload; treat
  `uploadStatus` (`pending|uploading|uploaded|failed`) as the source of truth.
