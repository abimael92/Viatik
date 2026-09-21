# Viatik Bug Ledger

**Purpose:** Record confirmed bugs, their root causes, and the durable invariants added to prevent recurrence.  
**Framework entry point:** [`../llms.txt`](../llms.txt)  
**Governing rules:** [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md)
**Related templates:** [`../templates/feature-spec.md`](../templates/feature-spec.md) and [`../templates/bug-report.md`](../templates/bug-report.md)

## How to Use This Ledger

1. Create a bug report from [`../templates/bug-report.md`](../templates/bug-report.md).
2. Reproduce the problem before changing code.
3. Identify the root cause, not only the visible symptom.
4. Decide whether the fix requires a durable invariant.
5. Add a row below and link the bug report, test, or design record where useful.
6. Update the affected feature specification if expected behavior changed.
7. Record the fix commit only after verification passes.

## When to Add an Invariant

Add an invariant when the bug reveals a rule that must remain true across implementations, future refactors, environments, or data states. Typical cases include:

- Authorization or security boundaries.
- Data integrity, money, ordering, or state-transition rules.
- Offline synchronization and idempotency behavior.
- A regression likely to recur without an explicit test or constraint.
- A rule that belongs in the domain model, database constraint, RLS policy, or shared validation layer.

## When It Is Reasonable to Skip an Invariant

An invariant may be skipped when the issue is purely incidental and does not reveal a reusable system rule, for example:

- A typo or copy-only correction with no behavior change.
- A one-off test-fixture mistake.
- A tooling failure unrelated to application behavior.
- A temporary development-only issue that cannot occur in supported environments.

When skipping, record `None — incidental issue` in the bug report or related spec and explain why.

## Good and Bad Invariants

### Good invariants

- `A viewer cannot create, update, or delete any trip-owned record, even with a crafted client request.`
- `Every locally applied mutation has a stable mutation ID and is safe to replay more than once.`
- `An exact expense split must equal the expense total in integer minor units.`
- `A stale compare-and-swap mutation cannot overwrite a newer remote record.`
- `An activity order is based on stable IDs and sortable rank metadata, never array position as identity.`

### Bad invariants

- `The page should work correctly.` — not testable or specific.
- `Users should not see errors.` — ignores valid failure states.
- `Use the new helper everywhere.` — prescribes an implementation rather than a behavior.
- `The button is blue.` — a styling detail, not a durable correctness rule.
- `Make it fast.` — lacks a measurable threshold and measurement method.

## Bug Table

