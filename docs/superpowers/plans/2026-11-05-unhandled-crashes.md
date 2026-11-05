# Unhandled Crash Handling Implementation Plan

> **For agentic workers:** Execute inline in this session after plan approval. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent malformed itinerary drag payloads and rejected UI promises from escaping their user-facing boundaries.

**Architecture:** Validate external drag data before invoking feature callbacks. At asynchronous UI boundaries, catch failures locally and route them to existing alert, message, toast, or safe-fallback UI. Do not add a global rejection suppressor or change domain persistence contracts.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, existing Viatik i18n and local-first repositories.

**Spec:** `.ai/specs/bug-unhandled-crashes.md`

## Global Constraints

- Preserve Dexie as the domain source of truth; no direct UI Supabase domain access.
- Do not change successful outcomes, offline behavior, or authorization.
- Keep existing guarded parsers and async callees that already handle their own errors unchanged.
- Reuse current localized UI error states; add EN/ES keys only if no appropriate key exists.
- Do not report a failed operation as successful; preserve pending-state cleanup with `finally`.

## Review Focus

- Malformed drag data: invalid JSON and wrong-shape JSON both result in no callback.
- Authentication transport rejection: remain on the form and announce a localized failure.
- Native listener registration/cleanup rejection: no unhandled rejection; keep the widget usable.
- Local database read/write rejection: show the existing error state or built-in conversion fallback.
- Stale async effects: a completion after unmount does not update component state.

---

### Task 1: Validate itinerary drag payloads

**Files:**
- Modify: `features/community/components/add-suggestion-dialog.tsx`
- Add: `features/community/lib/activity-drag-payload.ts`
- Add: `features/community/lib/activity-drag-payload.test.ts`

**Interface:** `parseActivityDragPayload(raw: string): string | null` returns an ID only when JSON decodes to an object with a non-empty string `activityId`; malformed or wrongly shaped payloads return `null`.

- [x] Write tests asserting malformed JSON, a missing ID, and a non-string ID return `null`, while a valid ID is returned.
- [x] Run the focused test and confirm it fails for the wrong-shape fixture.
- [x] Parse as `unknown` inside `try/catch`, validate the required field, and return without invoking the callback on invalid data.
- [x] Run the focused test and the relevant community component tests.

### Task 2: Handle authentication and account action rejections

**Files:**
- Modify: `app/(auth)/login/login-form.tsx`
- Modify: `app/(auth)/forgot-password/forgot-password-form.tsx`
- Modify: `app/(auth)/reset-password/reset-password-form.tsx`
- Modify: `app/(auth)/onboarding/onboarding-form.tsx`
- Modify: `app/(app)/settings/settings-client.tsx`
- Modify: `components/app-shell/app-shell.tsx`
- Modify: `components/auth/recovery-link-catcher.tsx`
- Test: `app/(auth)/login/login-form.test.tsx`
- Test: `app/(auth)/forgot-password/forgot-password-form.test.tsx`
- Test: `app/(auth)/reset-password/reset-password-form.test.tsx`
- Test: `app/(auth)/onboarding/onboarding-form.test.tsx`
- Test: `app/(app)/settings/settings-client.test.tsx`
- Test: `components/app-shell/app-shell.test.tsx`
- Add: `components/auth/recovery-link-catcher.test.tsx`

**Interface:** Rejected auth operations use each form's existing message/error mechanism. Recovery-link failures route to the invalid/expired-link fallback. App-shell logout failures use the shared toast; if remote logout succeeds but local database cleanup fails, route to login with a localized alert so the signed-out app shell is not left visible.

- [x] Add rejected-promise tests for password/register, email-code request/verification, development login, password reset, onboarding, profile save, logout cleanup, and recovery-link completion.
- [x] Run the named tests and confirm rejection cases expose the expected failure state rather than leaking a rejection.
- [x] Add local `try/catch` handling and preserve each existing success, redirect, and pending behavior.
- [x] Run the full named test group and the EN/ES i18n audit.

### Task 3: Handle local data and native integration failures

**Files:**
- Modify: `app/(app)/settings/settings-client.tsx`
- Modify: `features/vault/components/vault-panel.tsx`
- Modify: `features/steps/components/trip-steps-widget.tsx`
- Modify: `features/finance/components/currency-converter.tsx`
- Modify: `features/finance/components/currency-converter.test.tsx`
- Modify: `features/steps/components/trip-steps-widget.test.tsx`
- Add: `features/vault/components/vault-panel.test.tsx`

**Interface:** Settings and Vault use their existing alert/error state. Currency conversion falls back to the built-in offline rate for cache-read failures and reports failed manual saves. Native listener setup and teardown failures are contained; they do not prevent local steps from rendering.

- [x] Add rejected-promise tests for QR retrieval, vault keyset retrieval, currency-rate reads/saves, and native listener registration/cleanup.
- [x] Run the focused tests and confirm they fail on the current uncaught paths.
- [x] Add narrow catches and state updates/fallbacks without changing persistence or sync behavior.
- [x] Run focused tests and relevant Vault/Steps/Finance suites.

### Task 4: Handle trip and journal action failures

