# Bug Report: Offline banner hides existing trips

**Project:** Viatik
**Status:** Fix In Progress
**Date reported:** 2026-09-25
**Priority:** P0
**Related feature/spec:** Cloud sync pull

## Observed Problem

Signed-in Home shows the empty state “¿A dónde vamos?” and the banner “Estás sin conexión. Los cambios se guardarán en este dispositivo y se sincronizarán al reconectarte.” The account still owns Phoenix Family, las Vegas Retreat, and Kyoto in Spring on the server.

## Expected Behavior

When the server is reachable, Home downloads those trips even if `navigator.onLine` is false. The offline banner appears only after a sync request fails because the network is unreachable.

## Impact

- **Users affected:** The signed-in account on this browser, including https://viatik-six.vercel.app/home
- **Severity:** Critical
- **Data/security impact:** None known. Rows were not deleted.
- **Workaround:** None on the published site until this fix is deployed.

## How to Reproduce

1. Sign in on a browser whose `navigator.onLine` is false, or on the published app before this fix.
2. Open Home.
3. Observe the empty state and the offline banner while the server still has the trips.

**Reproducibility:** Always when the browser reports offline before the pull starts.

## Investigation

### Root Cause

`pullRemoteChanges` and `syncOnce` returned immediately when `navigator.onLine` was false, so IndexedDB stayed empty. The banner used that same flag. A later table failure in the old pull also discarded trips that had already been fetched, because nothing was written until every table succeeded.

### Security Assessment

No authorization change. The pull still uses the signed-in Supabase session and existing row filters.

## Fix Plan

1. Regression test: a pull with `navigator.onLine === false` still stores the fetched trip.
2. Attempt sync even when the browser reports offline. Show the offline banner only when the request fails with a network error.
3. Keep already-fetched trips when a later table fails.

## Acceptance Criteria for Resolution

- [ ] Home shows the server trips after a reload while signed in on the build that contains this fix.
- [ ] The offline banner stays hidden when the download succeeds.
- [ ] `lib/sync/cloud-sync.test.ts` covers the false-offline pull.

## Resolution

- **Resolved behavior:** A reported-offline browser still downloads trips. The banner follows a failed network request.
- **Fix commit/PR:** Pending
- **Verification evidence:** Pending
- **Bug ledger entry:** 2026-09-25 row in `.ai/specs/bug-ledger.md`
- **Follow-up:** The published site at viatik-six.vercel.app does not include this change until it is deployed.
