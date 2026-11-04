# Bug Report: Critical Dependency Vulnerabilities

**Project:** Viatik  
**Reporter:** Repository security audit  
**Status:** Fix In Progress  
**Date reported:** 2026-11-04  
**Priority:** P0  
**Related feature/spec:** Dependency security and release integrity

## Observed Problem

The manifest and lockfile resolve `next` 16.3.3, `eslint-config-next` 16.3.3,
and `dompurify` 3.4.14. The installed versions are below the requested fixed
versions for the `next/og` RCE and DOMPurify `SAFE_FOR_TEMPLATES` bypass.

## Expected Behavior

The manifest and lockfile resolve `next` at or above 16.3.6 and `dompurify` at
or above 3.4.17, with no affected vulnerable version remaining anywhere in the
dependency graph. The initial audit also found two critical Next.js advisories
still affecting 16.3.6; use at least 16.4.1, the audit's patched floor, so the
framework is not left with critical findings.

The follow-up transitive fixes are exact pnpm overrides: `undici@7` 7.30.1,
`undici@8` 8.12.2, `brace-expansion@1` 1.1.21, `brace-expansion@5` 5.0.12,
`source-map-js` 1.2.2, and `vite@8` 8.2.4. Later audit entries raised the
brace-expansion patches above the initial scanner floors.

## Impact

- **Users affected:** All application users if vulnerable code is reached.
- **Severity:** Critical.
- **Data/security impact:** Potential remote code execution through the affected
  Next.js `next/og` path and bypass of DOMPurify's template-safety mode.
- **Workaround:** None; update affected packages.

## How to Reproduce

1. Inspect the root importer in `pnpm-lock.yaml`.
2. Run `pnpm list next eslint-config-next dompurify --depth 2`.
3. Observe the vulnerable versions in the installed dependency tree.

**Reproducibility:** Always  
**Minimal reproduction/test:** Dependency version/tree inspection and package
audit.

## Environment Details

- **Application version/commit:** `main` at task start; clean worktree.
- **Browser/device:** Not applicable.
- **Operating system:** macOS 27.2.
- **Network state:** Online for package metadata and audit.
- **User role/account state:** Not applicable.
- **Database/API version:** No database/API changes.
- **Feature flags/configuration:** pnpm 11.3.0; Node.js 26.0.0.
- **Logs/traces/screenshots:** None.

## Investigation

### Root Cause

`package.json` pins Next.js and its matching ESLint config at 16.3.3 and allows
DOMPurify from `^3.4.14`; the lockfile consequently resolves the versions below
the requested security floors. Metadata confirms Next.js 16.4.1 supports Node
`>=20.9.0` and React `^19.0.0`; the project uses Node 26.0.0 and React 19.2.8.
The matching `eslint-config-next` 16.4.1 supports the project's ESLint 9 and
TypeScript 5 toolchain. A full audit of 16.3.6 then found two additional
critical Next.js advisories with patched versions `>=16.4.1`; the target remains
within Next.js 16 and does not require a major-version migration.

### Contributing Factors

- Security fixes were not reflected in the currently locked versions.
- The framework ESLint config must remain aligned with the installed Next.js
  release.

### Security Assessment

The scope is package metadata and lockfile only. DOMPurify has no direct import
in `app/`, `components/`, `features/`, or `lib/` at investigation time; it is
still upgraded as requested. No application behavior, authorization,
validation, schema, or remote data access changes are intended.

## Fix Plan

1. Set `next` and `eslint-config-next` to at least 16.4.1 and raise the DOMPurify
   requirement to at least 3.4.17.
2. Regenerate `pnpm-lock.yaml` with pnpm 11.3.0 and inspect the complete
   resolved dependency graph for affected versions.
3. Run dependency audits, lint, typecheck, the complete test suite, and the
   production build.
4. Record exact evidence, update the bug ledger and memory, then commit and push
   only if every required check passes.
5. Pin the reported transitive dependency patches with exact-version pnpm
   workspace overrides; package.json `pnpm.overrides` is ignored by pnpm 11.

## Acceptance Criteria for Resolution

- [x] `package.json` requires `next` >=16.4.1 (and therefore >=16.3.6),
  `dompurify` >=3.4.17, and an aligned `eslint-config-next`.
