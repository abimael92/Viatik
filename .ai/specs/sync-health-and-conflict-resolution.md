# Feature Specification: Sync Health & Conflict Resolution

**Project:** Viatik
**Owner:** TBD
**Status:** Draft
**Created:** 2026-09-04
**Updated:** 2026-09-04
**Related work:** Audit recommendation items #1 (Conflict review UI), #2 (Stuck-mutation quarantine), #9 (Diagnostics panel)

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md) before completing this template. Record resulting bug invariants in [`../specs/bug-ledger.md`](../specs/bug-ledger.md), and use [`bug-report.md`](../templates/bug-report.md) for defects discovered during delivery.

---

## What & Why

### What

A **Sync Health & Conflict Resolution** epic that makes invisible sync failure states visible and actionable. It delivers three coordinated capabilities:

1. **Conflict review UI** — a panel where a user can inspect a compare-and-swap (CAS) conflict and resolve it by keeping their local change or accepting the cloud version.
2. **Stuck-mutation quarantine (dead-letter queue)** — permanently-failing outbox mutations are moved to a quarantined state instead of being skipped-but-still-counted-as-pending forever.
3. **Diagnostics panel** — a read-only view of the sync engine's runtime health (attempts, successes, failures, average duration, last error, counts).

Today, all three failure states are effectively invisible: CAS conflicts are recorded to `syncConflicts` but never rendered, permanently-failed mutations keep `countPending > 0` so the app shows the "Some cloud changes could not sync. Retry now" banner forever, and sync diagnostics are collected in memory but never surfaced.

### Why

Offline-first correctness depends on users being able to trust that their local changes either reached the cloud or were handled deterministically. When a change can neither sync nor be surfaced, users lose work silently and the app shows a permanent, non-actionable error banner. This epic converts those silent failures into visible, resolvable states, and is the highest-leverage reliability investment in the current architecture.

### Users and scenarios

- **Primary user:** A Viatik traveler whose device has intermittent connectivity or who collaborates with others on a shared trip.
- **Scenario 1 — CAS conflict:** Given a collaborator edited the same activity while the user was offline, when the user's local edit reaches the cloud and CAS detects a conflict, then the user sees a conflict entry and can choose "keep my change" (re-apply) or "use cloud version" (accept remote).
- **Scenario 2 — Stuck mutation:** Given an outbox mutation repeatedly fails for a non-transient reason (e.g. a schema mismatch), when it exceeds max retries, then it is quarantined to a dead-letter queue, the permanent error banner clears, and the user sees the quarantined item with a reason and can retry or discard it.
- **Scenario 3 — Diagnostics:** Given a user or support agent wants to understand sync behavior, when they open the Sync panel, then they see last-sync time, success/failure counts, average duration, and the last error.
- **Offline or degraded-network behavior:** Required. All resolution actions are local-first (Dexie) and re-enter the normal outbox pipeline; the UI reflects the same offline/pending states as the rest of the app.

## In Scope

- Add a quarantined state to outbox mutations (dead-letter queue) with retry and discard actions.
- Fix pending-count logic so quarantined mutations no longer produce a permanent "error" status / banner.
- Surface CAS conflicts (`syncConflicts`) in a review UI with keep-local / keep-remote resolution.
- Surface sync diagnostics.
- Dexie schema v20 migration with backfill.
- Unit/integration tests for quarantine transitions, pending counting, and conflict resolution; component tests for the panel.

## Out of Scope

- Automatic/merged conflict resolution heuristics (this epic is manual, explicit resolution).
- Realtime presence/collaboration cursors (separate roadmap item).
- Persisting a rolling, historical diagnostics log (diagnostics remain in-memory for now).
- Notifications/push for sync events.
- Native mobile apps.

## Constraints and Design

- **Architecture boundaries:**
  - `features/domain/repositories/*` — new repository interfaces for sync health queries and actions (no UI → Dexie/Supabase directly).
  - `lib/sync/outbox.ts` — quarantine/unquarantine helpers and pending-count fixes.
  - `lib/sync/sync-engine.ts` — the retrying → quarantined transition and diagnostics exposure.
  - `lib/sync/types.ts` — `OutboxMutation` and `SyncConflict` type changes.
  - `lib/db/dexie.ts` — schema v20.
  - `features/sync/components/*` — the health panel, dialog, and row components (new feature folder).
  - `app/(app)/settings/*` — hosts the Sync section.
  - UI still never queries Supabase directly; everything reads/writes Dexie through repository/engine boundaries.
