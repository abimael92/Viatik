# Feature Specification: Multi-Tab Sync Ownership

**Project:** Viatik  
**Owner:** Viatik Engineering  
**Status:** In Progress  
**Created:** 2026-09-03  
**Updated:** 2026-09-03  
**Related work:** Release A0/A1

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md) before changing this specification. The framework entry point is [`../llms.txt`](../llms.txt).

## What & Why

### What

Serialize Viatik's browser synchronization work across tabs with a focused `SyncCoordinator` contract. Use the Web Locks API when available and a durable, expiring Dexie lease otherwise. Notify follower tabs of synchronization state without allowing them to replay the same outbox concurrently.

### Why

The existing in-memory promise prevents overlapping syncs only inside one tab. Multiple tabs for the same account can read and replay the same IndexedDB outbox entries concurrently, causing duplicate remote requests, incorrect retry accounting, and competing reconciliation work.

### Users and scenarios

- **Primary user:** An authenticated traveler with Viatik open in multiple browser tabs.
- **Scenario 1:** Given two tabs for the same account request sync concurrently, when the coordinator elects an owner, then only that tab drains the outbox and the follower yields without entering an error state.
- **Scenario 2:** Given a fallback lease owner crashes, when the lease expires and another tab requests sync, then the second tab safely acquires ownership and resumes synchronization.
- **Offline or degraded-network behavior:** Local writes continue through Dexie. Coordination never discards outbox work, and an unavailable lock is a graceful yield rather than a synchronization failure.

## In Scope

- A storage-agnostic `SyncCoordinator` interface for exclusive synchronization scopes.
- A Web Locks implementation keyed by user and Dexie database.
- A dedicated Dexie `syncLeases` store with owner tokens, heartbeats, TTL expiry, ownership-checked renewal, and ownership-checked release.
- Automatic Web Locks-to-Dexie fallback selection.
- BroadcastChannel notifications for sync requests, ownership, completion, and pending-state refresh.
- Sync-engine integration covering outbox replay, media processing, remote pull, and final pending refresh.
- Unit and integration tests for concurrent requests, crash recovery, stale owners, and account/database isolation.

## Out of Scope

- Monetary representation changes from Release A2.
- Contacts, account linking, or other Phase B changes.
- Service workers or Background Sync API orchestration.
- Distributed coordination across different devices.
- Changes to Supabase conflict semantics or CAS functions.

## Constraints and Design

- **Architecture boundaries:** UI continues to invoke sync use cases only. `SyncEngine` depends on `SyncCoordinator`; Web Locks, BroadcastChannel, and Dexie lease mechanics remain infrastructure details in `lib/sync/`.
- **Data ownership:** Dexie remains the local domain source of truth. Supabase remains the remote synchronization and authorization target. Coordination metadata never becomes domain data.
- **Security requirements:** Lock and channel names are deterministic per local database and authenticated user but contain no credentials or profile data. Lease owner IDs are random per coordinator instance. Logs must not contain mutation payloads or sensitive contact data.
- **Compatibility:** Modern browsers use `navigator.locks`. Browsers without it use the Dexie lease. BroadcastChannel is optional; correctness never depends on notification delivery.
- **SOLID/design decisions:** The coordinator exposes one exclusive-execution responsibility. The engine depends on its interface, while lock and lease implementations are independently testable. Time, timers, token generation, database access, and browser primitives are injectable where determinism is required.
- **Migration/rollback plan:** Dexie schema version 11 adds `syncLeases`. Rollback consists of reverting coordinator integration; the extra IndexedDB store is inert and contains only expiring coordination records.
- **Observability:** Log acquisition, graceful yield, lease loss, and completion without payload contents. Follower yield is not counted as a failed synchronization attempt.

The approved architecture is recorded in this specification; a separate ADR is not required.

## Contracts

```ts
export type SyncScope = {
  databaseName: string;
  userId: string;
};

export type SyncCoordinationResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

export interface SyncCoordinator {
  runExclusive<T>(scope: SyncScope, operation: (context: { signal: AbortSignal }) => Promise<T>): Promise<SyncCoordinationResult<T>>;
  requestSync(scope: SyncScope): void;
  subscribe(scope: SyncScope, listener: (event: SyncCoordinationEvent) => void): () => void;
  close(): void;
}
```

