# Feature Specification: Active Trip Actions

**Project:** Viatik  
**Owner:** Viatik frontend  
**Status:** Ready for QA  
**Created:** 2026-09-21  
**Updated:** 2026-09-21  
**Related work:** Home operational cockpit

## What & Why

The active-trip Home cockpit needs a compact action row immediately below today's timeline so travelers can capture expenses, itinerary activities, and photos without searching through the trip workspace.

The actions reuse the existing local-first workspace forms. Navigation carries an explicit action intent so the destination opens the existing expense sheet, activity dialog, or gallery picker with the active trip context.

## In Scope

- Render an accessible, responsive `ActiveTripActions` row only when an active trip exists.
- Open existing expense, activity, and gallery flows with active trip context.
- Preserve local Dexie writes and outbox behavior for all mutations.
- Default new expense payer to the authenticated user, currency to trip base currency, and date to today.
- Default new activities to today's date and current hour.
- Open the existing mobile-friendly photo picker, which writes pending media locally and exposes sync status.

## Out of Scope

- New Supabase domain queries or mutations.
- A second expense/activity/gallery implementation.
- Changes to the media upload worker or schema.

## Constraints and Design

- **Architecture boundaries:** Home links to the Trip Workspace action-intent boundary; repositories remain responsible for Dexie and outbox persistence.
- **Data ownership:** Dexie is the source of truth. Supabase is only the sync target.
- **Security requirements:** The authenticated server user remains the source of `userId`; action query values are fixed allowlisted intents, and existing edit-role checks remain the mutation boundary.
- **Compatibility:** Next.js 16 App Router, React 19, mobile and desktop browsers.
- **SOLID/design decisions:** The Home row owns presentation and intent links; existing workspace components own forms and mutations.
- **Migration/rollback plan:** No schema changes. Removing the row and action intent support cleanly restores prior workspace behavior.

## Acceptance Criteria

### Functional

- [ ] Active trips show Add Expense, Add Activity, and Add Photo between the timeline and Recent activity.
- [ ] Planned/non-active trips do not show the row.
- [ ] Add Expense opens the existing expense form for the active trip with authenticated payer, base currency, and today's date defaults.
- [ ] Add Activity opens the existing activity form with today's date and current-hour start time.
- [ ] Add Photo opens the existing gallery picker and new media appears locally with pending/syncing status.

### Reliability and offline behavior

- [ ] Expense, activity, and media writes continue to use their Dexie repositories and outbox transactions.
- [ ] The gallery's existing local subscription reflects pending media without waiting for remote upload.

### Accessibility and UX

- [ ] Action targets meet touch sizing, have visible focus styles, and work with keyboard navigation.
- [ ] The row remains usable on narrow screens without desktop horizontal overflow.

### Verification

- [ ] Home rendering/action-intent tests added or updated.
- [ ] Typecheck, lint, and relevant tests pass.

## Implementation Plan

1. Add red assertions for active-only rendering and action destinations.
2. Add the reusable action row and action-intent routing.
3. Ensure workspace defaults preserve base currency and current-date/time drafts.
4. Run focused tests, lint, typecheck, and build as applicable.

## Risks and Open Questions

- The action links change the visible tab in the trip workspace rather than duplicating modal state in Home; this keeps mutation ownership in existing components and avoids violating local-first boundaries.

## Completion Notes

- **Verification commands:** `pnpm typecheck`; `pnpm lint`; `pnpm build`; focused Home tests via a temporary Vitest config; `git diff --check`.
- **Verification results:** Typecheck, lint, build, diff check, and focused active-action/non-active tests passed. The repository's default/full test command currently reports 8 unrelated failures in existing mapper/feed/expense participant tests, plus date-sensitive Home assertions outside this change.
- **Follow-up work:** Resolve the pre-existing repository test failures separately.