**Files:**
- Modify: `features/trips/components/home/home-page.tsx`
- Modify: `features/trips/components/home/live-timeline-hud.tsx`
- Modify: `features/journal/components/travel-journal-view.tsx`
- Modify: `features/trips/components/home/home-page.test.tsx`
- Add: `features/journal/components/travel-journal-view.test.tsx`
- Add: `features/trips/components/home/live-timeline-hud.test.tsx`

**Interface:** Trip lifecycle mutations report failure through the existing toast pattern. Weather refresh rejection stops loading and shows an existing localized unavailable-weather toast. Journal save rejection retains the unsaved state and announces an alert.

- [x] Add rejected-promise tests for trip start/cancel, weather refresh, and journal save.
- [x] Run the focused tests and confirm failures expose the uncaught or falsely-successful paths.
- [x] Add catches while retaining `finally` cleanup and the current offline behavior.
- [x] Run the focused tests and affected trip/journal suites.

### Task 5: Handle packing-list persistence failures

**Files:**
- Modify: `features/packing/components/packing-list-view.tsx`
- Modify: `features/packing/components/packing-list-view.test.tsx`

**Interface:** Auto-seeding and packing mutations report failures through the existing `actionError` alert; successful local behavior is unchanged.

- [x] Add rejected-promise tests for auto-seeding and a user mutation.
- [x] Run the focused tests and confirm each failure path is exposed instead of rejected.
- [x] Catch failures for auto-seeding, toggle/remove/quantity/category-pack, and add operations, preserving the existing pending cleanup.
- [x] Run the PackingListView suite.

### Task 6: Handle collaborator and invitation failures

**Files:**
- Modify: `features/collaboration/components/people-panel.tsx`
- Modify: `features/collaboration/components/people-panel.test.tsx`
- Modify: `features/collaboration/member-panel.tsx`
- Add: `features/collaboration/member-panel.test.tsx`
- Modify: `features/trips/components/trip-dashboard.tsx`
- Modify: `features/trips/components/__tests__/trip-dashboard.test.tsx`

**Interface:** Existing localized message/error UI reports failed traveler removal, member role/removal, invitation revoke/decline actions.

- [x] Add rejection tests for the existing direct repository actions.
- [x] Run the focused tests and confirm the rejection behavior is observable.
- [x] Add narrow handlers that update the existing error UI without changing authorization or successful operations.
- [x] Run PeoplePanel, MemberPanel, and TripDashboard tests.

### Task 7: Handle media retry failures

**Files:**
- Modify: `features/activities/components/activity-attachments.tsx`
- Modify: `features/activities/components/__tests__/activity-attachments.test.tsx`
- Modify: `features/trips/components/home/voice-note-card.tsx`
- Add: `features/trips/components/home/voice-note-card.test.tsx`

**Interface:** Failed upload retries remain visibly failed and announce an error; successful retries continue to request sync as before.

- [x] Add rejected-retry tests for image and voice-note uploads.
- [x] Run the focused tests and confirm retry failures do not escape the UI.
- [x] Catch retry rejections and show accessible localized failure feedback.
- [x] Run the ActivityAttachments and VoiceNoteCard suites.

### Task 8: Handle TripWorkspace lookup and remaining async boundaries

**Files:**
- Modify: `features/trips/components/trip-workspace.tsx`
- Add: `features/trips/components/trip-workspace.test.tsx`

**Interface:** Failed personal-budget lookup leaves the optional budget at its safe empty state and reports the error using the existing workspace alert.

- [x] Add a rejected-lookup test at the smallest stable public workspace seam.
- [x] Run it red against the current unhandled `.then()`.
- [x] Catch the rejection, guard against stale/unmounted updates, and keep the workspace usable.
- [x] Run the focused workspace suite.

### Task 9: Handle traveler and travel-document removal failures

**Files:**
- Modify: `features/contacts/components/traveler-panel.tsx`
- Modify: `features/contacts/components/traveler-panel.test.tsx`
- Modify: `features/health/components/document-tracker-view.tsx`
- Add: `features/health/components/document-tracker-view.test.tsx`

**Interface:** Failed local removals remain visible in the existing traveler message or a localized travel-document alert; the local record is never presented as removed on rejection.

- [x] Add rejected-promise tests for traveler and travel-document removal.
- [x] Run the focused tests and confirm the current rejected calls fail the regression cases.
- [x] Catch removal errors and surface localized accessible feedback.
- [x] Run the focused Contacts and Health component suites.

### Task 10: Verify and record

**Files:**
- Modify: `.ai/specs/bug-unhandled-crashes.md`
- Modify: `.ai/specs/bug-ledger.md`
- Modify: `memory/MEMORY.md`
- Modify: `memory/components-ui.md`

- [x] Run affected tests, `pnpm lint`, `pnpm typecheck`, and `pnpm agent:audit-i18n`. Typecheck is blocked by the pre-existing `app/layout.tsx:25:50` `LayoutProps` error.
- [x] Review every confirmed audit item and confirm each either has an explicit rejection/parse fallback or is handled by its existing caller.
- [x] Record final verification evidence, the bug-ledger invariant decision, and the dated memory entry.
