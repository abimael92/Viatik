# Bug Report: P0 — `profiles` RLS exposes full PII to trip collaborators

**Project:** Viatik
**Reporter:** Security Agent (abimael.garcia)
**Status:** Resolved
**Date reported:** 2026-09-10
**Priority:** P0
**Related feature/spec:** [Bug Ledger](./bug-ledger.md) — profiles RLS PII invariant

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md). The framework entry point is [`../llms.txt`](../llms.txt). After resolution, update [`../specs/bug-ledger.md`](../specs/bug-ledger.md) when the bug reveals a durable invariant; link the affected [`feature-spec.md`](./feature-spec.md) when the bug changes feature behavior.

## Observed Problem

The `public.profiles` table carries sensitive columns — `phone`, `birth_date`,
`passport_issuing_country`, `passport_expires_on`, `allergies`,
`dietary_restrictions`, and `emergency_contact_name`/`relationship`/`phone`.

The select policy `profiles_select_self_or_shared_trip` (added in migration
`00000000000019_account_linking_and_contact_logistics.sql`) let **any
authenticated user who shares a non-deleted trip** select the **entire**
`profiles` row of every co-traveler via:

```sql
using (
  id = auth.uid()
  or exists ( ... trip membership join ... shared_trip.deleted_at is null ... )
)
```

Because the policy gates on the whole row, any collaborator reading another
collaborator's profile row received all of that person's PII in a single
`select *`, not just the identity fields the UI needs (name/avatar/handle).

## Expected Behavior

- Direct reads of `public.profiles` are limited to the row owner
  (`auth.uid() = id`).
- Collaborator identity (name, avatar, public handle, preferences) is available
  only through an explicit, allow-listed projection, gated to the caller plus
  users sharing a non-deleted trip.
- No other authenticated user can ever read sensitive profile columns
  (`phone`, `birth_date`, passport, health, emergency-contact data).

## Impact

- **Users affected:** All users who share a trip; any collaborator could read the
  PII of everyone on the trip.
- **Severity:** Critical (PII disclosure via an over-broad authorization policy).
- **Data/security impact:** Full disclosure of phone, date of birth, passport
  issuing country and expiry, allergies, dietary restrictions, and emergency
  contact details.
- **Workaround:** None (server-side policy flaw).

## How to Reproduce

1. Have two authenticated users (`A` and `B`) who share a non-deleted trip.
2. As `B`, issue `select * from profiles where id = A.id`.
3. Observe all of `A`'s sensitive columns are returned (policy allows it).

**Reproducibility:** Always
**Minimal reproduction/test:** `supabase/profiles-rls-security.test.ts`
(regression test asserting the migration removes the over-broad policy, adds a
self-only policy, and exposes only the allow-listed RPC/view columns).

## Environment Details

- **Application version/commit:** `main` at pre-fix HEAD (`fe27dcf`)
- **Browser/device:** N/A (server-side RLS policy)
- **Operating system:** N/A
- **Network state:** N/A
- **User role/account state:** Any authenticated trip collaborator
- **Database/API version:** Supabase Postgres with RLS
- **Feature flags/configuration:** None
- **Logs/traces/screenshots:** None — no sensitive data captured.

## Investigation

### Root Cause

The RLS select policy authorized reading the **whole** `profiles` row for any
user sharing a trip. The policy was row-level (not column-level), so it did not
restrict which columns a collaborator could read. Sensitive columns were later
added to `profiles`, so the previously "reasonable-looking" policy silently
became a full-PII disclosure path.

### Contributing Factors

- The sensitive columns were added to `profiles` without revisiting the select
  policy to confirm collaborators still only needed safe identity fields.
- No regression/security test asserted that a collaborator cannot read a
  co-traveler's sensitive columns.
- The UI reads collaborator identity via `select ... from profiles`, so the
  policy was the only boundary between "public identity" and "full PII".

### Security Assessment

Authentication/authorization flaw (Critical). The fix must be enforced
server-side via RLS and a security-definer RPC that returns only an explicit
allow-list of public columns, gated to the caller + shared-trip members. It must
not be based on client-side filtering, and must not expose PII via any new view
or function.

## Fix Plan

1. **Regression test:** `supabase/profiles-rls-security.test.ts` — 7 assertions
   that the migration:
   - drops `profiles_select_self_or_shared_trip` and
     `profiles_select_authenticated`;
   - adds a self-only `profiles_select_self` policy
     (`using (auth.uid() = id)`), and does not use `using (true)`;
   - creates a self-scoped `profile_public_data` view with `security_barrier`
     exposing only safe columns;
   - creates a security-definer RPC `get_profile_public_data(uuid[])` gated to
     caller + shared-trip members, reading only from the sanitized
     `profile_directory`, returning only allow-listed public columns, rejecting
     oversized batches, and granting execute only to `authenticated`.
2. **Implementation:** migration
   `00000000000035_fix_profiles_rls.sql` (see above layers).
3. **Repository:** `listProfiles` in
   `features/collaboration/data/dexie-collaboration-repository.ts` now calls the
   safe RPC instead of selecting from `profiles`.
4. **Invariant:** recorded in `specs/bug-ledger.md` (see Resolution).
5. **Verification:** unit security tests, `pnpm typecheck`, `pnpm lint`. Live
   `supabase db reset` blocked in this environment (no local stack/`config.toml`);
   structural validity confirmed against prior migrations.

## Acceptance Criteria for Resolution

- [x] The original reproduction no longer fails: a collaborator can no longer
      `select *` a co-traveler's `profiles` row (self-only RLS policy).
- [x] A regression test covers the failure mode (`profiles-rls-security.test.ts`).
- [x] Existing tests, lint, and typecheck pass (security suite + full run).
- [x] Permission/boundary cases covered (oversized batch rejected; caller +
      shared-trip gating; no PII columns projected).
- [x] The related feature spec / bug ledger invariant was updated
      (`specs/bug-ledger.md`).
- [x] QA verification attached (below).
- [x] Security Agent review attached (this report).

## Resolution

- **Resolved behavior:** Direct `profiles` selects are self-only via RLS.
  Collaborator identity is served through the security-definer
  `get_profile_public_data(uuid[])` RPC (allow-listed public columns from the
  sanitized `profile_directory`, gated to caller + shared-trip members). A
  self-scoped `profile_public_data` view provides the same allow-list for the
  caller's own profile.
- **Fix commit/PR:** `821ab61` — `fix(security): restrict profiles RLS and expose identity via safe RPC`.
- **Verification evidence:**
  - `pnpm test supabase/profiles-rls-security.test.ts` — PASS (7/7).
  - `pnpm typecheck` — PASS.
  - `pnpm lint` — PASS.
  - Migration structurally validated against prior migrations (22, 25, 3, 4, 19).
  - `supabase db reset` — NOT RUN: `supabase start is not running` (no local
    stack / `config.toml` in this environment). This is the sole un-run check.
- **Bug ledger entry:** [`specs/bug-ledger.md`](./bug-ledger.md) — "P0:
  `profiles` RLS exposed PII…", status updated from `Pending` to the fix commit.
- **Follow-up:** Run `supabase db reset` / `supabase start` against a configured
  local stack to confirm the migration applies against a live Postgres instance.
