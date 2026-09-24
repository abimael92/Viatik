# Feature Specification: Activity Must-dos

**Project:** Viatik  
**Owner:** Viatik Product  
**Status:** Complete  
**Created:** 2026-09-23  
**Updated:** 2026-09-23  
**Related work:** Activity create/edit/proposal flow and home live itinerary

## What & Why

Activities may contain an ordered list of concrete Must-dos travelers need to complete. Structure is planned on the trip itinerary form. On Home during an active trip, travelers can check Must-dos off, reopen them, soft-skip them, restore them, or permanently delete them—quick on-the-go actions without adding, renaming, or reordering. Home timeline cards emphasize time-to-active status and Must-do progress; every mutation broadcasts to the shared Recent activity feed.

## Users and scenarios

- **Primary user:** A trip member using Home during an active trip.
- **Scenario 1:** Trip editors add, rename, reorder, and delete Must-dos on the itinerary activity form.
- **Scenario 2:** From Home, a member completes, reopens, archives, restores, or deletes a Must-do; changes save the parent Activity locally immediately and emit a specific feed entry (e.g. completed “Sacar efectivo” on “compras”).
- **Scenario 3:** Skipped Must-dos can be restored or deleted from a collapsed “Archived” section on Home.
- **Offline or degraded-network behavior:** Must-do reads and mutations work from Dexie without network access and survive refresh.

## In Scope

- Embedded Must-dos on Activity with stable IDs, titles, `completed`, and `archived`.
- Full structure editing on the trip-page activity form.
- Home timeline cards: Active badge / “Starts in …” countdown and compact Must-do progress; no weather on cards or detail sheet.
- Home detail sheets always show a description and attendees. A missing description uses a neutral localized fallback; activities without explicit participants explain that everyone on the trip is included.
- Home detail sheets with no Must-dos omit the Must-do heading, progress, empty CTA, and action controls.
- Home quick actions for populated Must-dos: check/reopen, archive/restore, and hard delete through the feed-aware `updateChecklist` path. Home does not add Must-dos.
- Timeline projection retains activity participant snapshots without remote queries; current users render as “You,” manual participants use `displayName`, and unavailable names use a safe localized fallback rather than raw IDs.
- Parent Activity checklist, derived progress, version, updater, and update timestamp change atomically in Dexie; checklist progress does not alter the timeline’s temporal past/current/future state.
- Collaborators reconstruct specific checklist feed events from synchronized Activity checklist changes.
- Local-first persistence via activity outbox and Supabase JSONB.

## Out of Scope

- Adding, renaming, or reordering Must-dos from Home.
- Weather prompts or widgets on the Home timeline activity card/modal.
- Assignees, due dates, reminders.

## Constraints and Design

- **Architecture boundaries:** Home timeline owns day-of checklist interaction; activity form remains available for planning; activity repository owns durable local writes; Supabase mappers/sync migrations carry the serialized activity field.
- **Data ownership:** Dexie is the local source of truth. Every Home checklist mutation uses `activityRepository.updateChecklist`, which updates the parent Activity/outbox and local feed atomically. Supabase is only the synchronization/authorization target; receiving clients derive the same specific feed event from the synchronized checklist diff.
- **Security requirements:** Trip members may update the activity `checklist` field (structure and completion). Other activity fields remain editor-gated. Checklist titles are trimmed, length-limited, and rendered as text.
- **Compatibility:** Next.js 16 App Router, React 19, TypeScript strict, existing Dexie and Supabase sync paths.
- **SOLID/design decisions:** Keep checklist value objects inside the Activity contract rather than introducing a second table; reuse the activity update/outbox path so updates remain atomic with activity metadata; checklist feed verbs are distinct from generic `updated_activity`.
- **Migration/rollback plan:** Additive JSONB column plus member checklist manage policy. Legacy rows map to an empty checklist.
- **Observability:** Do not log checklist text or completion contents; existing activity mutation logs may identify only the activity ID and feed verb.

## Acceptance Criteria

### Functional

