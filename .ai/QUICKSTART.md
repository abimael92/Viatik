# [PROJECT_NAME] AI-Agent Quick Start

Use this guide when working with AI agents in this repository. It is designed for fast, repeatable feature work and bug fixes.

## Before You Start

The complete rules live in [`constitution.md`](./constitution.md). Agent responsibilities live in [`AGENTS.md`](./AGENTS.md). Do not skip them for speed:

- No code without verification.
- Spec first, code second.
- Follow SOLID principles and existing architecture.
- Treat security as a requirement from the beginning.
- Update the spec when fixing a bug or discovering a missing rule.

## 1. How to Use This Framework — 5 Steps

### Step 1: Start with the right request

Tell the Main Agent what you need and identify whether it is a feature, bug, refactor, or security review.

```text
Act as the Main Agent for [PROJECT_NAME]. I need help with a [FEATURE / BUG / REFACTOR / SECURITY REVIEW]. Do not write code yet. First inspect the repository rules and summarize the work needed.
```

### Step 2: Read the required context

Agents should read, in order:

1. [`constitution.md`](./constitution.md)
2. [`AGENTS.md`](./AGENTS.md)
3. The relevant feature spec or [`templates/bug-report.md`](./templates/bug-report.md)
4. [`specs/bug-ledger.md`](./specs/bug-ledger.md) for known bug-derived rules
5. Repository rules, package scripts, neighboring code, and relevant framework documentation

### Step 3: Write the specification first

Use [`templates/feature-spec.md`](./templates/feature-spec.md) for new functionality or [`templates/bug-report.md`](./templates/bug-report.md) for a defect. Include scope, acceptance criteria, security requirements, and verification commands.

### Step 4: Implement through the agent workflow

Use this sequence:

```text
Main Agent → Architect Agent → Implementation Agent → QA Agent → Security Agent → Main Agent
```

The Implementation Agent writes a failing test first, implements the smallest correct change, and refactors only while tests remain green.

### Step 5: Verify and record the result

Run the relevant checks, review the diff, update the spec or bug ledger, and report exactly what passed or failed. Never claim a command was run when it was not.

## 2. Creating a New Feature

### Step-by-step

1. Describe the user problem and desired outcome.
2. Ask the Main Agent to inspect the codebase without editing.
3. Create a feature spec from [`templates/feature-spec.md`](./templates/feature-spec.md).
4. Ask the Architect Agent to review boundaries, data ownership, SOLID design, migrations, and risks.
5. Ask the Implementation Agent to write the first failing test.
6. Implement the feature using existing patterns and dependencies.
7. Ask the QA Agent to verify acceptance criteria, regressions, accessibility, and coverage.
8. Ask the Security Agent to review any auth, permissions, input, data, upload, or dependency changes.
9. Run the final checks and update the feature spec with evidence.

### Prompt: Start a feature

```text
Act as the Main Agent. I want to add [FEATURE_NAME] to [PROJECT_NAME].

Do not write code yet. Read .ai/constitution.md, .ai/AGENTS.md, the repository AGENTS.md, README.md, package.json, and relevant existing code. Then:
1. Summarize the current architecture and related implementation.
2. Identify ambiguities and ask focused questions.
3. Propose the scope and verification plan.
4. Create a feature specification using .ai/templates/feature-spec.md.
```

### Prompt: Request architecture review

```text
Act as the Architect Agent. Review the feature spec at [SPEC_PATH] for [FEATURE_NAME].

Do not implement code. Evaluate SOLID compliance, module boundaries, dependency direction, data ownership, authorization, migrations, offline/retry behavior, performance, and test strategy. Return an implementation plan, risks, and any required spec changes.
```

### Prompt: Request TDD implementation

```text
Act as the Implementation Agent. Implement [FEATURE_NAME] according to [SPEC_PATH].

Follow Red-Green-Refactor: first add a failing test for the acceptance criteria, then implement the smallest correct change, then refactor safely. Preserve existing user changes, follow repository conventions, do not add overlapping technologies, and do not use hardcoded secrets. Report every file changed and every verification command run.
```

### Prompt: Request feature QA

```text
Act as the QA Agent. Verify [FEATURE_NAME] against [SPEC_PATH].

Run the relevant unit, integration, end-to-end, accessibility, typecheck, lint, coverage, and build checks. Test success, validation failures, permissions, boundary cases, offline/retry behavior, and regressions. Target at least [COVERAGE_TARGET, e.g. 90%] coverage for changed and critical code. Return a QA report with evidence and unresolved risks.
```

## 3. Fixing a Bug

For defects, also follow [`skills/bug-backprop.md`](./skills/bug-backprop.md):

```text
TRACE → ANALYZE → PROPOSE → GENERATE → VERIFY → LOG
```

### Step-by-step

1. Describe the observed and expected behavior using [`templates/bug-report.md`](./templates/bug-report.md).
2. Reproduce the bug and record the environment, inputs, role, and network state.
3. Trace the root cause to a specific `file:line`; do not stop at the visible symptom.
4. Decide whether a durable invariant can prevent recurrence, or document why it is incidental.
5. Add a failing regression test before changing production code whenever practical.
6. Implement the smallest safe fix.
7. Run the regression test, related tests, full suite, lint, typecheck, build, and relevant security/E2E checks.
8. Update the bug report and [`specs/bug-ledger.md`](./specs/bug-ledger.md).
9. Record the fix commit or pull request only after verification passes.

