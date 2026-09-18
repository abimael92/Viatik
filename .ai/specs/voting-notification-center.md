# Feature Specification: Voting Resolution and Notification Center

**Project:** Viatik  
**Owner:** Viatik Product  
**Status:** In Progress  
**Created:** 2026-09-17  
**Updated:** 2026-09-17  
**Related work:** None

## What & Why

Viatik needs deterministic group-vote completion and one centralized place for actionable collaboration alerts. Voting remains local-first: Dexie receives optimistic writes and the sync outbox publishes them to Supabase. Notifications are synchronized records, never direct UI queries to Supabase.

## In Scope

- Require at least two trip members with a non-null Viatik identity before enabling activity voting.
- Close a poll when every eligible Viatik user has voted; resolve a unique winner and mark ties for owner intervention.
- Add the Level B `notifications` table and local domain/repository model.
- Add notifications for poll requests, connection requests, pending settlements, and imminent trip starts.
- Add `/notifications`, navigation badge, and profile-menu entry using existing UI primitives.

## Out of Scope

- Payment-provider integration for settlement actions.
- A new remote polling API or direct Supabase access from UI components.
- Replacing the existing unified Decision model in this change.

## Constraints and Design

- **Architecture boundaries:** UI calls Dexie repositories; repository writes are transactional and enqueue outbox mutations. Supabase is the remote sync target and authorization boundary.
- **Data ownership:** Dexie is the client source of truth. Notifications are synced records scoped to `user_id` and are readable only by their owner through RLS.
- **Security requirements:** All notification writes are owner/system-authorized server-side; action handlers must validate ownership and reference state. Client eligibility is UX only.
- **Migration/rollback plan:** Strictly additive migration creates `notifications`, its enum/check constraints, indexes, RLS policies, and idempotent notification-generating triggers. Rollback is by disabling/removing the new feature in a later migration, never by destructive edits to existing tables.
- **SOLID/design decisions:** Voting tally/majority is a pure domain function; notification persistence is behind a focused repository; navigation only consumes a notification count hook.

## Acceptance Criteria

### Functional

- [ ] Voting controls are disabled with tooltip `Requires at least 2 Viatik users` when eligible members are fewer than two.
- [ ] A final eligible vote closes the poll.
- [ ] A unique majority applies the winning activity option and marks the poll approved/confirmed.
- [ ] A tie marks the poll `tie_breaker_needed` and creates an owner notification.
- [ ] Notification rows include type, reference, read state, message, created/updated timestamps, and positive version.
- [ ] `/notifications` renders friend requests, votes, settlements, and trip alerts with inline action buttons.
- [ ] Unread count appears in the global bell and marks notifications read through Dexie.

### Reliability and offline behavior

- [ ] Local writes remain available offline and are replayed through the outbox.
- [ ] Notification generation is idempotent for the same type/reference/recipient.
- [ ] Poll resolution does not double-apply after retries.

### Accessibility and UX

- [ ] Bell and row action buttons have accessible names and keyboard focus states.
- [ ] The disabled-voting reason is available through a tooltip/title.
- [ ] Empty, loading, and error states are rendered.

## Implementation Plan

1. Add pure voting resolution tests and notification model/repository tests.
2. Add migration and local Dexie store/mappers/sync definition.
3. Update activity voting and trip-member identity propagation.
4. Add notification page and navigation surfaces.
5. Run targeted tests, lint, typecheck, and build.

## Verification

`pnpm test -- features/activities/components/__tests__/activity-vote-card.test.tsx features/notifications`  
`pnpm lint`  
`pnpm typecheck`  
`pnpm build`

## Risks and Open Questions

- Existing activity voting stores legacy JSON poll fields while unified Decisions also exist. This implementation preserves the activity flow and keeps the migration additive.
- Profile identity enrichment for trip members must remain safe and may be unavailable offline; the local member record carries a nullable `viatikId` when synced.

## Completion Notes

- Verification results: Pending.
- Security review: Pending.
- QA report: Pending.
