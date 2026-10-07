# Feature Specification: Trip Photo Sharing

**Project:** Viatik  
**Owner:** Viatik Product  
**Status:** In Progress  
**Created:** 2026-10-07  
**Updated:** 2026-10-07  
**Related work:** [Activity Attachments](./activity-attachments.md), trip media sync (`features/media/`, `lib/sync/cloud-sync.ts`)

## What & Why

### What

Let travelers keep selected trip photos on their own device until they explicitly share them with the trip. Once shared and synchronized, all current trip members can view and download them. Members can download an individual photo or a bulk selection of shared photos.

Existing photos already in a trip gallery are considered shared and remain visible; this feature changes the flow for new contributions without hiding existing content.

### Why

Travelers may want to contribute only some of their trip pictures. Explicit sharing gives them control over which photos reach the shared trip gallery, while making the selected photos accessible to the rest of the group.

### Product decisions

| # | Decision |
|---|---|
| D1 | Sharing is explicit. A new photo stays local to the contributor's device until they choose to share it with the trip. |
| D2 | Any current trip member, including a viewer, may contribute a photo for the group. |
| D3 | Shared photos support both individual and bulk downloads. |
| D4 | Existing shared trip photos remain shared and visible. |
| D5 | Photos are staged in a device-local collection; the member can choose which staged photos to share later. |
| D6 | Only the member who shared a photo may unshare or delete it. |
| D7 | Bulk download triggers separate per-photo downloads, with a maximum of 25 photos or 250 MB per action (whichever limit is reached first). |
| D8 | Bulk download continues after an individual failure, reports failed items, and allows retry per item. |
| D9 | Unsharing removes the shared copy and returns the contributor's local copy to device-local staging. Drafts for a trip are purged when local trip access is removed. |
| D10 | Newly shared trip photos are visible only to authenticated current trip members; public trip-share links must not expose them, even when the legacy gallery option is enabled. Existing public-gallery behavior for legacy photos remains unchanged. |

### Users and scenarios

- **Primary user:** A trip member (owner, editor, or viewer) using the trip Photos area.
- **Scenario 1 (selective sharing):** Given a member has chosen photos, when they keep a photo unshared, it remains available only on that device; when they explicitly share it, it uploads and becomes visible to other current trip members after synchronization.
- **Scenario 2 (view and download):** Given a member opens the shared trip gallery, they can view a shared photo and download it individually or as part of a bulk selection.
- **Offline or degraded-network behavior:** Local photo selection and preview work offline. A share action is saved locally and queued for synchronization; other members cannot see the photo until its content and metadata have synchronized. Already downloaded local copies remain available offline. Downloads of uncached remote photos require connectivity.

## In Scope

- A clear distinction between device-local, not-yet-shared photos and photos shared with the trip.
- An explicit user action to share selected photos with the trip.
- Local-first staging and synchronization of shared photos using the established media repository and sync boundaries.
- View access and photo contribution for all current trip-member roles.
- Individual and bulk download of shared photos.
- Visible progress, empty, offline, failure, and retry states for sharing and downloading.
- Server-enforced membership authorization for photo metadata and binary access.

## Out of Scope

- A public or link-accessible photo album for newly shared member-only photos. Existing trip-share links continue to expose only legacy/public-gallery photos according to their current settings.
- Automatically sharing every newly selected photo.
- Video, comments, reactions, editing tools, or automatic face/location tagging.
- Automatic downloading or offline-pack creation for every shared photo.
- Revoking copies already downloaded to a member's device.

## Constraints and Design