### Prompt: Investigate a bug

```text
Act as the Main Agent. Investigate this bug in [PROJECT_NAME]:

Observed problem: [WHAT HAPPENED]
Expected behavior: [WHAT SHOULD HAPPEN]
How to reproduce: [STEPS]
Environment: [BROWSER / DEVICE / OS / NETWORK / USER ROLE]

Do not modify code yet. Read .ai/constitution.md, .ai/AGENTS.md, .ai/skills/bug-backprop.md, and the relevant source and tests. Reproduce or validate the report, trace the root cause to file:line, and create a completed bug report with a proposed verification plan.
```

### Prompt: Fix a bug with TDD

```text
Act as the Implementation Agent. Fix [BUG_TITLE] using [BUG_REPORT_PATH].

First create a deterministic failing regression test that reproduces the bug. Then implement the smallest correct fix, preserving existing architecture and security boundaries. Decide whether a durable invariant is required, update the affected spec or .ai/specs/bug-ledger.md, and report the exact verification commands and results.
```

### Prompt: Backpropagate and close a bug

```text
Act as the QA Agent, then the Security Agent where applicable. Verify the fix for [BUG_TITLE] in [BUG_REPORT_PATH].

Confirm the original reproduction passes, test adjacent boundary cases, inspect permissions and untrusted input, run the project's required checks, and report any remaining risk. Do not mark the bug resolved unless the bug report and bug ledger are updated with evidence.
```

## 4. Running a Security Review

### Step-by-step

1. Define the review scope and affected files or systems.
2. Read [`constitution.md`](./constitution.md) and [`AGENTS.md`](./AGENTS.md).
3. Inspect authentication, authorization/RLS, input validation, output encoding, secrets, logs, uploads, dependencies, SSRF, injection, CSRF, XSS, and data exposure as relevant.
4. Verify security enforcement server-side; client-side checks are not sufficient.
5. Run negative tests for unauthorized users, malformed input, expired sessions, invalid files, and failure paths.
6. Classify findings as Critical, High, Medium, or Low.
7. Require remediation of unresolved Critical or High findings before approval.
8. Record residual risk and verification evidence without exposing secrets or private data.

### Prompt: Run a security review

```text
Act as the Security Agent. Review [SCOPE] in [PROJECT_NAME].

Read .ai/constitution.md, .ai/AGENTS.md, the relevant feature spec or bug report, repository rules, changed files, migrations, and tests. Check authentication, authorization, RLS, input validation, output encoding, secrets, logging, uploads, dependency risk, injection, XSS, CSRF, SSRF, data leakage, and denial-of-service risks as applicable.

Do not expose secrets or sensitive user data. Return:
- Scope reviewed
- Findings with file:line evidence
- Severity
- Required remediation
- Tests or checks run
- Residual risk
- Approval status
```

## 5. Common Commands — Copy-Paste Ready Prompts

Use the repository's actual scripts from `package.json`. For this project, common commands include:

### Inspect before changing

```text
Inspect the repository before making changes. Read .ai/llms.txt, .ai/constitution.md, .ai/AGENTS.md, AGENTS.md, README.md, package.json, and the files relevant to [REQUEST]. Summarize conventions, risks, affected files, and the smallest safe implementation plan. Do not edit anything yet.
```

### Run tests

```text
Run the relevant tests for [CHANGE_OR_PATH], then run the complete test suite. Report the exact commands, pass/fail status, coverage if configured, and any failures. Do not modify tests to hide failures.
```

```bash
pnpm test
```

### Run quality checks

```text
Run the project's lint, typecheck, and production build checks. Report exact output and do not claim success unless each command completes successfully.
```

```bash
pnpm lint
pnpm typecheck
pnpm build
```

### Run browser tests

```text
Run the end-to-end browser tests for [FLOW]. Include online, offline, mobile viewport, authentication, permissions, and recovery behavior where relevant. Report failures with the test name and reproduction details.
```

```bash
pnpm test:e2e
```

### Review the diff

```text
Review the current git diff for [CHANGE]. Check scope, regressions, SOLID boundaries, security issues, missing tests, and accidental secrets. Do not edit files. Return actionable findings by severity.
```

```bash
git status --short
git diff --check
git diff
```

### Create a feature spec

```text
Create a feature specification for [FEATURE_NAME] using .ai/templates/feature-spec.md. Include What & Why, In Scope, Out of Scope, testable acceptance criteria, security and offline requirements, risks, and measurable success metrics. Do not write implementation code.
```

### Create a bug report

```text
Create a bug report for [BUG_TITLE] using .ai/templates/bug-report.md. Include the observed problem, expected behavior, exact reproduction steps, environment details, impact, and an empty Root Cause section to be completed after investigation.
```

## Completion Standard

A task is not complete until the relevant spec/report is updated, tests and required checks pass, security review is complete when applicable, and the final response includes verification evidence and known limitations.
