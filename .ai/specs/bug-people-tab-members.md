# Bug Report: People tab omitted Viatik trip members

**Project:** Viatik  
**Reporter:** User  
**Status:** Resolved  
**Date reported:** 2026-09-21  
**Priority:** P1  
**Related feature/spec:** Trip People tab

## Observed Problem

The People tab rendered only `tripTravelers`. Users who had joined the trip as Viatik collaborators were present in `tripMembers` but were not shown unless a separate traveler/contact row existed.

## Expected Behavior

The People tab must show every person on the trip: named travelers and Viatik members. A member linked to a traveler must appear once, not twice. Linked Viatik travelers may edit local relationship metadata, while their account-managed name and avatar remain read-only.

## Root Cause and Fix

`PeoplePanel` already watched both travelers and members, but only mapped `travelers` into the rendered list. It now loads authorized public profiles for trip members and renders member-only rows while suppressing members already represented by linked traveler contacts.

## Verification

`pnpm exec vitest run features/collaboration/components/people-panel.test.tsx features/contacts/components/traveler-panel.test.tsx features/contacts/components/contact-editor-dialog.test.tsx`; `pnpm lint`; `pnpm typecheck`; `pnpm build`; `git diff --check` — all passed.
