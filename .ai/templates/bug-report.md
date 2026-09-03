# Bug Report: [BUG_TITLE]

**Project:** [PROJECT_NAME]  
**Reporter:** [REPORTER]  
**Status:** [Open | Investigating | Fix In Progress | Ready for QA | Resolved | Won't Fix]  
**Date reported:** [YYYY-MM-DD]  
**Priority:** [P0 | P1 | P2 | P3]  
**Related feature/spec:** [LINK]

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md). The framework entry point is [`../llms.txt`](../llms.txt). After resolution, update [`../specs/bug-ledger.md`](../specs/bug-ledger.md) when the bug reveals a durable invariant; link the affected [`feature-spec.md`](./feature-spec.md) when the bug changes feature behavior.

## Observed Problem

[Describe exactly what happened. Include the user-visible symptom, error message, affected data, and frequency.]

## Expected Behavior

[Describe what should happen instead. State the behavior as a testable requirement.]

## Impact

- **Users affected:** [WHO]
- **Severity:** [Critical | High | Medium | Low]
- **Data/security impact:** [DESCRIPTION or `None known`]
- **Workaround:** [WORKAROUND or `None`]

## How to Reproduce

1. [Start from a clean or defined state]
2. [Perform action]
3. [Perform action]
4. [Observe the failure]

**Reproducibility:** [Always | Often | Intermittent | Unknown]  
**Minimal reproduction/test:** [LINK or description]

## Environment Details

- **Application version/commit:** [VERSION_OR_SHA]
- **Browser/device:** [BROWSER, VERSION, DEVICE]
- **Operating system:** [OS, VERSION]
- **Network state:** [Online | Offline | Slow | Intermittent]
- **User role/account state:** [ROLE, anonymized identifier]
- **Database/API version:** [VERSION]
- **Feature flags/configuration:** [RELEVANT_VALUES]
- **Logs/traces/screenshots:** [REDACTED_LINKS]

Do not include passwords, session tokens, API keys, personal data, or unredacted private trip content.

## Investigation

### Root Cause

[Complete during investigation. Identify the underlying cause, not just the failing line.]

### Contributing Factors

- [Missing test, validation, policy, observability, or design assumption]

### Security Assessment

[Complete for any auth, authorization, input, data exposure, upload, dependency, or infrastructure concern.]

## Fix Plan

1. [Regression test that reproduces the bug]
2. [Implementation or configuration fix]
3. [Spec, invariant, migration, or policy update]
4. [Verification and rollout plan]

## Acceptance Criteria for Resolution

- [ ] The original reproduction no longer fails.
- [ ] A regression test covers the failure mode.
- [ ] Existing tests, lint, typecheck, and build pass.
- [ ] Relevant offline, permission, boundary, and failure cases are covered.
- [ ] The related feature spec was updated if behavior changed.
- [ ] The bug-ledger invariant decision was recorded.
- [ ] QA Agent verification is attached.
- [ ] Security Agent review is attached when applicable.

## Resolution

- **Resolved behavior:** [DESCRIPTION]
- **Fix commit/PR:** [COMMIT_OR_PR]
- **Verification evidence:** [COMMANDS AND RESULTS]
- **Bug ledger entry:** [LINK or `None — incidental issue, reason: ...`]
- **Follow-up:** [LINK or `None`]
