# Bug Report: Activity attachment previews and add menu are difficult to see

**Project:** Viatik  
**Reporter:** User report  
**Status:** Resolved  
**Date reported:** 2026-10-05  
**Priority:** P2  
**Related feature/spec:** [Activity Attachments](./activity-attachments.md)

## Observed Problem

In the Activity form Extras tab, an image card shows a broken-image icon instead of a preview. The Add attachment menu also has low-contrast text/background states, making Photo, Link, and Location pin options difficult to read.

## Expected Behavior

Image previews prefer an available local Blob over a remote signed URL. If every source fails, a clear localized placeholder is shown instead of the browser broken-image icon. Add-menu items have readable foreground/background contrast in default and highlighted states in light and dark themes.

## Impact

- **Users affected:** Users adding, editing, or viewing Activity attachments.
- **Severity:** Medium.
- **Data/security impact:** None known; attachment persistence and remote authorization are unchanged.
- **Workaround:** Save the activity and retry a failed image upload; menu options may still be used with careful selection.

## How to Reproduce

1. Open an Activity form and add an image attachment or open an existing one whose signed URL no longer loads.
2. Observe the blank/broken preview tile.
3. Open Add attachment and inspect the highlighted and unhighlighted menu item contrast.

**Reproducibility:** Reported by screenshot; preview failure handling and highlighted style mismatch confirmed in code.  
**Minimal reproduction/test:** `features/activities/components/__tests__/activity-attachments.test.tsx`.

## Environment Details

- **Application version/commit:** Working tree; exact commit unknown.
- **Browser/device:** Browser, localhost:3000.
- **Operating system:** Unknown.
- **Network state:** Unknown.
- **User role/account state:** Authenticated activity editor.
- **Database/API version:** Local-first Dexie with Supabase Storage sync.
- **Feature flags/configuration:** None known.
- **Logs/traces/screenshots:** Screenshot supplied in conversation.

## Investigation

### Root Cause

`useMediaPreviewUrl` preferred `uploadedUrl` over an available local Blob, and all image render paths rendered `<img>` without handling load errors. The menu item classes set `focus:` colors, while the shared Radix dropdown applies `data-highlighted:` styles, so the highlighted background/foreground pair could remain low-contrast.

### Contributing Factors

- Remote signed URLs may expire or fail even while a local image Blob is available.
- The preview had no accessible error state when a remote source failed.

### Security Assessment

No remote access or storage policy changes are planned. Existing media and Activity repository boundaries remain unchanged.

## Fix Plan

1. Add failing tests for local-Blob preview preference, broken-image fallback, and highlighted menu contrast.
2. Reuse a resilient preview component across editor thumbnails, detail thumbnails, and the lightbox.
3. Align menu item `data-highlighted` colors with high-contrast foregrounds in both themes.
4. Update this report and the bug ledger; run relevant tests, lint, typecheck, and build.

## Acceptance Criteria for Resolution

- [x] A local Blob is used before a remote signed URL when both are available.
- [x] A failed image source shows a localized, accessible preview fallback instead of a broken-image icon.
- [x] Photo, Link, and Location pin menu items have readable highlighted and default text styles in light and dark themes.
- [x] Regression tests and project verification pass.
- [x] The related feature spec and bug ledger are updated.

## Resolution

- **Resolved behavior:** Attachment thumbnails prefer local image data, failed previews display a clear fallback, and add-menu highlighted states retain readable contrast in both themes.
- **Fix commit/PR:** Pending.
- **Verification evidence:** `pnpm test` (196 files / 1,237 tests), `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.
- **Bug ledger entry:** Added to `bug-ledger.md`.
- **Follow-up:** None known.
