# Critical Dependency Vulnerabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the reported Next.js `next/og` RCE and DOMPurify `SAFE_FOR_TEMPLATES` bypass from direct and transitive dependency resolutions.

**Architecture:** Keep the change at the package-manager boundary. Raise Next.js and its matching ESLint config together, update DOMPurify to the requested fixed floor, and let pnpm regenerate the lockfile. No app, database, or sync code changes are expected.

**Tech Stack:** Next.js 16.4.1+, React 19.2.8, DOMPurify 3.4.17+, pnpm 11.3.0.

**Spec:** `.ai/specs/bug-critical-dependency-vulnerabilities.md`

## Global Constraints

- `next` must be `>=16.3.6`; the audit found two additional Next.js critical advisories at 16.3.6, so target `>=16.4.1`.
- `dompurify` must be `>=3.4.17`.
- Keep `eslint-config-next` aligned with the installed Next.js version.
- Preserve the existing React 19, Node >=20.9, and pnpm 11.3 configuration.
- No unrelated application or schema changes; do not remove dependencies.
- Commit and push only after all requested checks pass.

## Review Focus

- Framework peer compatibility — confirm Next.js 16.4.1 accepts current React and Node versions using package metadata, then typecheck/build.
- ESLint integration — align the config and verify with the complete lint command.
- Lockfile/transitives — inspect every resolved Next package and run dependency audit.
- Vulnerability status — confirm both requested advisories are absent from audit results and package tree.
- Scope — inspect the final diff and ensure no unrelated source changes.

---

### Task 1: Specify and upgrade dependencies

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Reference: `.ai/specs/bug-critical-dependency-vulnerabilities.md`

**Interfaces:**
- Consumes: Existing React 19.2.8, ESLint 9, TypeScript 5, pnpm 11.3.0.
- Produces: `next` and `eslint-config-next` 16.4.1+, DOMPurify >=3.4.17, with matching lockfile graph.

- [x] Update the named dependency requirements, align version references, and regenerate `pnpm-lock.yaml` using pnpm.
- [x] Verify the resolved versions and transitive graph with `pnpm list`, `pnpm why`, and dependency audit.
- [x] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [x] Review the diff and record evidence in the bug report, bug ledger, and `memory/MEMORY.md`.
- [ ] Commit and push only if all acceptance checks pass.

**Gate result:** The full `pnpm audit` exits 1 with 18 high, 25 moderate, and 4 low findings, so commit and push are intentionally withheld. The critical-level audit passes with zero critical findings, and neither requested advisory remains.
