# Bug Report: Root Layout Typecheck Fails

**Project:** Viatik  
**Reporter:** User  
**Status:** Investigating  
**Date reported:** 2026-11-05  
**Priority:** P2  
**Related feature/spec:** Root layout typing / Next.js 16 App Router

## Observed Problem

`pnpm typecheck` fails at `app/layout.tsx:25:50` because the default import
`LayoutProps` from `next` resolves to a value, but the root layout uses it as a
generic type.

## Expected Behavior

The root layout's `children` prop has a valid React type and `pnpm typecheck`
passes without requiring generated route types for this static root layout.

## Impact

- **Users affected:** Contributors and CI/pre-commit checks.
- **Severity:** Medium
- **Data/security impact:** None.
- **Workaround:** None; every commit is blocked by the repository typecheck gate.

## How to Reproduce

1. Run `pnpm typecheck`.
2. Observe TS2749 at `app/layout.tsx:25:50`: `LayoutProps` refers to a value,
   but is being used as a type.

**Reproducibility:** Always  
**Minimal reproduction/test:** `pnpm typecheck`

## Investigation

### Root Cause

`app/layout.tsx` imports `LayoutProps` as a default value from `"next"`. Next
16.4.1 documents `LayoutProps` as a generated global helper, not an import.
The root layout only consumes `children`, so the global route-aware helper is
unnecessary here.

### Contributing Factors

- The erroneous import shadowed the intended global helper.
- Route-aware helpers require generated `.next/types`; a simple root `children`
  prop does not need that dependency.

### Security Assessment

No security or authorization impact. This changes only the root layout's
TypeScript annotation.

## Fix Plan

1. Use React's `ReactNode` for the root layout `children` prop.
2. Remove the invalid `LayoutProps` import.
3. Run `pnpm typecheck` and the repository verification gate.

## Acceptance Criteria for Resolution

- [ ] `pnpm typecheck` passes.
- [ ] Root layout still accepts and renders its existing children unchanged.
- [ ] No generated route types or runtime behavior are changed.

## Resolution

- **Resolved behavior:** Pending verification.
- **Fix commit/PR:** Pending
- **Verification evidence:** Pending
- **Bug ledger entry:** None — incidental TypeScript import error; no durable
  product invariant.
- **Follow-up:** None.
