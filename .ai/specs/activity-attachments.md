# Feature Specification: Activity Attachments

**Project:** Viatik
**Owner:** Viatik Product
**Status:** Implemented on the Activity form Extras tab
**Created:** 2026-09-24
**Updated:** 2026-09-24
**Related work:** Activity planning form, Home activity detail modal, trip media sync

## What & Why

Activities may contain an ordered, optional set of photos, rich links, and location
pins. Editors prepare these attachments in the Trip Workspace; travelers can open
them from Activity detail views, including after the Activity was prepared offline.

## In Scope

- A bounded, typed `Activity.attachments` manifest synchronized as Activity JSONB.
- Image manifests reference activity-scoped `TripMedia` rows by stable media ID.
- Offline image preparation and durable upload through Dexie `tripMedia`.
- Cached link-preview text and provider-neutral location coordinates.
- Planning controls in the Activity form **Extras** tab as a photo-first gallery
  of cards (no in-place reorder). Read-only Activity dialogs use the same gallery.
- Home execution rendering, image lightbox, external links, and map handoff.

## Out of Scope

- Attachments on individual Must-dos.
- Video, audio, arbitrary documents, map embeds, and background link refresh.
- Binary, Base64, signed URLs, or Storage paths inside Activity JSONB.

## Constraints and Design

- **Architecture boundaries:** UI uses Activity/media repository boundaries. Dexie
  remains the local source of truth; Supabase is only the sync/authorization target.
- **Data ownership:** `activities.attachments` is the synchronized manifest.
  `tripMedia.blob` is the durable local image queue. `trip_media` and private
  `trip-media` Storage own remote image metadata/content.
- **Security:** Editors manage attachments; members may view them. Activity and
  Storage authorization remains server-enforced. Links accept only HTTP(S), text is
  bounded and rendered as text, and signed URLs are never persisted in the manifest.
- **Compatibility:** Missing/legacy attachment data normalizes to an empty array.
- **Migration:** Additive JSONB column, validation trigger, Activity CAS update, and
  generated Supabase types. No destructive Dexie migration is required.
- **Observability:** Logs may include Activity/media IDs and status only, never URLs,
  captions, addresses, or binary content.

## Acceptance Criteria

### Functional

- [x] An editor can add and remove up to eight Activity attachments as a visual gallery of cards.
- [x] Photos, links, and pins are represented by a validated discriminated union.
- [x] Planning cancel does not persist newly selected image Blobs. The editor
  says photos save with the activity; upload starts only after the Dexie write.
- [x] Execution and read-only planning dialogs render the same ordered attachments.
- [x] Photos open in a keyboard-accessible Dialog lightbox.
- [x] Links open safely in a new context; pins open a universal maps URL.

### Authorization and security

- [x] Non-editors cannot change `activities.attachments` remotely.
- [x] Invalid URLs, coordinates, oversized manifests, and malformed objects fail
  server validation and are normalized safely on the client.
- [x] Activity JSONB/outbox payloads contain no Blob, Base64, object URL, signed URL,
  or Storage path.

### Reliability and offline behavior

- [x] Saving offline writes Activity, pending media, outbox, and feed atomically.
- [x] A local Blob renders immediately and survives database reopen.
- [x] Reconnect replays the Activity first, then uploads activity-scoped media.
- [x] Upload retry and failure state remain visible and actionable.
- [x] Removing an image attachment soft-deletes its unreferenced media.

### Accessibility and UX

- [x] All controls have 44px targets, focus styles, and localized accessible labels.
- [x] Async preparation/upload status uses a polite live region.
- [x] The detail modal remains scannable on mobile and omits empty attachment UI.

## Implementation Plan

1. Add failing domain/mapper/migration tests.
2. Add attachment types, normalization, migration, CAS mapping, and repository APIs.
3. Add an atomic Activity planning save command for pending media.
4. Add reusable attachment editor, renderer, and image lightbox.
5. Project attachments into Home timeline details and Trip Workspace read-only views.
6. Verify offline/retry, authorization, accessibility, and regression behavior.

## Verification

- Focused Vitest domain, mapper, repository, sync, and component suites.
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- Relevant Playwright and local Supabase RLS checks.

## Completion notes

- Focused Vitest: domain, mapper, repository, HUD, attachment components, and
  schema suites passed after the planning-save and preview-URL work.
- `pnpm exec eslint` on `activity-attachments.tsx` passed after object-URL
  preview was rewritten to `useMemo` plus revoke-only cleanup.
- Local Supabase was started and `npx supabase gen types typescript --local`
  wrote `lib/supabase/database.types.ts` with `activities.attachments: Json`.
- Manual QA on the development account: file picker accepted a local JPEG and
  rendered the pending blob thumbnail before save; a link attachment was added;
  an offline save created the Activity. After reconnect, `tripMedia` uploaded
  to Storage. Place-search pin was not completed during first QA. Hosted
  project `spcpdbxripukvqrnsuim` now has migration 61, so a remote pull
  cannot default `attachments` back to `[]`. Dialog dismiss ignores
  portaled place results, Google `.pac-container`, and menus so pin
  search can complete inside ActivityForm.
- `pnpm lint` still fails on pre-existing `lib/i18n/i18n-provider.tsx`
  setState-in-effect. Parallel i18n files stay out of this commit.
- Full `pnpm test`, `pnpm build`, Playwright, and a dedicated Security report
  remain recommended before release.

## Risks

- Activity-level CAS can resolve concurrent attachment edits only at Activity
  granularity; stable IDs and bounded payloads limit ambiguity.
- A remote Activity may briefly reference a media ID before the media upload finishes;
  render a deterministic pending placeholder until `trip_media` arrives.
- Rich-link metadata retrieval is SSRF-sensitive. Initial delivery stores validated,
  user-supplied preview text; automated server-side unfurling requires a separately
  reviewed hardened fetch boundary.
