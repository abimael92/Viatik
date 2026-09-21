# Bug Report: Trip Feed used a fallback avatar for the signed-in user

**Project:** Viatik  
**Reporter:** User  
**Status:** Resolved  
**Date reported:** 2026-09-21  
**Priority:** P2  
**Related feature/spec:** Trip Feed

## Observed Problem

The Trip Feed rendered a deterministic DiceBear avatar based on the activity actor ID instead of the avatar configured in the signed-in user's settings.

## Expected Behavior

A feed item created by the signed-in user must render that user's current local profile avatar URL or seed. Collaborator items continue to use authorized public profile data, with a deterministic fallback only when unavailable.

## Investigation

### Root Cause

The feed hooks watched the profile repository directly, but the local profile mirror is seeded and refreshed through `useLocalProfile`. On pages that did not otherwise use that hook, the feed had no current-user profile and `FeedRow` fell back to the actor ID.

### Security Assessment

No security impact. The fix continues to read the signed-in user's profile through the local Dexie repository and does not add direct UI queries to remote domain tables.

## Fix Plan

1. Add a regression test for a signed-in user's configured avatar in Trip Feed.
2. Use `useLocalProfile` in both shared-trip and aggregated feed hooks.
3. Verify targeted tests, lint, typecheck, build, and whitespace checks.

## Acceptance Criteria for Resolution

- [x] The original reproduction is covered by a regression test.
- [x] The signed-in user's configured avatar is rendered in Trip Feed.
- [x] Existing tests, lint, typecheck, and build pass.

## Resolution

- **Resolved behavior:** Both shared-trip and aggregated feed hooks now merge the signed-in user's live local profile into actor identity data, so configured avatar URLs/seeds take precedence over actor-ID fallbacks.
- **Verification evidence:** `pnpm exec vitest run features/feed/components/shared-trip-feed.test.tsx features/feed/lib/feed-builder.test.ts features/feed/data/dexie-feed-repository.test.ts`; `pnpm lint`; `pnpm typecheck`; `pnpm build` — all passed.
- **Bug ledger entry:** Added 2026-09-21 entry.
- **Follow-up:** None.
