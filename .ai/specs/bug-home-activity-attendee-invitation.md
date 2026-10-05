# Bug Report: Home activity details hide attendee identity and RSVP state

**Project:** Viatik  
**Reporter:** User report  
**Status:** Resolved  
**Date reported:** 2026-10-05  
**Priority:** P2  
**Related feature/spec:** [Activity participant identity](./bug-activity-participant-identity.md)

## Observed Problem

The Home activity-details dialog shows generic chips such as “Viajero del viaje 1” and “Tú” under “Asistentes”. It omits traveler avatars and declined participants, so travelers who are not going are not visibly distinguished.

## Expected Behavior

The attendee list shows each participant's current name and available avatar. Participants with a `declined` or `pending` activity RSVP remain visible at reduced opacity and are keyboard-accessible. Activating a non-attending participant opens an invitation dialog with a prefilled message; WhatsApp opens only after the user chooses the handoff button, and the app never sends a message automatically.

## Impact

- **Users affected:** Travelers coordinating an activity with trip members or named travelers.
- **Severity:** Medium.
- **Data/security impact:** Attendee state is already stored locally on the activity. Invitation text may contain the activity and trip names and is shared externally only after the user activates WhatsApp.
- **Workaround:** Open the itinerary activity editor and inspect the participant selector.

## How to Reproduce

1. Create an activity with trip members or named travelers and mark one participant as not going.
2. Open that activity from Home's timeline.
3. Observe generic attendee labels, no avatars, and no visible declined participant.

**Reproducibility:** Reproduced by supplied screenshot and code path.  
**Minimal reproduction/test:** `features/trips/components/home/live-timeline-hud.test.tsx`.

## Environment Details

- **Application version/commit:** Working tree; exact commit unknown.
- **Browser/device:** Browser, localhost:3000.
- **Operating system:** Unknown.
- **Network state:** Unknown.
- **User role/account state:** Authenticated trip member.
- **Database/API version:** Local-first Dexie plus linked Supabase sync; attendee rendering uses local state and the safe public-profile repository boundary.
- **Feature flags/configuration:** None known.
- **Logs/traces/screenshots:** Screenshot supplied in conversation; contains no private trip content beyond generic traveler labels.

## Investigation

### Root Cause

`ActivityDetailModal` filters `activity.participants` to only `attending`, uses the participant's optional `displayName` or a generic fallback, and renders plain text chips. It does not resolve `userId` to the current user's local profile or safe collaborator profile, resolve `travelerId` to the local trip traveler/contact, or expose declined entries for invitation.

### Contributing Factors

- The current participant summary has no attendee view model combining activity status with local trip traveler/contact and public collaborator identity.
- Home already loads trip members for readiness but does not provide member profiles, named travelers, or contacts to the activity details dialog.

### Security Assessment

No Supabase domain-table access is added to UI components. Collaborator identity is loaded through the existing safe `collaborationRepository.listProfiles` boundary; named traveler/contact details remain local Dexie data. No message or invitation is sent automatically. The WhatsApp handoff is user-initiated and contains only the selected activity/trip text.

## Fix Plan

1. Add regression tests for resolved names/avatars, non-attending opacity, and invitation modal behavior.
2. Enrich Home activity attendees from trip members, public profile summaries, named travelers, and local contacts.
3. Render declined/pending attendees as dimmed, accessible controls; open a localized invitation dialog on activation.
4. Add an explicit WhatsApp handoff with a prefilled message; do not send until the traveler activates it.
5. Update the bug ledger and run focused tests, lint, typecheck, and build.

## Acceptance Criteria for Resolution

- [x] Attending, declined, and pending participants are represented; no status is silently omitted.
- [x] Available participant names and configured avatars render from their approved local/profile sources; no internal IDs are displayed.
- [x] Declined/pending entries are visibly dimmed and keyboard accessible.
- [x] Activating a non-attending participant opens a modal with a prefilled, localized activity invitation.
- [x] The WhatsApp link opens only after explicit user action; no message is sent automatically.
- [x] Regression tests and project verification pass.
- [x] The related bug ledger invariant is updated.

## Resolution

- **Resolved behavior:** Home activity details show resolved attendee names and avatars for available local/public profile data, dim non-attending people, and open a localized WhatsApp invitation handoff on click without sending a message automatically.
- **Fix commit/PR:** Pending.
- **Verification evidence:** `pnpm test` (196 files / 1,235 tests), `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.
- **Bug ledger entry:** Added to `bug-ledger.md`.
- **Follow-up:** None known.
