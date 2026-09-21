# Bug Report: Native confirmations and notifications were inconsistent

**Project:** Viatik  
**Reporter:** User report  
**Status:** Resolved  
**Date reported:** 2026-09-20  
**Priority:** P2  
**Related feature/spec:** Shared confirmation and notification UX

## Observed Problem

Several destructive actions used browser-native `window.confirm`, while operation results were inconsistently shown as inline errors or no feedback.

## Expected Behavior

Destructive actions use an accessible accept/cancel modal. Informational, success, and operation-failure notifications use the shared toast system. Inline field validation remains inline and accessible.

## Resolution

Added a shared `ConfirmDialog` and replaced all production browser confirmations for ending/deleting trips, expenses, vault entries, and transit segments. Operation outcomes now use the shared toast provider where the affected flows previously used transient notifications.

## Verification

- Focused trip/activity tests passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `git diff --check` passed.
