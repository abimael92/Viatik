# Bug Report: Settings avatar save can leave Recent activity without a profile avatar

**Project:** Viatik  
**Status:** Ready for QA  
**Date reported:** 2026-10-05  
**Priority:** P2  
**Related feature/spec:** Profile avatar rendering in activity feeds

## Observed Problem

The signed-in user's configured avatar is not reliably refreshed in Recent activity after the user changes their avatar.

## Expected Behavior

Recent activity displays the signed-in user's latest locally cached avatar URL or seed. Replacing a photo at the same storage URL must not keep the previous image visible from browser cache.

## Impact

- **Users affected:** Users who replace their uploaded profile photo and then view Recent activity.
- **Severity:** Low
- **Data/security impact:** None known; profile data remains private and the avatar is already shown only where authorized.
- **Workaround:** Reloading after the browser's cached image expires may show the new photo.

## How to Reproduce

1. Set an uploaded profile photo in Settings.
2. Perform an activity that appears in the trip's Recent activity feed.
3. Replace the profile photo with another image of the same file type.
4. Reopen or refresh the Recent activity feed and observe that the old image may remain visible.

**Reproducibility:** Intermittent (depends on browser/CDN cache)  
**Minimal reproduction/test:** `features/feed/components/shared-trip-feed.test.tsx`

## Environment Details

- **Application version/commit:** Working tree under investigation
- **Browser/device:** Browser image cache behavior
- **Operating system:** Not applicable
- **Network state:** Online
- **User role/account state:** Signed-in profile owner
- **Database/API version:** No schema change
- **Feature flags/configuration:** None
- **Logs/traces/screenshots:** None

## Investigation

### Root Cause

The Settings action updated `profiles` by id but treated a zero-row update as success because it did not request or check a returned row. For a missing/non-matching profile row, Settings closed as though it had saved while `getMyProfile` still returned no avatar, so Recent activity fell back to initials. A linked profile row observed during investigation also had both avatar fields null. Uploaded images use a stable Storage path, so Recent activity additionally needs the local profile revision in its image URL to avoid stale browser cache after a successful replacement.

### Contributing Factors

- Existing feed tests checked avatar identity but not cache invalidation when an image changes at the same URL.

### Security Assessment

The profile upsert uses the authenticated user's id and existing self-only insert/update RLS policies; it does not use service-role access. The feed cache revision is the existing local profile `updatedAt` and adds no private profile data.

## Fix Plan

1. Add regression tests that Settings forwards the chosen seed and the profile action does not claim success without a persisted row.
2. Upsert the signed-in profile row and verify the server returns the saved row before reporting success.
3. Append the local profile's `updatedAt` as a cache-busting query value only for the current user's photo avatar.
4. Preserve collaborator avatar URLs and seed-based avatars unchanged; run focused tests, lint, typecheck, and build.

## Acceptance Criteria for Resolution

- [ ] Settings persists the signed-in user's selected avatar to their profile row and reports failure if no row is saved.
- [ ] The signed-in user's photo avatar in Recent activity is keyed by the local profile revision.
- [ ] Changing `updatedAt` changes the rendered photo URL when the stored avatar URL is unchanged.
- [ ] Collaborator avatars and seed-only avatars retain existing behavior.
- [ ] Relevant tests, lint, typecheck, and build pass.
- [ ] The bug-ledger invariant is recorded.

## Resolution

- **Resolved behavior:** Settings upserts the signed-in user's own profile and only reports success after the row is returned. Recent activity uses the local avatar revision to refresh replaced photos at stable storage URLs; collaborators and seed avatars are unchanged.
- **Fix commit/PR:** Pending
- **Verification evidence:** `pnpm exec vitest run app/actions/auth.test.ts 'app/(app)/settings/settings-client.test.tsx' features/feed/components/shared-trip-feed.test.tsx` passed (25 tests); `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.
- **Bug ledger entry:** 2026-10-05 row in `.ai/specs/bug-ledger.md`
- **Follow-up:** Save the selected avatar again in the updated app so the signed-in profile row is populated.