- [x] New activities and proposals can include zero or more ordered Must-dos.
- [x] Home live timeline cards show Active / countdown and Must-do progress; every detail sheet shows description and attendees, while a populated sheet lists Must-dos with check/reopen, archive/restore, and delete controls (no add UI or weather).
- [x] Completing, reopening, archiving, restoring, or deleting a Must-do updates the parent Activity in Dexie via outbox and inserts a shared feed item with a specific verb.
- [x] Trip-page form can still edit Must-do structure while planning.
- [x] Legacy activities without Must-do data render with an empty editable Must-do area on the activity form and description plus attendees only on Home.

### Authorization and security

- [x] Trip members may update checklist content; other activity fields remain editor-gated server-side.
- [x] Checklist input is trimmed, bounded, and safely rendered as text.
- [x] No secrets or sensitive data are logged or exposed.

### Reliability and offline behavior

- [x] Checklist changes use the existing activity transaction and outbox mutation path.
- [x] Checklist mutations work offline and replay through activity CAS synchronization; receiving collaborators derive the specific checklist event for their local shared feed.
- [x] Concurrent/stale activity updates follow existing version/base timestamp conflict behavior.
- [x] Home projects checklist mutations immediately into the checkbox, completed count, and progress bar; a failed Dexie write rolls the projection back and reports the failure.
- [x] Saved activity checklists survive closing and reopening the user-scoped local database.
- [x] After saving an activity, the workspace immediately replaces its stale Activity snapshot with the repository result so reopening and Home navigation retain the saved checklist.

### Accessibility and UX

- [x] Every Must-do checkbox has an accessible label and keyboard/touch operation.
- [x] Progress is communicated textually, not only by color.
- [x] English UI uses “Must-do(s)” and Spanish UI uses “Imprescindible(s)” through the shared i18n architecture.
- [x] The Must-do editor has an accessible empty state and controls meeting existing touch/focus conventions.
- [x] Timeline cards visually distinguish ended, upcoming, and active activities in light and dark themes; upcoming cards retain full-opacity text with a subtle brand tint and a softly filled countdown badge.
- [x] The centered, unboxed Show more control appears above the timeline for hidden earlier activities and below it for hidden later activities; Show less exposes its expanded state and controlled timeline region.

### Verification

- [x] Domain/repository and mapper tests cover defaults, validation, round-trip persistence, and completion updates.
- [x] Component tests cover localized editor terminology, description/attendee visibility, empty/populated Home states, and feed-aware Home mutations including deletion.
- [x] Typecheck, lint, relevant tests, and production build pass.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Must-do toggle persistence | 0 | 100% of tested toggles survive refresh | Repository/component tests | QA |
| Structure mutation scope | Not available | No structure controls outside trip page | Component/accessibility tests | QA |
| Offline completion | Not available | Works without network | Dexie/outbox tests | QA |
| Feed broadcast on Must-do mutations | Not available | Specific checklist verbs in Recent activity | Feed builder + repository tests | QA |

## Risks and Open Questions

- **Risk:** Activity-level last-write-wins can merge a checklist toggle against another activity edit only at activity granularity; reuse existing conflict handling and keep item IDs stable.
- **Question:** None blocking the initial implementation; per-item assignees are deferred.

## Completion Notes

- **Verification commands:** focused checklist/HUD/feed/repository/cloud-sync Vitest run, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`
- **Verification results:** Coverage includes immediate replacement of stale post-save Activity snapshots, always-visible description/attendees, empty detail states without Must-do UI, populated Home complete/reopen/archive/restore/delete controls without add actions, localized terminology, immediate Home count/progress projection with failure rollback, database close/reopen persistence, parent Activity/outbox persistence, specific local feed entries, and collaborator feed reconstruction from synchronized checklist diffs.
- **Bug-ledger updates:** Home checklist persistence feedback invariant recorded in [`bug-ledger.md`](./bug-ledger.md).
- **Deployment:** Additive checklist migrations 58–60 were deployed to the linked Supabase project and local/remote migration parity was verified on 2026-09-23.
- **Follow-up work:** Per-item assignees/reminders may require a separate specification.
- **Schema note:** Domain field is `completed` (camelCase JSONB), accepting `is_completed` / `isCompleted` on ingest for compatibility.