- **Architecture boundaries:** The UI uses domain repositories and application services. It must not query or write Supabase domain tables directly. Local optimistic changes go through Dexie and the transactional outbox.
- **Data ownership:** Device-local drafts live in a separate Dexie `stagedTripMedia` table that the shared-media upload worker and remote sync never scan. Explicit sharing atomically transfers a draft into `tripMedia`, where the existing upload pipeline handles it. A successful download caches the Blob in `tripMedia`; remote merges preserve locally cached Blobs. `TripMedia.publicGallery` marks only legacy photos as eligible for configured guest-gallery links; new photo shares are member-only.
- **Security requirements:** Current trip members may read and contribute shared photos, including viewers. Server-side RLS and Storage policies authorize contributions and restrict photo unshare/delete to the contributor. Media and Storage authorization requires an active membership (no `removed_at` or `deleted_at`) and a non-deleted trip. Public share-link snapshots include only explicitly legacy-public photos, never new member-only shares, even when gallery sharing is enabled. Previously issued signed URLs remain usable until their expiry (currently up to one hour), and already-downloaded local copies cannot be revoked. Signed URLs must not be logged or treated as durable credentials.
- **Compatibility:** Existing trip photos remain shared and render as before. Legacy photos retain their current guest-gallery behavior when that option is enabled; new photos from any upload path are member-only. Local-only drafts are not exposed to collaborators or uploaded before a share action. Unsharing deletes the remote shared object and returns the contributor's local Blob to the device-only staging collection. Staged drafts for a trip are purged when local trip access is removed.
- **Migration/rollback plan:** Dexie v46 adds `publicGallery`: already-uploaded legacy photos backfill to `true`, pending/failed local photos to `false`, and audio to `false`; v45 `stagedTripMedia` is preserved. Additive Supabase migration 82 adds nullable `trip_media.public_gallery` with a private `false` default, backfills preexisting photos to `true` and audio to `false`, and guards inserts/updates so new photos cannot become public. Only an existing legacy `true` may transition to private when a tombstone is restored; ordinary updates keep its legacy visibility, including updates from old clients that omit the field. The migration also tightens transcript reads to active media members and prevents repeat invitation acceptance from demoting active roles or owners; reactivated soft-removed memberships take the invitation role and have removal/tombstone fields cleared.
- **Downloads:** A sync-layer media service resolves/fetches authorized remote content and stores downloaded Blobs locally. Bulk download triggers sequential per-photo browser downloads, capped at 25 photos or 250 MB per action. It continues after individual failures and reports the failed items for retry. No archive dependency is added.
- **Observability:** Track only non-sensitive operation status and stable IDs as needed. Do not log image content, signed URLs, or private photo metadata.

The Architect Agent reviewed the member-only guest-link isolation design: legacy public-gallery photos remain eligible only when explicitly marked, while every newly created photo is member-only by default. The follow-up migration and filter must cover all new photo constructors and guest snapshot signing.

## Acceptance Criteria

### Functional

- [ ] A member can stage, preview, and revisit selected photos in a device-local collection without sharing them.
- [ ] An unshared photo is not uploaded or visible to any other trip member.
- [ ] A member can explicitly share one or more staged photos with the trip.
- [ ] Only the member who shared a photo can unshare or delete it; attempts by other members are rejected.
- [ ] Unsharing removes the remote shared copy and returns the contributor's local Blob to device-only staging.
- [ ] A successful share becomes visible in the shared gallery to every current trip member after synchronization.
- [ ] Existing trip photos remain visible as shared photos.
- [ ] Any current trip member can view and download an individual shared photo.
- [ ] A member can select and download multiple or all shared photos in a bulk action, with a maximum of 25 photos or 250 MB per action, whichever comes first.
- [ ] Bulk download continues when one file fails, reports failed items, and supports retrying them individually.
- [ ] Sharing and downloads expose accessible progress and actionable failure/retry states; no silent data loss occurs.

### Authorization and security

- [ ] Owner, editor, and viewer members can contribute shared photos; server-side policies reject non-members and removed members.
- [ ] Only the contributor can unshare or delete a shared photo; crafted requests from other members are rejected server-side.
- [ ] Only authorized current members can read photo metadata and retrieve photo content; direct requests that bypass the UI are denied.
- [ ] Newly shared member-only photos are excluded from unauthenticated trip-share-link snapshots, even when legacy gallery sharing is enabled.
- [ ] Client-only sharing or role checks are not treated as the authorization boundary.
- [ ] Unshared local photos, signed URLs, and image contents are not included in logs or remote payloads before sharing.

### Reliability and offline behavior

- [ ] Local staging and preview work without network access and survive app refresh/reopen on the originating device.
- [ ] Staged drafts for a trip are purged when local trip access is removed.
- [ ] An offline share action is durable in Dexie and retried through the established synchronization pipeline.
- [ ] Other members see a photo only after its content and metadata are available remotely.
- [ ] Failed or interrupted uploads/downloads can be retried without creating duplicate shared photos or corrupting local drafts.
- [ ] Previously downloaded shared photos remain usable offline; uncached photos provide a clear offline state.

### Accessibility and UX

