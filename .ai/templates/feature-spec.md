# Feature Specification: [FEATURE_NAME]

**Project:** [PROJECT_NAME]  
**Owner:** [OWNER]  
**Status:** [Draft | Ready for Design | In Progress | Ready for QA | Complete]  
**Created:** [YYYY-MM-DD]  
**Updated:** [YYYY-MM-DD]  
**Related work:** [ISSUE_OR_TICKET_LINK]

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md) before completing this template. The framework entry point is [`../llms.txt`](../llms.txt). Record resulting bug invariants in [`../specs/bug-ledger.md`](../specs/bug-ledger.md), and use [`bug-report.md`](./bug-report.md) for defects discovered during delivery.

## What & Why

### What

[Describe what is being built in user and system terms.]

### Why

[Describe the user problem, business value, and why this work matters now.]

### Users and scenarios

- **Primary user:** [USER_TYPE]
- **Scenario 1:** [Given / When / Then summary]
- **Scenario 2:** [Given / When / Then summary]
- **Offline or degraded-network behavior:** [REQUIRED_BEHAVIOR or `Not applicable`]

## In Scope

- [Capability or behavior included]
- [Capability or behavior included]
- [Validation, authorization, migration, or observability included]

## Out of Scope

- [Explicitly deferred behavior]
- [Integration or platform not included]
- [V2 or follow-up work]

## Constraints and Design

- **Architecture boundaries:** [Relevant modules, services, repositories, or APIs]
- **Data ownership:** [Source of truth and synchronization behavior]
- **Security requirements:** [Authentication, authorization, validation, privacy]
- **Compatibility:** [Browsers, devices, API/database versions]
- **SOLID/design decisions:** [Interfaces, responsibilities, dependency direction]
- **Migration/rollback plan:** [Schema, data, or configuration changes]
- **Observability:** [Metrics, logs, alerts, and redaction requirements]

The Architect Agent must review this section before implementation. Link any decision record here: [ADR_LINK or `None`].

## Acceptance Criteria

All criteria must be objectively testable.

### Functional

- [ ] [User-visible behavior is correct]
- [ ] [Valid input is accepted and persisted correctly]
- [ ] [Invalid input has a clear, accessible error]
- [ ] [Loading, empty, offline, and failure states are handled]

### Authorization and security

- [ ] [Allowed roles can perform the operation]
- [ ] [Unauthorized roles and crafted requests are rejected server-side]
- [ ] [Untrusted input is validated and output is safely rendered]
- [ ] [No secrets or sensitive data are exposed in code, logs, or responses]

### Reliability and offline behavior

- [ ] [Local-first behavior is correct, if applicable]
- [ ] [Retries, idempotency, and conflicts are handled]
- [ ] [Refresh/restart does not lose durable work]
- [ ] [Failure recovery is visible and actionable]

### Accessibility and UX

- [ ] [Keyboard and touch interactions work]
- [ ] [Screen-reader labels and status announcements are present]
- [ ] [Color contrast, focus, and reduced-motion requirements are met]
- [ ] [Responsive behavior is verified on supported viewports]

### Verification

- [ ] [Unit tests added or updated]
- [ ] [Integration tests added or updated]
- [ ] [End-to-end tests added or updated where appropriate]
- [ ] [Coverage for changed/critical code is at least 90% or exception is documented]
- [ ] [Typecheck, lint, formatter, and production build pass]
- [ ] [QA Agent report attached]
- [ ] [Security Agent review attached when applicable]

## Implementation Plan

1. [Red test or specification test]
2. [Application/domain implementation]
3. [Persistence/API/migration work]
4. [UI and accessibility work]
5. [Green verification and refactor]
6. [QA and security review]

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| [Adoption or completion metric] | [VALUE] | [TARGET] | [How measured] | [OWNER] |
| [Reliability/performance metric] | [VALUE] | [TARGET] | [How measured] | [OWNER] |
| [Quality metric] | [VALUE] | [TARGET] | [How measured] | [OWNER] |

## Risks and Open Questions

- **Risk:** [Risk and mitigation]
- **Question:** [Question, owner, and decision deadline]

## Completion Notes

- **Verification commands:** [COMMANDS]
- **Verification results:** [PASS/FAIL and evidence]
- **Bug-ledger updates:** [LINK or `Not applicable`]
- **Follow-up work:** [LINKS or `None`]
