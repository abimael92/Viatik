# Bug Report: Unhandled Parse and Async Failures

**Project:** Viatik  
**Reporter:** User  
**Status:** Ready for QA  
**Date reported:** 2026-11-05  
**Priority:** P2  
**Related feature/spec:** Cross-feature failure handling

## Observed Problem

The report identifies crash paths where parsing untrusted input may throw and
where asynchronous UI work may reject without a rejection handler. A source audit
found unhandled asynchronous boundaries across authentication, settings,
app-shell sign-out, Vault, health, currency conversion, trip lifecycle, weather
refresh, journal, packing, collaboration, media retry, traveler, and travel
document flows. Malformed itinerary drag data is caught as invalid JSON, but
valid JSON with the wrong shape can still pass an invalid activity ID to the
move callback.

Confirmed audit inventory:

- Authentication forms: password/register, email-code request/verification,
  development login, password reset, and onboarding server actions.
- Recovery-link completion, settings QR loading/profile save, and app-shell
  logout/database cleanup.
- Vault keyset loading and native health app-state listener registration/removal.
- Currency-rate cache seeding, lookup, and manual save.
- Home trip start/cancel, Home weather refresh, and journal experience save.
- Community itinerary preview drag payload shape validation.
- Packing-list auto-seeding and user mutations, collaborator/member mutations,
  trip-invitation decline, activity/voice-note upload retry, and the
  TripWorkspace personal-budget lookup.
- Traveler removal and travel-document removal.

## Expected Behavior

- Invalid or wrongly shaped drag payloads are ignored without invoking the move
  callback.
- An asynchronous UI operation that rejects is handled at its UI boundary. The
  user sees the existing localized error state or fallback behavior rather than
  an unhandled rejection.
- Existing parsers and actions that already return a safe fallback or are
  handled by a caller remain unchanged.

## Impact

- **Users affected:** Travelers using affected auth, settings, vault, health,
  currency, contacts, trips, weather, packing, collaboration, media, or journal
  flows.
- **Severity:** Medium
- **Data/security impact:** No data exposure identified. A failed local write
  must remain visible as a failure and must not be reported as successful.
- **Workaround:** Retry the operation or reload the affected screen.

## How to Reproduce

1. Reject the relevant server action, IndexedDB operation, or native listener
   setup at the client boundary (using a deterministic rejected-promise test).
2. Observe the current UI effect or handler has no rejection path.
3. For the itinerary preview, drop a valid JSON object without a string
   `activityId` and observe the move callback receives an invalid value.

**Reproducibility:** Deterministic with rejected-promise and malformed-payload
fixtures  
**Minimal reproduction/test:** Existing Settings, Auth, Home, Finance, and Steps
component tests; add focused tests for newly covered boundaries.

## Investigation

### Root Cause

Several client effects and transitions assume their asynchronous collaborators
always resolve. `.finally()` restores pending state in some flows but does not
handle rejection. Other flows launch a Promise chain or async callback without
either a local `try/catch` or a terminal `.catch(...)`.

The direct `JSON.parse` call sites found in the source audit are generally
protected locally or at their caller. The itinerary preview's drop handler
catches malformed JSON, but does not validate the decoded payload shape before
calling `onActivityMove`. No unhandled JSON syntax exception was found in the
remaining parse sites; those existing fallbacks and caller-level catches are
out of scope for code changes.

### Contributing Factors

- UI tests cover successful asynchronous results more often than rejected
  promises.
- A grep-visible `void` or `.then()` is not sufficient evidence of a bug; many
  callees already catch failures. The fix scope is limited to confirmed
  boundaries with no error handler.

### Security Assessment

Drag-and-drop data is untrusted input and will be shape-checked before use.
Other changes add client-side failure handling only; authentication and
authorization remain server-enforced. No schema, migration, or remote data
access changes are planned.

## Fix Plan

1. Add a regression test for malformed and wrongly shaped itinerary drag data.
2. Add rejected-promise tests at the affected UI seams and handle failures using
   existing localized error or fallback UI.
3. Keep already-guarded parsers, internal helpers that handle their own
   rejections, and non-product test harnesses unchanged.
4. Run affected tests, lint, typecheck, and applicable i18n checks.

## Acceptance Criteria for Resolution

- [x] Wrongly shaped itinerary drag payloads do not invoke the move callback.
- [x] Every confirmed unhandled asynchronous boundary in the audit inventory
  handles rejection without reporting success.
- [x] Affected UI exposes an existing localized error/fallback state where the
  flow has one.
- [x] Regression tests exercise rejected promises and malformed input.
- [x] Affected tests, lint, and i18n audit pass.
- [ ] Typecheck passes (blocked by an unrelated existing error in `app/layout.tsx:25`).
- [x] No Dexie schema, Supabase policy, sync, or authorization behavior changes.
- [x] The bug-ledger invariant decision and memory entry are recorded.

## Resolution

- **Resolved behavior:** Malformed or wrongly shaped itinerary drop data is
  ignored. Every confirmed asynchronous UI boundary in the audit inventory now
  handles rejection and exposes localized failure feedback or a safe fallback.
- **Fix commit/PR:** Pending
- **Verification evidence:** `bash .agents/skills/test-runner.sh` passed (103
  suites / 675 tests); `pnpm lint`, `pnpm agent:audit-i18n`, and `pnpm
  agent:schema` passed. `pnpm typecheck` remains blocked by
  `app/layout.tsx:25:50` (`LayoutProps` is a value used as a type); that file is
  unchanged by this work.
- **Bug ledger entry:** Added below.
- **Follow-up:** Resolve the unrelated `app/layout.tsx` typecheck failure in a
  separate scoped task.