- [ ] Sharing and download actions work with keyboard and touch and have screen-reader labels/status announcements.
- [ ] Selection, progress, errors, and completion states are perceivable without relying on color alone.
- [ ] Gallery and bulk-selection behavior is usable at supported mobile and desktop viewports.

### Verification

- [ ] Unit, repository, sync, and component tests cover local-only, explicit sharing, all-member permissions, and individual/bulk download behavior.
- [x] Local PostgreSQL RLS tests verify viewer/editor contribution, active-member reads, removed/deleted/nonmember/anonymous denial, contributor-only changes, and invitation reactivation. CI/staging rerun remains a release condition.
- [ ] Offline, retry, interruption, and duplicate-delivery cases are tested end-to-end.
- [x] Coverage exception documented: the repository has no installed Vitest coverage provider, so a percentage could not be measured; changed behavior has focused regression tests.
- [x] Typecheck, lint, relevant tests, and production build pass.
- [x] QA Agent report and Security Agent review are recorded in Completion Notes.

## Implementation Plan

1. Add failing tests for local-only photo staging, explicit sharing, member-only guest-link filtering, and trip-member authorization.
2. Add Dexie v45 staging storage and v46 visibility metadata, with repository commands for stage, share, unshare, and draft cleanup.
3. Add additive Supabase migrations for member-only visibility, active-media authorization, metadata validation, and contributor-owned photo removal.
4. Filter public share-link gallery snapshots to explicitly legacy-public photos before signing URLs.
5. Implement authorized media download/cache services and preserve blobs during remote merge.
6. Implement accessible staged/shared gallery flows, single downloads, and bounded sequential bulk downloads.
7. Verify compatibility, offline/retry behavior, role-based authorization, and download edge cases.
8. Complete QA and security reviews, then update this spec with evidence.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Shared-photo upload completion | TBD | TBD | Aggregate share operations that complete successfully; no photo content logged | Product |
| Individual/bulk download completion | TBD | TBD | Aggregate successful versus failed download operations | Product |
| Unauthorized remote photo access | TBD | 0 accepted unauthorized requests | Server-side authorization tests and security review | Engineering |

## Risks and Open Questions

- **Risk:** Changing contribution permissions from editor-only to all members expands upload exposure. Mitigate with server-enforced membership checks, file/type/size validation, and tests for removed/non-member identities.
- **Risk:** Browsers may throttle sequential multi-file downloads. Show per-photo progress and failures, continue remaining items, and allow retry of failed items.
- **Risk:** Existing signed URLs remain valid until expiry (currently up to one hour), and downloaded local copies cannot be revoked. New remote requests must still enforce current membership.

## Completion Notes

- **Architecture review:** Completed. Product decisions include member-only public-link isolation, local staging, contributor-only unshare, sequential bulk downloads, caps, and draft cleanup.
- **Verification commands:** `pnpm test`; `pnpm lint`; `pnpm typecheck`; `pnpm build`; `pnpm exec vitest run supabase/trip-photo-sharing.test.ts`; `pnpm exec supabase migration up --local`; `docker exec -i supabase_db_viatik psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/trip-media-authorization.test.sql`; `git diff --check`.
- **Verification results:** Full Vitest passed (200 files / 1,287 tests); lint, typecheck, build, focused photo-sharing tests (6 files / 37 tests), and whitespace checks passed. Local Supabase migrations through 83 were applied without reset; the transaction-scoped live authorization test passed all 16 assertion groups and rolled back its fixtures. No remote migration deployment was performed.
- **Coverage:** No coverage provider is installed, so a percentage could not be reported. Documented exception; changed behavior has focused unit, repository, component, sync, migration, and live SQL tests.
- **QA report:** Automated checks passed. Manual mobile/desktop viewport, assistive-technology, and complete offline/browser-download flows remain unverified.
- **Security review:** Approved for deployment with conditions: rerun the live authorization test in CI/staging before release and track the broader stale-membership helper issue. The feature-specific media/member policies and public-link isolation were reviewed.
- **Bug-ledger updates:** `.ai/specs/bug-ledger.md` records the media authorization invariant and invitation trigger/schema mismatch.
- **Follow-up work:** Re-run live RLS tests in CI/staging; complete manual responsive/accessibility/offline QA; track `.ai/specs/bug-soft-removed-member-global-access.md` (non-media authorization helpers still ignore soft-removal fields).
