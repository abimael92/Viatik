# Bug Report: Activity participant identities showed duplicate rows and Viatik IDs

**Project:** Viatik  
**Reporter:** User report  
**Status:** Resolved  
**Date reported:** 2026-09-20  
**Priority:** P1  
**Related feature/spec:** Add/edit activity participant selector

## Observed Problem

The participant selector in Add Activity could show the same person more than once, render a raw user/Viatik ID instead of the person's name, and omit the person's configured avatar.

## Expected Behavior

Each account appears once, using its public profile name and avatar when available. Linked traveler rows do not duplicate an account row. Offline or unavailable profile data uses a neutral label rather than exposing an internal ID.

## Investigation

The form rendered `member.userId` for every non-current member and received no collaborator profile summaries. It also rendered members and travelers as independent lists without suppressing a linked traveler whose display name matched an already-rendered member profile.

## Fix Plan

1. Add regression coverage for profile names/avatars, duplicate member rows, and linked traveler suppression.
2. Load collaborator public profiles through the existing collaboration repository boundary and pass them to the activity form.
3. Use neutral offline fallback labels and deduplicate participant display rows.
4. Update the bug ledger and run focused tests, lint, typecheck, and build.

## Acceptance Criteria for Resolution

- [x] No raw user or Viatik ID is displayed as the participant name.
- [x] Available collaborator profile names and avatars are shown.
- [x] Duplicate member/traveler rows are not rendered for the same displayed identity.
- [x] Missing profile data does not expose internal identifiers.
- [x] Regression tests and project verification pass.

## Resolution

- **Resolved behavior:** Activity participants now use available profile names and avatars, deduplicate repeated member identities, suppress matching linked traveler rows, and use a neutral fallback instead of exposing user IDs.
- **Fix commit/PR:** Pending
- **Verification evidence:** `pnpm exec vitest run features/activities/components/__tests__/activity-form.test.tsx`; `pnpm lint`; `pnpm typecheck`; `pnpm build`; `git diff --check` — all passed.
- **Bug ledger entry:** Added to `.ai/specs/bug-ledger.md`.