- [x] The lockfile contains no vulnerable Next.js, Next ESLint plugin/config,
  or DOMPurify resolutions.
- [x] Dependency audit reports neither requested vulnerability, including
  transitive resolutions; all remaining findings are reported.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- [x] The diff contains no unrelated application, schema, or UI changes.
- [x] Security review and the bug-ledger invariant decision are recorded.
- [x] The lockfile resolves exact patched versions for the listed undici,
  brace-expansion, source-map-js, and Vite paths; those advisories are absent.
- [ ] Commit and push occur only after all preceding checks pass; withheld
  because the full `pnpm audit` still reports 7 unrelated findings and the
  global coverage gate remains below its committed baseline.

## Resolution

- **Resolved behavior:** The requested Next.js and DOMPurify fixed versions are
  present in the manifest and lockfile, including companion Next packages. The
  requested transitive findings resolve to exact fixed versions. Other audit
  findings remain outside the named package scope.
- **Fix commit/PR:** Not created; the user's all-checks-pass condition is not met.
- **Verification evidence:** `pnpm agent:verify` passed (249 files; 1,690
  passed, 3 skipped); `pnpm build` passed (21 routes); schema, i18n, affected
  test runner, frozen-lockfile validation, `pnpm agent:infra`, `pnpm agent:drift`,
  and `pnpm audit --audit-level=critical` passed. Full `pnpm audit` exits 1
  with 7 findings (1 high, 6 moderate), none from the requested package
  versions. The full coverage runner also exits 1 at 74.93% vs its 75.18%
  baseline; the baseline was not weakened.
- **Bug ledger entry:** Recorded; fix commit pending.
- **Follow-up:** Review remaining findings outside the named package scope and
  resolve the global coverage baseline shortfall before committing/pushing.

## Scope Inventory

- **Requested:** Update Next.js and DOMPurify dependency requirements and all
  corresponding lockfile/transitive resolutions; align `eslint-config-next`
  with Next.js.
- **Additional requested CVE patches:** Pin transitive `undici`, both used
  `brace-expansion` major lines, `source-map-js`, and Vite to exact patched
  versions using pnpm overrides. Use `undici@8.12.2` rather than only 8.10.2
  because the current audit also reports later 8.x advisories patched at
  8.12.2; keep `undici@7` on its compatible patched 7.30.1 line.
- **Configuration location:** pnpm 11 ignores the legacy `package.json`
  `pnpm.overrides` field; effective overrides belong in `pnpm-workspace.yaml`.
- **Required consistency updates:** Correct the stale Next.js version facts in
  `AGENTS.md` and `memory/MEMORY.md`; the repository drift test treats those
  version claims as authoritative documentation.
- **Required process records:** This bug report, an implementation plan,
  bug-ledger decision, and dated memory entry.
- **Not authorized / out of scope:** Application code changes, package upgrades
  beyond the explicitly requested advisory patches, schema/migration changes,
  and removal of any dependency or feature.

## Follow-up: Exact Transitive Dependency Patches

The subsequent audit identified these current lock resolutions and patched
floors. Pin exact values under `overrides` in `pnpm-workspace.yaml`; do not
express the patched floors as open-ended ranges:

| Package selector | Current resolution | Exact patched resolution |
|---|---:|---:|
| `undici@7` | 7.30.0 | 7.30.1 |
| `undici@8` | 8.10.0 | 8.12.2 |
| `brace-expansion@1` | 1.1.18 | 1.1.21 |
| `brace-expansion@5` | 5.0.9 | 5.0.12 |
| `source-map-js` | 1.2.1 | 1.2.2 |
| `vite@8` | 8.2.2 | 8.2.4 |

Next audit verification must confirm these exact versions are the only
corresponding lock resolutions. Node engine metadata for `undici@8.12.2` and
Vite 8.2.4 remains consistent with the current installed Node; Vite 8.2.2
already declares the same engine floor.

The follow-up audit also disclosed later `brace-expansion` advisories fixed at
1.1.21 and 5.0.12, so use these newer exact patches rather than stopping at the
initial scanner's 1.1.20/5.0.11 floors.