| Date | Bug | Root Cause | Fix |
|---|---|---|---|
| [YYYY-MM-DD] | [Short bug description and link to report] | [Underlying technical cause and invariant/spec decision] | [COMMIT_SHA, PR link, or `Pending`] |
| 2026-09-10 | P0: `profiles` RLS exposed PII to any authenticated user sharing a trip. The `profiles_select_self_or_shared_trip` policy let trip collaborators select the FULL `profiles` row, leaking `phone`, `birth_date`, `passport_issuing_country`, `passport_expires_on`, `allergies`, `dietary_restrictions`, and `emergency_contact_*`. | **Invariant:** Direct reads of `public.profiles` are limited to the row owner (`auth.uid() = id`) via RLS. Collaborator identity (name/avatar/handle/preferences) is served only through a security-definer RPC (`get_profile_public_data(uuid[])`) that returns an explicit allow-list of safe, public columns, sourced from the sanitized `profile_directory`, and gated to the caller plus users sharing a non-deleted trip. Sensitive profile columns are never readable by another authenticated user. | migration `00000000000037_fix_profiles_rls.sql`; repository switched `listProfiles` to the RPC; regression test `supabase/profiles-rls-security.test.ts`. |
| 2026-09-11 | Adding a connection by a valid Viatik ID remained in the loading state and never rendered the matched profile. | **Invariant:** An asynchronous lookup result may update the add-contact UI only when its submitted value still equals the latest input value; stale-response checks must use synchronously updated request state rather than state captured before React re-renders. | `features/contacts/components/AddContactCommandBar.test.tsx`; fix pending. |
| 2026-09-17 | Trip titles on the Trips page could become unreadable over bright or busy cover images. | **Invariant:** Text rendered over user-selected trip covers must include a stable contrast treatment; title legibility cannot depend on the image content or a drop shadow alone. | `.ai/specs/bug-trip-cover-title-contrast.md`; `features/trips/components/__tests__/trip-dashboard.test.tsx`; implementation verified, commit pending. |
| 2026-09-17 | Failed cloud changes displayed a manual retry but did not reliably auto-retry or expose the five-second countdown. | **Invariant:** When the browser is online and local changes remain pending or sync fails, exactly one foreground sync owner schedules a retry after five seconds; offline state pauses the timer and manual retry cancels it. | `lib/sync/use-sync-status.test.ts`; implementation verified, commit pending. |
| 2026-09-17 | The app shell exposed a redundant Notifications link and bell in the profile card footer. | **Invariant:** Each app-shell surface exposes one notification bell beside the user identity; the profile card footer must not duplicate notification navigation. | `components/app-shell/app-shell.tsx`; implementation verified, commit pending. |
| 2026-09-17 | Authenticated users without a `next` path were sent to Trips instead of Home; Home Money tools navigated away instead of opening locally; mobile users had no logout control. | **Invariant:** Default authenticated entry is `/home`; contextual Home tools remain on Home in a modal; every app-shell viewport exposes an accessible logout action. | `app/(auth)/login/page.tsx`; `features/trips/components/home/home-page.tsx`; `components/app-shell/app-shell.tsx`; implementation verified, commit pending. |
| 2026-09-17 | Activity suggestions had no creator-only cancellation action or persisted cancelled state. | **Invariant:** A proposal creator can cancel a suggestion locally and sync it as `cancelled`; other members cannot perform that transition, and creator/time/vote metadata remains auditable. | migration `00000000000048_activity_proposal_cancellation.sql`; `activity-vote-card.test.tsx`; implementation verified, commit pending. |
| 2026-09-17 | Activity and vote feedback avatars could ignore the signed-in user's configured avatar and use stale public profile data instead. | **Invariant:** Every rendered activity/voter avatar uses the signed-in user's local profile avatar or seed for that user's own identity; collaborator avatars use authorized public profile data, with a deterministic fallback only when unavailable. | `features/activities/components/activity-card.tsx`; `features/activities/components/activity-vote-card.tsx`; `activity-card.test.tsx`; `activity-vote-card.test.tsx`; implementation verified, commit pending. |
| 2026-09-17 | Public voter profiles could return stale avatar data from the profile-directory projection after an account avatar update. | **Invariant:** The public profile RPC must source current avatar URL and seed values from `profiles`, while retaining shared-trip authorization and the public-column allow-list. | migration `00000000000049_refresh_public_avatar_data.sql`; implementation pending deployment verification. |
| 2026-09-21 | The Trips library did not render the existing cross-trip activity stream, so traveler actions from other trips were not visible together. | **Invariant:** The Trips library must expose a newest-first activity stream aggregated from all locally synchronized trips, including actor identity and event time; each trip workspace remains scoped to its own feed. | `features/trips/components/trip-dashboard.tsx`; `trip-dashboard.test.tsx`; implementation verified, commit pending. |
| 2026-09-20 | On mobile, horizontal scrolling in the calendar-style itinerary made the active day difficult to identify. | **Invariant:** The mobile itinerary keeps the local-time rail anchored while horizontally scrolling day columns, and each visible day header exposes an explicit day/date label. | `.ai/specs/bug-mobile-itinerary-day-header.md`; `features/activities/components/__tests__/week-calendar.test.tsx`; implementation verified, commit pending. |
| 2026-09-20 | Add Activity participant rows showed raw Viatik IDs, duplicate identities, and missing collaborator avatars. | **Invariant:** Participant rows use available public profile identity, never expose internal IDs as labels, and render a linked identity only once. | `.ai/specs/bug-activity-participant-identity.md`; `features/activities/components/__tests__/activity-form.test.tsx`; implementation verified, commit pending. |
| 2026-09-20 | Create-trip wizard could submit from step two before users reached the banner step. | **Invariant:** Trip creation is allowed only from the final wizard step; intermediate navigation must never persist a trip, and the final step must expose banner placement. | `.ai/specs/bug-create-trip-step-navigation.md`; `features/trips/components/__tests__/trip-dashboard.test.tsx`; implementation verified, commit pending. |
| 2026-09-20 | Destructive actions used native browser confirmations and transient operation feedback was inconsistent. | **Invariant:** Destructive actions use an accessible accept/cancel modal; informational, success, and failure notifications use the shared toast system; field validation remains inline. | `.ai/specs/bug-native-alerts-and-notifications.md`; `components/ui/confirm-dialog.tsx`; implementation verified, commit pending. |

## Entry Quality Checklist

- [ ] The bug was reproduced or evidence was collected.
- [ ] The root cause is distinguished from the symptom.
- [ ] The invariant is behavior-focused and testable, or the skip reason is documented.
- [ ] A regression test, constraint, policy, or validation rule was added when appropriate.
- [ ] The related feature spec or bug report was updated.
- [ ] Verification passed before the fix commit was recorded.