The exclusive region starts before reading pending mutations and ends after media processing, remote pull/reconciliation, and pending-count refresh. A follower must never execute the operation callback.

The fallback lease uses a random tab token and the following invariants:

1. Acquisition is one atomic Dexie read-write transaction.
2. A lease can be acquired only when absent, expired, or already owned by the caller.
3. Heartbeats extend only a lease still owned by the caller.
4. Release deletes only a lease still owned by the caller.
5. Expiry is based on an injected clock and is recoverable after abrupt tab closure.

## Acceptance Criteria

### Functional

- [ ] Concurrent requests for one user/database execute one outbox drain at a time.
- [ ] Followers yield gracefully and receive completion/pending notifications when BroadcastChannel is available.
- [ ] Web Locks is preferred when available and Dexie leases are used otherwise.
- [ ] Different user/database scopes do not block each other.

### Authorization and security

- [ ] Coordination is scoped to the authenticated user and active Dexie database.
- [ ] Random owner tokens prevent stale tabs from renewing or releasing another tab's lease.
- [ ] No mutation payload or private domain data is sent through BroadcastChannel or coordination logs.
- [ ] No UI component queries Supabase domain tables as part of this work.

### Reliability and offline behavior

- [ ] A crashed fallback owner can be replaced after TTL expiration.
- [ ] Heartbeats preserve ownership during a long synchronization.
- [ ] Lease renewal loss prevents the stale owner from claiming successful ownership.
- [ ] Lock unavailability does not increment mutation retry attempts or set sync status to error.
- [ ] Refresh/restart preserves all queued outbox work.

### Verification

- [ ] Coordinator unit tests cover Web Locks acquisition/yield and fallback selection.
- [ ] Dexie lease integration tests cover concurrency, expiry, stale release, heartbeat, and scope isolation.
- [ ] Sync-engine tests prove pending mutations are read only by the elected owner.
- [ ] Changed critical code meets the repository's coverage target or an exception is documented.
- [ ] Tests, typecheck, lint, and production build pass.
- [ ] QA and security review findings are recorded in Completion Notes.

## Implementation Plan

1. Add failing tests for coordinator exclusivity and durable lease invariants.
2. Add the coordinator contracts and optional notification transport.
3. Add Web Locks coordination and automatic fallback selection.
4. Add the Dexie schema/store and durable lease implementation.
5. Integrate the coordinator around the complete sync critical section.
6. Run focused tests, full tests, typecheck, lint, build, QA review, and security review.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Concurrent outbox drains per user/database | Up to one per open tab | 1 | Multi-instance integration test | Viatik Engineering |
| Recovery after fallback owner crash | Manual/tab-dependent | Automatic after TTL | Injected-clock lease test | Viatik Engineering |
| Follower requests counted as failures | Possible | 0 | Sync-engine diagnostics test | Viatik Engineering |

## Risks and Open Questions

- **Risk:** A long task can outlive its lease. **Mitigation:** heartbeat below half the TTL and ownership verification after the operation.
- **Risk:** Timer throttling in background tabs can delay heartbeats. **Mitigation:** conservative TTL and Web Locks as the primary mechanism.
- **Risk:** BroadcastChannel may be unavailable or drop messages. **Mitigation:** notifications are advisory; periodic sync and durable exclusion preserve correctness.
- **Question:** None blocking Release A1.

## Completion Notes

- **Verification commands:** `pnpm test -- lib/sync`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`
- **Verification results:** `pnpm test` passed (22 files, 104 tests); `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check` passed on 2026-09-03.
- **QA review:** Static review identified graceful lease-loss handling and lifecycle-test gaps. Graceful interruption handling, closed-channel safety, scope binding, and deterministic ownership-loss coverage were added. Browser-level timer-throttling coverage remains follow-up work.
- **Security review:** Web Locks is the primary strict browser exclusion mechanism. The fallback uses atomic leases, heartbeats, ownership-checked release, abort checkpoints, and existing idempotent CAS semantics. An already-issued storage/network operation may finish after fallback lease loss because not every Supabase Storage API accepts an abort signal; this residual risk requires idempotency and should be covered by future browser-level testing or remote fencing if stronger guarantees are required.
- **Bug-ledger updates:** Not applicable; this is planned architectural hardening.
- **Follow-up work:** Browser-level multi-tab suspension/throttling tests and optional remote fencing. Release A2 and Phase B remain explicitly deferred.
