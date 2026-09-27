# Feature Specification: Trip Wrap-Up

**Project:** Viatik  
**Owner:** Viatik Engineering  
**Status:** Ready for QA  
**Created:** 2026-09-27  
**Updated:** 2026-09-27  
**Related work:** Trip lifecycle, packing list, settlement ledger

## What & Why

### What

Ending a trip opens a wrap-up sheet: return packing, open debts versus the trip budget, and upcoming transit or lodging. The existing End trip action still completes the trip. On the trip’s end date, Home queues one local reminder to pack for the return.

### Why

Travelers need a last look at belongings, money, and the way out without losing the outbound packing checks or getting stuck when a debt cannot be settled offline.

### Users and scenarios

- **Primary user:** A traveler on the last day of an active trip.
- **Scenario 1:** End trip opens the sheet. Unpacked return items and open debts are described in text. End trip stays enabled and calls `endTrip()`.
- **Scenario 2:** Not yet closes the sheet and leaves the trip active.
- **Offline or degraded-network behavior:** Packing checks and the reminder are local. Ending the trip still uses the existing trip outbox write.

## In Scope

- Dexie v39 `packedForReturn` on local packing items, default `false`.
- Return mode of `PackingListView` that does not write `isPacked`.
- `WrapUpSheet` on Home and the trips dashboard.
- One local `trip_alert` whose `referenceId` is `${tripId}_return`.

## Out of Scope

- A new trip status. `planned | active | completed | cancelled` stays.
- Syncing packing items. They are private per device and have no remote table.
- Pushing the reminder through the outbox. Remote `reference_id` is a uuid and already stores the start-of-trip alert on the trip id.
- Blocking End trip because of unpacked items or debts.
- Changes to `useTripBalances`, settlement math, or `endTrip()`.

## Constraints and Design

- **Architecture boundaries:** Packing writes stay in `DexiePackingRepository`. The reminder uses `notificationRepository.create` and does not call `append`. The sheet reads balances and spending and opens the existing `SettleUpSheet`.
- **Data ownership:** `packedForReturn` and the reminder row are device-local. Trip completion remains the synced `completed` status.
- **Security requirements:** No new remote write. Settle Up keeps the member-uuid rule.
- **Compatibility:** Dexie v39 backfill only. No Supabase migration.
- **SOLID/design decisions:** Departure filtering is a pure function. The sheet does not own lifecycle writes.
- **Migration/rollback plan:** v39 sets missing `packedForReturn` to `false` and does not change `isPacked`. Rollback is the previous client; extra local fields are ignored.
- **Observability:** Reminder failures are debug logs with the trip id only.

The Architect Agent must review this section before implementation. Link any decision record here: Approved with the 2026-09-27 wrap-up review. Packing stays local because syncing it would add an outbox entity the field test does not need.

## Acceptance Criteria

### Functional

- [x] Return checks do not change `isPacked`.
- [x] End trip stays enabled when items or debts are unfinished and calls `endTrip()`.
- [x] The end-date reminder is a single `trip_alert` with reference `${tripId}_return`.
- [x] Departure list includes transit and lodging from today forward.

### Authorization and security

- [x] The reminder is not enqueued for sync.
- [x] Settle Up is offered only for member uuid pairs.

### Reliability and offline behavior

- [x] Existing end-trip outbox behavior is unchanged.
- [x] A missing database skips the reminder instead of throwing into Home.

### Accessibility and UX

- [x] The unfinished-work line is `role="status"` text.
- [x] Not yet and End trip are real buttons. End trip is not disabled by debts or unpacked items.

### Verification

- [x] Unit tests for packing, the reminder, departure stops, and the sheet
- [x] Typecheck and lint on changed files

## Implementation Plan

1. Dexie v39 and return packing writes.
2. Reminder and departure helpers.
3. Wrap-up sheet wired to both End trip buttons.
4. Tests.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| End trip blocked by debts | No | Still no | Sheet test | Engineering |
| Outbound packing overwritten by return checks | Possible if one flag were reused | Zero | Repository test | Engineering |

## Risks and Open Questions

- **Risk:** Syncing `packedForReturn` would require a new remote packing table and outbox type. Mitigation: keep it local.
- **Risk:** Using the trip id as `trip_alert` reference collides with the start-date alert. Mitigation: `${tripId}_return`, not synced.
- **Question:** None.

## Completion Notes

- **Verification commands:** `pnpm exec tsc --noEmit`; `pnpm exec eslint` on the wrap-up files; `pnpm exec vitest run` for packing, reminder, departure stops, wrap-up sheet, trip dashboard, and the Dexie v39 migration.
- **Verification results:** Typecheck passed. Lint passed. Targeted tests passed. Signed-in browser pass of End trip is still required on a live trip.
- **Bug-ledger updates:** Not applicable.
- **Follow-up work:** None.
