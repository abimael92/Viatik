# Feature Specification: Activity Progress Checklists

**Project:** Viatik  
**Owner:** Viatik Product  
**Status:** Complete  
**Created:** 2026-09-23  
**Updated:** 2026-09-23  
**Related work:** Activity create/edit/proposal flow and home live itinerary

## What & Why

Activities may contain an ordered checklist of concrete actions travelers need to complete. Structure is planned on the trip itinerary form. On Home during an active trip, travelers only check items off or soft-skip ones they can’t do—quick on-the-go actions, not full editing. Home timeline cards emphasize time-to-active status and checklist progress; completing or archiving a task also broadcasts to the shared Recent activity feed.

## Users and scenarios

- **Primary user:** A trip member using Home during an active trip.
- **Scenario 1:** Trip editors add/rename/reorder/delete checklist items on the itinerary activity form.
- **Scenario 2:** From Home, a member marks items complete or soft-skips (archives) items they can’t do; changes save locally immediately and emit a feed entry (e.g. completed “Sacar efectivo” on “compras”).
- **Scenario 3:** Skipped items can be restored from a collapsed “Archived” section on Home (with a restore feed entry).
- **Offline or degraded-network behavior:** Checklist reads and progress mutations work from Dexie without network access and survive refresh.

## In Scope

- Embedded checklist on Activity with stable IDs, titles, `completed`, and `archived`.
- Full structure editing on the trip-page activity form.
- Home timeline cards: Active badge / “Starts in …” countdown, compact progress (“X/Y tasks completed”); no weather on cards or detail sheet.
- Home timeline empty detail sheet shows the activity description only (no empty checklist CTA).
- Home quick actions: checkbox done + soft archive/restore; feed-aware `updateChecklist` path.
- Local-first persistence via activity outbox and Supabase JSONB.

## Out of Scope

- Adding/renaming/reordering checklist items from Home.
- Hard-deleting items from Home.
- Weather prompts or widgets on the Home timeline activity card/modal.
- Assignees, due dates, reminders.

## Constraints and Design

- **Architecture boundaries:** Home timeline owns day-of checklist interaction; activity form remains available for planning; activity repository owns durable local writes; Supabase mappers/sync migrations carry the serialized activity field.
- **Data ownership:** Dexie is the local source of truth. Completion/archive with feed broadcast uses `activityRepository.updateChecklist`; silent uncheck uses `activityRepository.update`. Supabase is only the synchronization/authorization target.
- **Security requirements:** Trip members may update the activity `checklist` field (structure and completion). Other activity fields remain editor-gated. Checklist titles are trimmed, length-limited, and rendered as text.
- **Compatibility:** Next.js 16 App Router, React 19, TypeScript strict, existing Dexie and Supabase sync paths.
- **SOLID/design decisions:** Keep checklist value objects inside the Activity contract rather than introducing a second table; reuse the activity update/outbox path so updates remain atomic with activity metadata; checklist feed verbs are distinct from generic `updated_activity`.
- **Migration/rollback plan:** Additive JSONB column plus member checklist manage policy. Legacy rows map to an empty checklist.
- **Observability:** Do not log checklist text or completion contents; existing activity mutation logs may identify only the activity ID and feed verb.

## Acceptance Criteria

### Functional

- [x] New activities and proposals can include zero or more ordered checklist items.
- [x] Home live timeline cards show Active / countdown and checklist progress; detail sheet lists sub-tasks with check + archive (no weather).
- [x] Completing or archiving a sub-task updates Dexie via outbox and inserts a shared feed item with a specific verb.
- [x] Trip-page form can still edit checklist structure while planning.
- [x] Legacy activities without checklist data render with an empty editable checklist (add first task).

### Authorization and security

- [x] Trip members may update checklist content; other activity fields remain editor-gated server-side.
- [x] Checklist input is trimmed, bounded, and safely rendered as text.
- [x] No secrets or sensitive data are logged or exposed.

### Reliability and offline behavior

- [x] Checklist changes use the existing activity transaction and outbox mutation path.
- [x] Completion toggles work offline and replay through activity CAS synchronization.
- [x] Concurrent/stale activity updates follow existing version/base timestamp conflict behavior.

### Accessibility and UX

- [x] Every checklist checkbox has an accessible label and keyboard/touch operation.
- [x] Progress is communicated textually, not only by color.
- [x] The editor has an accessible empty state and controls meeting existing touch/focus conventions.

### Verification

- [x] Domain/repository and mapper tests cover defaults, validation, round-trip persistence, and completion updates.
- [x] Component tests cover editor add/edit/delete and home toggle + feed-aware HUD behavior.
- [x] Typecheck, lint, relevant tests, and production build pass.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Checklist toggle persistence | 0 | 100% of tested toggles survive refresh | Repository/component tests | QA |
| Structure mutation scope | Not available | No structure controls outside trip page | Component/accessibility tests | QA |
| Offline completion | Not available | Works without network | Dexie/outbox tests | QA |
| Feed broadcast on complete/archive | Not available | Specific checklist verbs in Recent activity | Feed builder + repository tests | QA |

## Risks and Open Questions

- **Risk:** Activity-level last-write-wins can merge a checklist toggle against another activity edit only at activity granularity; reuse existing conflict handling and keep item IDs stable.
- **Question:** None blocking the initial implementation; per-item assignees are deferred.

## Completion Notes

- **Verification commands:** `pnpm exec vitest run` (HUD/checklist/feed/repo), `pnpm typecheck`, `pnpm lint`
- **Verification results:** Domain normalize/toggle/progress, Dexie `updateChecklist` + checklist feed verbs, feed-builder summaries, ActivityChecklistQuickActions (check/archive/silent uncheck), and LiveTimelineHud execution UI (no weather, Active/countdown, progress, modal checklist) tests pass. Typecheck and lint clean.
- **Bug-ledger updates:** Not applicable.
- **Follow-up work:** Per-item assignees/reminders may require a separate specification.
- **Schema note:** Domain field is `completed` (camelCase JSONB), accepting `is_completed` / `isCompleted` on ingest for compatibility.