- **Data ownership:** Dexie remains the local source of truth. Quarantine and conflict state are local-first; no new remote schema is required.
- **Security requirements:** Resolution actions are authenticated (the local user's own device state). No secrets in quarantine reasons (redacted logging only). `localPayload` on conflicts may contain user data — it is rendered via existing safe-rendering boundaries, never serialized to logs.
- **Compatibility:** Browsers already supported by the app (modern mobile/desktop). IndexedDB via Dexie v20.
- **SOLID/design decisions:** Add a `state` column to `outboxMutations` (a dead-letter flag on the existing row) rather than a separate table — preserves the payload, enables `unquarantine` to replay trivially, and is one index change. Keep diagnostics in-memory (already collected) and expose a snapshot; add `liveQuery`-driven counts for pending/quarantined/conflicts. Single responsibility: `outbox.ts` owns state transitions; `sync-engine.ts` owns when to transition; UI owns presentation.
- **Migration/rollback plan:** Dexie v20 `upgrade()` backfills new fields. Dexie only migrates forward; rolling back a client is a restore/clear of IndexedDB. No remote migration. Quarantine is recoverable (can be un-quarantined), so it is non-destructive.
- **Observability:** Log each quarantine with `entityType`, `entityId`, `attempts`, and the (redacted) reason; log resolution actions. Diagnostics snapshot exposed via `getSyncDiagnostics()` (already present). No payload contents in logs.

The Architect Agent must review this section before implementation. Link any decision record here: `None`.

---

## 1. Dexie Schema Updates (dead-letter / quarantine queue)

### 1.1 `lib/sync/types.ts`

```ts
export type OutboxMutationState = "pending" | "quarantined";

export interface OutboxMutation {
  id: string;
  entityType: OutboxEntityType;
  entityId: string;
  tripId: string;
  userId: string | null;
  operation: OutboxOperation;
  payload: Record<string, unknown> | null;
  baseUpdatedAt?: string | null;
  revision?: number;
  /** Client-side timestamp of the mutation, used for Last-Write-Wins. */
  mutatedAt: string;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  /** Added v20: dead-letter state; quarantined rows are excluded from pending count. */
  state: OutboxMutationState;
  /** Added v20: when the mutation was quarantined (null while pending). */
  quarantinedAt: string | null;
  /** Added v20: the reason it was quarantined (last error, redacted). */
  quarantineReason: string | null;
}

export interface SyncConflict {
  id: string;
  entityType: OutboxEntityType;
  entityId: string;
  tripId: string;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  /** When the conflict was recorded (auto-resolution). */
  resolvedAt: string;
  resolution: "local" | "remote" | "merged";
  /** Added v20: discarded local payload, so the user can re-apply ("keep mine"). */
  localPayload?: Record<string, unknown> | null;
  /** Added v20: whether the user has acknowledged/handled this conflict. */
  seen: boolean;
}
```

### 1.2 `lib/db/dexie.ts` — schema `version(20)`

```ts
this.version(20).stores({
  outboxMutations: "id, tripId, userId, entityType, state, createdAt",
  syncConflicts: "id, tripId, entityType, resolvedAt, seen",
}).upgrade(async (transaction) => {
  await transaction.table("outboxMutations").toCollection().modify((m: Record<string, unknown>) => {
    if (m.state === undefined) m.state = "pending";
    if (m.quarantinedAt === undefined) m.quarantinedAt = null;
    if (m.quarantineReason === undefined) m.quarantineReason = null;
  });
  await transaction.table("syncConflicts").toCollection().modify((c: Record<string, unknown>) => {
    if (c.localPayload === undefined) c.localPayload = null;
    if (c.seen === undefined) c.seen = false;
  });
});
```

Notes:
- Existing pending rows backfill to `state = "pending"`, so the active outbox is unchanged.
- The `state` index enables fast pending vs. quarantined enumeration.
- No new table; the dead-letter queue is the quarantined slice of `outboxMutations`.

### 1.3 `lib/sync/outbox.ts` — new/updated helpers

```ts
// Added v20
export function listQuarantinedMutations(): Promise<OutboxMutation[]>;
export function countQuarantinedMutations(): Promise<number>;
export function quarantineMutation(id: string, reason: string): Promise<void>;
export function unquarantineMutation(id: string): Promise<void>;
export function discardMutation(id: string): Promise<void>; // hard delete (explicit user action)

// Updated v20 — exclude quarantined rows from the "pending" definition
export function listPendingMutations(userId?: string | null): Promise<OutboxMutation[]>;
//   -> filter additionally `&& mutation.state === "pending"`
export function countPendingMutations(userId?: string | null): Promise<number>;
//   -> `.where("state").equals("pending").and((m) => !userId || m.userId === userId).count()`
```

---

## 2. UI/UX — Sync Health & Conflict Resolution Panel

Design system: Tailwind v4 OKLCH tokens (`bg-card`, `bg-muted`, `bg-background/80`, `border-border/40`, `text-primary`, `text-success`, `text-destructive`, `text-accent-foreground`, `bg-accent/15`). Glass surfaces use `backdrop-blur-2xl`. Transitions use `transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]`. All touch targets `min-h-11`/`min-w-11`.

### 2.1 Entry points

- **Settings → "Sync & data"** — the full panel (new section in `app/(app)/settings/`).
- **Sync pill (app shell)** — the warning pill ("Attention") now opens the panel/dialog when there are quarantined items or unseen conflicts, instead of only triggering `syncNow()`. A distinct pill variant (`bg-warning`-like accent) shows when `quarantined > 0 || unseenConflicts > 0`.

### 2.2 Panel layout (`features/sync/components/sync-health-panel.tsx`)

```
┌────────────────────────────────────────────────────────────┐
│ Sync & data                                         [Refresh]│
│  ● Synced · up to date      ● 2 waiting     ● 1 quarantined │
│  ─────────────────────────────────────────────────────────  │
│  Summary cards (4): Pending | Quarantined | Conflicts | Last sync │
│  ─────────────────────────────────────────────────────────  │
│  ▸ Conflicts (1)                  [Collapsible sections]     │
│  ▸ Quarantined changes (1)                                   │
│  ▸ Diagnostics                                                │
└────────────────────────────────────────────────────────────┘
```

### 2.3 Conflict review (`conflict-row.tsx`)

- Progressive disclosure via `Collapsible`: header shows entity type + title/name, a `text-warning` badge "Conflict", and a collapsed "local vs remote" summary.
- Expanded body shows two sides:
  - **Your change (local)** — from `conflict.localPayload` (via `mappers.rowTo*` / existing entity mappers to human-readable fields).
  - **Cloud version (remote)** — fetched at conflict-record time and stored alongside (or resolved from current Dexie state after `pullRemoteChanges`).
- Actions (min-h-11):
  - **Keep my change** (`bg-primary text-primary-foreground`) → `resolveConflictKeepLocal(id)`.
  - **Use cloud version** (`variant="outline"`) → `resolveConflictKeepRemote(id)`.
- Confirmation not required (non-destructive; "keep remote" already matches current behavior; "keep mine" re-enqueues).

### 2.4 Quarantined changes (`quarantine-row.tsx`)

- Each row: entity type + entity id, a `bg-accent/15 text-accent-foreground` badge "Quarantined", the redacted reason (`quarantineReason`), and the date `quarantinedAt`.
- Actions:
  - **Retry** (`variant="outline"`) → `unquarantineAndRetry(id)`.
  - **Discard** (`variant="ghost" text-destructive`) → confirms via `Dialog` before `discardMutation(id)`.
- Empty state: "No quarantined changes. Everything that failed is recoverable here."

### 2.5 Diagnostics (`diagnostics-card.tsx`)

- Read-only list, monospaced numerals (`font-mono tabular-nums`): last sync time, total attempts, successful syncs, failed syncs, conflict events, average duration, last error (redacted, truncatable).
- Source: `getSyncDiagnostics()` snapshot + `liveQuery` for live counts.

### 2.6 Accessibility

- `role="status"` / `aria-live="polite"` on count changes; `role="alert"` for quarantined/discard errors.
- Collapsible sections use `aria-expanded` + `aria-controls` (existing `Collapsible` primitive).
- All actions keyboard-focusable with `focus-visible:ring-2 focus-visible:ring-ring`; confirm dialogs focusable.
- Color is not the only signal (icons + text labels alongside badges).
- `prefers-reduced-motion` respected via existing motion conventions (transform/opacity only).

---

## 3. Sync Engine Modification — "retrying" → "quarantined" (`lib/sync/sync-engine.ts`)

### 3.1 Current code (excerpt, in `syncOnce`)

```ts
for (const mutation of pending) {
  context?.signal.throwIfAborted();
  if (!shouldRetryMutation(mutation)) {
    if (isTransientSchemaCacheError(mutation.lastError)) {
      // reset attempts, keep retrying
    } else {
      logger.warn("Skipping mutation that exceeded max retries", { ... });
      skippedCount++;            // <-- left pending FOREVER; counted in countPending
      continue;
    }
  }
  ...
  try {
    await replayOne(mutation, context?.signal);
    successCount++;
  } catch (error) {
    context?.signal.throwIfAborted();
    const message = ...;
    await markMutationFailed(mutation.id, message);  // attempts+1, lastError
    failureCount++;
    syncDiagnostics.lastSyncError = message;
  }
}
```

### 3.2 Required change (exact)

**A. Quarantine in the retry-exhausted branch** — replace the "skip forever" else with a quarantine:

```ts
} else {
  logger.warn("Quarantining mutation that exceeded max retries", {
    id: mutation.id, entityType: mutation.entityType, attempts: mutation.attempts,
    lastError: mutation.lastError,
  });
  await quarantineMutation(mutation.id, mutation.lastError ?? "Exceeded max retry attempts");
  quarantinedCount++;
  continue;
}
```

**B. Quarantine immediately in the catch** — when a single replay failure pushes the mutation past max retries and the error is non-transient, quarantine in the same pass (so the user doesn't wait for the next cycle):

```ts
} catch (error) {
  context?.signal.throwIfAborted();
  const message = error instanceof Error ? error.message : String(error);
  logger.error("Mutation failed, marking as failed", ...);
  await markMutationFailed(mutation.id, message);
  // After this failure the mutation may have crossed the retry ceiling.
  const refreshed = await getOutboxMutation(mutation.id);
  if (refreshed && !shouldRetryMutation(refreshed) && !isTransientSchemaCacheError(message)) {
    await quarantineMutation(mutation.id, message);
    quarantinedCount++;
  } else {
    failureCount++;
  }
  syncDiagnostics.lastSyncError = message;
}
```

**C. Declare and return `quarantinedCount`** alongside `successCount`/`failureCount`/`skippedCount`, log it, and add it to the diagnostics snapshot.

**D. Pending-count fix (drives the banner)** — because `countPendingMutations` now filters `state === "pending"` (see §1.3), a quarantined mutation no longer keeps `countPending > 0`. The final status line stays:

```ts
const newStatus = online ? (countPending > 0 ? "error" : "idle") : "offline";
```

so the permanent "Some cloud changes could not sync" banner clears for quarantined items. The pill/panel surface the quarantined count instead (never silent).

### 3.3 New public engine APIs (exports)

```ts
export async function unquarantineAndRetry(id: string): Promise<void> {
  await unquarantineMutation(id);
  return syncNow();
}
export async function resolveConflictKeepLocal(conflictId: string): Promise<void>;
export async function resolveConflictKeepRemote(conflictId: string): Promise<void>;
export function getSyncQuarantineCount(): Promise<number>;
```

- `resolveConflictKeepLocal(id)`: read `syncConflicts.get(id)`; if `localPayload` exists, `append(entityType, "update", localPayload, { baseUpdatedAt: null })` as a fresh mutation, then mark the conflict `seen = true, resolution = "local"`, and `syncNow()`.
- `resolveConflictKeepRemote(id)`: mark the conflict `seen = true` (keep auto "remote" resolution) and clear `localPayload`.
- Add the new internal functions to `__syncEngineInternals` for tests.

---

## Acceptance Criteria

### Functional

- [ ] A mutation that exhausts max retries (non-transient error) is moved to `state = "quarantined"` with a reason and timestamp.
- [ ] Quarantined mutations are excluded from `countPendingMutations` / the sync status; the persistent error banner clears.
- [ ] The Sync panel lists quarantined items; **Retry** un-quarantines and re-runs sync; **Discard** removes it (after confirmation).
- [ ] CAS conflicts appear in the panel with local (kept payload) vs cloud (remote) values.
- [ ] **Keep my change** re-enqueues the local payload as a fresh outbox mutation and marks the conflict seen.
- [ ] **Use cloud version** marks the conflict seen and does not re-enqueue.
- [ ] Diagnostics card shows last-sync time, attempts, successes, failures, avg duration, last error, and counts.
- [ ] Empty, loading, offline, and failure states for the panel are handled with clear copy.

### Authorization and security

- [ ] All resolution actions operate only on the current user's local state (no remote writes beyond the existing outbox/CAS path).
- [ ] Quarantine reasons and diagnostics are redacted; no secrets or payloads logged.
- [ ] `localPayload` is rendered through existing safe-rendering boundaries; untrusted strings are escaped.

### Reliability and offline behavior

- [ ] Quarantine survives refresh/restart (persisted in Dexie).
- [ ] Un-quarantine → retry is idempotent; a mutation that fails again re-quarantines.
- [ ] Discard requires explicit user confirmation and is the only hard-delete path.
- [ ] Conflict resolution is local-first and re-enters the normal outbox pipeline.

### Accessibility and UX

- [ ] Keyboard and touch interactions work for all actions (min 44px targets).
- [ ] Screen-reader labels and `aria-live`/`role=alert` announcements present.
- [ ] Color contrast, focus rings, and reduced-motion respected.

### Verification

- [ ] Unit tests: quarantine transition (A/B), immediate quarantine on retry ceiling, pending-count excludes quarantined, unquarantine resets state, resolve keep-local re-enqueues payload.
- [ ] Integration tests: `syncOnce` leaves status `idle` (not `error`) when only quarantined mutations remain.
- [ ] Component tests for the panel (lists, empty states, confirm dialog).
- [ ] Coverage for changed/critical code ≥ 90% (or documented exception).
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` pass.
- [ ] QA Agent report attached; Security Agent review attached.

## Implementation Plan

1. **Red tests** — outbox quarantine helpers, pending-count exclusion, sync-engine transition, conflict re-enqueue.
2. **Types + Dexie v20** — `types.ts`, `dexie.ts` schema + upgrade.
3. **Outbox helpers** — `quarantineMutation`, `unquarantineMutation`, `listQuarantinedMutations`, `countQuarantinedMutations`, `discardMutation`; fix pending count/list.
4. **Sync engine** — retrying → quarantined transition (§3.2), diagnostics exposure, new public APIs.
5. **Repository boundary** — `SyncHealthRepository` interface + Dexie adapter (queries + actions).
6. **UI** — Settings "Sync & data" section, panel + rows + diagnostics card, pill entry point.
7. **Green verification & refactor** — run full suite, typecheck, lint, build.
8. **QA + security review.**

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Persistent "could not sync" banner instances | Appears on any stuck mutation | 0 after a successful retry cycle | E2E + manual | TBD |
| Quarantined items user-resolved | n/a | > 0% actionable (retry/discard used) | Telemetry/console | TBD |
| Unresolved conflict backlog | Invisible | All visible; resolution available | `syncConflicts` seen count | TBD |
| Sync diagnostics visibility | None | Panel exposed in Settings | Manual/QA | TBD |

## Risks and Open Questions

- **Risk:** Re-enqueuing `localPayload` on "keep mine" could overwrite a newer remote row if the remote changed again. **Mitigation:** re-append as a normal outbox mutation (goes through CAS again); document that keep-local is best-effort with CAS protection.
- **Risk:** Storing `localPayload` on every conflict grows IndexedDB. **Mitigation:** store only the single discarded row; clear it on resolve; cap/cleanup old conflicts.
- **Question:** Should "keep remote" also re-apply a fresh pull of the remote row to the local store? **Owner:** Architect. **Decision deadline:** before implementation.
- **Question:** Do we need a rolling persisted diagnostics history, or is the in-memory snapshot sufficient for v1? **Owner:** TBD. Default: in-memory snapshot only.

## Completion Notes

- **Verification commands:** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- **Verification results:** Pending.
- **Bug-ledger updates:** Record the invariant "permanently-failed non-transient mutations must never remain counted as pending" once confirmed.
- **Follow-up work:** None.
