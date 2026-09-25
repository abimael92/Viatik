# Bug Report: Viewers cannot RSVP, and direct trip adds do not notify

**Project:** Viatik
**Status:** Resolved
**Date reported:** 2026-09-25
**Priority:** P1

## Observed Problem

Attendance can be changed only inside the activity editor, which viewers cannot open. Adding a linked contact directly to a trip creates a member row and does not create a notification for that person.

## Expected Behavior

- Every trip member, including a viewer, can set their own attendance to Going or Not going from the activity card and the read-only activity details. The write changes only that member's participant status and is queued in the Dexie outbox. It does not open the activity editor.
- A new direct member insert queues a `trip_added` notification for the added user. The message payload is the trip name. The recipient's notification screen renders "You have been added to {trip}" from the i18n dictionary. The row syncs so the recipient can pull it.

## Impact

- **Users affected:** Trip viewers and people added from contacts.
- **Severity:** High
- **Data/security impact:** An RSVP must not let a viewer change any other activity field or another traveler's attendance.

## How to Reproduce

1. Open a trip as a viewer and try to mark an activity as not going.
2. Add a linked contact to a trip and check that person's notifications.

**Reproducibility:** Always
