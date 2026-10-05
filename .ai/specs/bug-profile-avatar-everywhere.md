# Bug Report: Configured profile avatar is not shown consistently across the app

**Project:** Viatik  
**Status:** Ready for QA  
**Date reported:** 2026-10-05  
**Priority:** P2  
**Related feature/spec:** [`bug-feed-avatar-cache.md`](./bug-feed-avatar-cache.md)

## Observed Problem

After changing the avatar in Settings, several surfaces keep showing the previous photo (or initials) instead of the avatar the user configured. The earlier fix only refreshed Recent activity.

## Expected Behavior

Every surface that renders the signed-in user (sidebar profile card, Settings, Travelers tab, activities, votes, expenses, settlements, feeds) and every collaborator view of that user shows the latest configured avatar photo or seed.

## Impact

- **Users affected:** Users who upload or replace a profile photo.
- **Severity:** Low (cosmetic identity mismatch).
- **Data/security impact:** None. No new data is exposed.
- **Workaround:** Hard refresh after browser/CDN cache expiry.

## How to Reproduce

1. Upload a profile photo in Settings and save.
2. Replace it with a different photo of the same file type and save.
3. Open the sidebar, Settings view, a trip's Travelers tab, or an activity card and observe the old photo.

**Reproducibility:** Consistent while the browser caches the old image.  
**Minimal reproduction/test:** `app/actions/auth.test.ts`, `features/collaboration/components/people-panel.test.tsx`

## Investigation

### Root Cause

Profile photos are always uploaded to the same storage path (`<userId>/avatar.<ext>`) and the stored `avatar_url` is the bare public URL. Replacing the photo therefore leaves `avatar_url` byte-for-byte unchanged, so every `<img>` keeps the browser-cached image. The previous fix added a cache key only inside the Recent activity feed.

### Contributing Factors

- The Travelers tab rendered the signed-in user's own row from the remote public-profile RPC instead of the local profile mirror, so it showed initials offline and diverged from other surfaces.
- Linked traveler rows used the contact's own `avatarUrl` instead of the linked profile's `linkedAvatarUrl`, unlike the Contacts screens.

### Security Assessment

The version suffix is a timestamp query parameter on an already-public storage URL. No RLS, storage policy, or RPC changes.

## Fix Plan

1. Regression tests: uploaded photo URLs carry a per-upload version; the Travelers tab uses the local profile for the signed-in user and `linkedAvatarUrl` for linked travelers.
2. Append `?v=<upload timestamp>` to the public URL whenever a profile photo is uploaded (registration, onboarding, Settings).
3. Use `useLocalProfile` for the signed-in user's row in the Travelers tab; prefer `linkedAvatarUrl` for linked travelers.

## Acceptance Criteria for Resolution

- [x] Each profile photo upload persists a distinct `avatar_url`.
- [x] The Travelers tab renders the signed-in user's local avatar.
- [x] Linked travelers render the linked profile photo when available.
- [x] Seed avatars and collaborator avatars otherwise keep existing behavior.
- [x] Bug-ledger invariant recorded.

## Resolution

- **Resolved behavior:** Uploaded photos get a versioned URL, so all surfaces reading `avatar_url` refresh after a replacement. The Travelers tab follows the local profile for the signed-in user.
- **Fix commit/PR:** Pending
- **Bug ledger entry:** 2026-10-05 row in `.ai/specs/bug-ledger.md`
- **Follow-up:** Users who uploaded a photo before this fix should re-save it once to get a versioned URL. Migration 72 must be applied to the remote database.

## Addendum: linked contacts and activity participants

- **Linked contacts:** connection snapshots were frozen at link time, so a counterpart's avatar change never reached the other user's local contact. Migration `00000000000072_refresh_connection_avatar_snapshots.sql` adds an `after update of avatar_url, avatar_seed` trigger on `profiles` that merges only `avatar_url`/`avatar_seed` into that profile's requester/recipient snapshots, plus a one-time backfill of stale snapshots. The existing lifecycle trigger bumps `version`/`updated_at`, so pull and realtime deliver the update; the client merge already overwrites avatar fields while preserving the private relationship label.
- **Security assessment:** the function is `security definer` (connections RLS forbids requester-side updates) with a pinned `search_path`, `EXECUTE` revoked from `public`, fires only from the `profiles` trigger for the row's own id, and writes only public avatar keys; snapshot private-field CHECK constraints remain in force. Residual risk: a connection CAS write racing an avatar change may record a remote-wins conflict.
- **Activity participants:** Add Activity traveler chips rendered a DiceBear avatar seeded from the traveler id. They now use the traveler's contact avatar (`linkedAvatarUrl` → `avatarUrl` → `avatarSeed`), falling back to initials when none is configured.
- **Tests:** `supabase/connection-avatar-refresh.test.ts`; `features/activities/components/__tests__/activity-form.test.tsx`.

## Addendum: "did not work" follow-up

- **Finding:** no profile in the linked Supabase project has `avatar_url` or `avatar_seed` set, and no profile row was updated after 2026-09-27. The signed-in user's "T" in Recent activity was the correct no-avatar fallback; the collaborator's cartoon was an avatar generated from their user id, not a configured one.
- **Save path verified:** all migrations through 71 are applied; `profiles` insert/update RLS and triggers are correct; the stored phone, birth date, and name pass Settings validation; the exact upsert Settings sends succeeded as the user under RLS inside a rolled-back block (confirmed not persisted).
- **Change:** removed id-generated avatars. People without a configured avatar now show initials of their display name everywhere (feed, Add Activity travelers, legacy member panel), so a cartoon always means a chosen avatar.
- **User action:** set an avatar in Settings and save; report any error shown.
