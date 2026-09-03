# Bug Backpropagation Protocol

**Project:** [PROJECT_NAME]  
**Purpose:** Turn every confirmed bug into a tested fix and, when appropriate, a durable specification rule.  
**Required reading:** [`../constitution.md`](../constitution.md), [`../AGENTS.md`](../AGENTS.md), and [`../specs/bug-ledger.md`](../specs/bug-ledger.md)  
**Bug report template:** [`../templates/bug-report.md`](../templates/bug-report.md)  
**Framework entry point:** [`../llms.txt`](../llms.txt)

## When to Use This Protocol

Use this protocol for production defects, regressions, data-integrity failures, security findings that require a code change, and recurring test failures caused by application behavior. It may also be used for incidents discovered during development.

Do not silently patch a bug. The protocol must leave behind:

- A reproducible understanding of the failure.
- A documented root cause with a file and line reference.
- A failing regression test before the fix whenever practical.
- A verified fix.
- A bug-ledger entry and specification update when the bug reveals a durable rule.

## Six-Step Process

### 1. TRACE — Find the root cause

Reproduce the failure and trace it through the complete execution path.

Record:

- The first observable failure.
- The responsible file and line, for example `lib/sync/sync-engine.ts:128`.
- The relevant inputs, state, user role, and network conditions.
- The difference between the immediate symptom and the underlying cause.
- Related code paths that could regress from the fix.

Do not stop at a stack trace. A stack trace identifies where execution failed, not necessarily why the system entered the invalid state.

### 2. ANALYZE — Can a specification rule prevent this?

Ask whether the bug violates a rule that should always hold across implementations, environments, or future refactors.

Consider whether the rule belongs in:

- A feature specification or acceptance criterion.
- A domain invariant or validation function.
- A database constraint or migration.
- An authorization/RLS policy.
- A synchronization contract.
- A regression test.
- A runbook or operational check.

If the answer is yes, write the rule in behavior-focused, testable language before implementing the fix.

### 3. PROPOSE — Add an invariant or skip with a reason

Choose one outcome explicitly:

**Add an invariant** when the bug exposes a reusable correctness, security, data-integrity, state-transition, or reliability rule. Include the invariant in the bug report or affected specification and summarize it in [`../specs/bug-ledger.md`](../specs/bug-ledger.md).

**Skip an invariant** only when the issue is incidental and does not reveal a reusable system rule, such as a typo, test-fixture mistake, or tooling-only failure. Record:

```text
None — incidental issue: [specific reason]
```

Never skip merely because the fix is small or the invariant is inconvenient to test.

### 4. GENERATE — Create a failing test

Before fixing code, create the smallest deterministic test that demonstrates the bug.

The test should:

- Fail for the original behavior.
- Pass only when the intended behavior is restored.
- Use safe, representative data.
- Cover the relevant boundary condition, permission, retry, offline state, or malformed input.
- Be placed next to related tests according to repository conventions.

For UI issues, prefer an interaction-level test. For domain and infrastructure issues, prefer a focused unit or integration test. Add an end-to-end test when the defect depends on routing, browser behavior, authentication, storage, or real integration boundaries.

### 5. VERIFY — Fix code and pass tests

Implement the smallest correct fix while preserving the approved architecture and SOLID boundaries.

Then verify in this order:

1. Run the new regression test and confirm it passes.
2. Run related unit and integration tests.
3. Run the complete test suite.
4. Run coverage and confirm changed/critical code meets the project target of [COVERAGE_TARGET, e.g. 90%].
5. Run linting and formatting checks.
6. Run type checking.
7. Run the production build when applicable.
8. Run security or end-to-end checks when the bug affects those boundaries.

Record exact commands and results. Never claim verification without executing it.

### 6. LOG — Update the bug ledger

Complete the bug report and add an entry to [`../specs/bug-ledger.md`](../specs/bug-ledger.md) after verification passes.

The entry must include:

- Date.
- Concise bug description.
- Root cause with file and line reference.
- Invariant added, or the explicit skip reason.
- Fix commit or pull request.

If expected behavior changed, update the associated feature spec using [`../templates/feature-spec.md`](../templates/feature-spec.md). If no feature spec exists, create one before closing the bug.

## Bug Ledger Format

Use this table in [`../specs/bug-ledger.md`](../specs/bug-ledger.md):

| Date | Bug | Root Cause | Invariant | Fix Commit |
|---|---|---|---|---|
| [YYYY-MM-DD] | [Short description and bug-report link] | [Cause with `path/to/file.ts:line`] | [Testable invariant, or `None — incidental issue: reason`] | [COMMIT_SHA, PR link, or `Pending`] |

### When to Add an Invariant

Add one when the bug identifies a rule that must remain true, including:

- User identity, authentication, authorization, or tenant isolation.
- Input or output safety.
- Data integrity, money, ordering, or state transitions.
- Offline queue idempotency, retries, conflict resolution, or deletion behavior.
- A regression likely to recur without an explicit automated check.
- A rule enforceable in the domain layer, database, policy, or shared boundary.

An invariant should be independent of a particular implementation where possible and should have a test, constraint, policy, or validation rule that enforces it.

### When to Skip an Invariant

Skip only when there is no durable product or system rule to preserve, for example:

- A spelling, copy, or formatting-only correction.
- A broken test fixture with correct production behavior.
- A local development/tooling issue unrelated to application behavior.
- An unsupported environment that the project explicitly does not target.

Document the reason. A skipped invariant still requires the failing cause, fix, and verification to be recorded in the bug report.

## Examples

### Good invariant

> **All user IDs must be valid UUID format.**

Why it is good:

- It describes a durable data rule.
- It is independent of a specific file or line.
- It can be enforced with validation and database constraints.
- It can be tested with valid and invalid identifiers.

A stronger testable form is:

```text
Every user ID accepted at an application boundary must match the canonical UUID format; invalid IDs are rejected before persistence or authorization checks.
```

### Bad invariant

> **Line 42 should not crash.**

Why it is bad:

- It refers to an implementation location rather than system behavior.
- It does not identify valid inputs or expected output.
- The line may move during refactoring.
- It cannot guide another implementation or enforce a meaningful contract.

A better replacement would describe the actual rule, such as:

```text
A missing activity record returns a typed not-found result and does not mutate the outbox.
```

## Completion Checklist

- [ ] Bug report created from [`../templates/bug-report.md`](../templates/bug-report.md).
- [ ] Failure reproduced and traced to `file:line`.
- [ ] Root cause is documented separately from the symptom.
- [ ] Invariant added or explicit skip reason recorded.
- [ ] Failing regression test created.
- [ ] Fix implemented without violating [`../constitution.md`](../constitution.md).
- [ ] Regression, related, and full test suites pass.
- [ ] Coverage, lint, typecheck, build, and applicable security/E2E checks pass.
- [ ] Feature spec updated if behavior or acceptance criteria changed.
- [ ] [`../specs/bug-ledger.md`](../specs/bug-ledger.md) updated.
- [ ] Fix commit or pull request recorded.
