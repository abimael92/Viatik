# [PROJECT_NAME] AI Development Constitution

**Status:** Non-negotiable project policy  
**Applies to:** Every human and AI contributor, including all agents defined in [`AGENTS.md`](./AGENTS.md)  
**Entry point:** [`llms.txt`](./llms.txt)

## Purpose

This constitution defines the minimum engineering standard for [PROJECT_NAME]. It is read before any planning, design, implementation, review, or release work. The framework is reusable, but project-specific constraints must be recorded in [PROJECT_NAME]'s repository rules and feature specifications.

## Non-Negotiable Rules

### 1. No code without verification

No implementation is complete until appropriate verification has been run and recorded.

At minimum, contributors must:

- Add or update automated tests for changed behavior.
- Run the relevant test suite.
- Run the project linter and formatter checks.
- Run type checking and the production build when applicable.
- Report failures honestly; never claim success from an unrun command.
- Never bypass failing checks merely to make a change appear complete.

See [`AGENTS.md`](./AGENTS.md) for role-specific verification responsibilities.

### 2. Spec first, code second

Every feature, bug fix, migration, and security-sensitive change starts with a written specification or report.

- New features use [`templates/feature-spec.md`](./templates/feature-spec.md).
- Bugs use [`templates/bug-report.md`](./templates/bug-report.md).
- The spec must state scope, constraints, acceptance criteria, and verification expectations.
- If implementation reveals a requirement that was missing or incorrect, update the spec before closing the work.

### 3. SOLID principles always

Design and implementation must follow SOLID principles:

- **Single Responsibility:** each module has one reason to change.
- **Open/Closed:** extend behavior through stable abstractions rather than unsafe edits to unrelated code.
- **Liskov Substitution:** implementations honor their declared contracts.
- **Interface Segregation:** prefer focused interfaces over broad, forced dependencies.
- **Dependency Inversion:** business rules depend on abstractions, not infrastructure details.

Architecture decisions belong in the spec or a linked architecture decision record and are reviewed by the Architect Agent.

### 4. Security first

Security is a release requirement, not a post-release activity.

- Validate and normalize all untrusted input at system boundaries.
- Authorize every protected operation server-side.
- Never hardcode secrets, tokens, credentials, or private keys.
- Do not log secrets or sensitive personal data.
- Apply least privilege and secure defaults.
- Review dependencies, authentication, authorization, data exposure, injection, file uploads, and error handling.
- Treat client-side checks as UX only, never as the security boundary.

The Security Agent must review security-sensitive changes before completion.

### 5. Bug → spec update

A bug fix is incomplete until the underlying requirement or invariant is documented.

For every confirmed bug, decide whether a durable invariant is needed and record the result in [`specs/bug-ledger.md`](./specs/bug-ledger.md). Update the associated feature spec or bug report when behavior, constraints, or acceptance criteria change.

### 6. AI agents follow these rules

AI agents have no exception to this constitution. Every agent must:

- Read [`llms.txt`](./llms.txt), this constitution, and [`AGENTS.md`](./AGENTS.md) before acting.
- Follow the assigned role and delegation boundaries.
- Ask for clarification when requirements or authorization are insufficient.
- Preserve existing user changes and avoid destructive operations without explicit approval.
- Keep claims grounded in inspected files and executed verification.
- Leave the repository in a buildable, reviewable state.

## Change Control

Any proposal to relax a rule requires an explicit written decision by [PROJECT_OWNER_OR_TEAM] and must be recorded in the relevant specification or architecture decision record. Convenience, schedule pressure, or agent limitations are not sufficient reasons to bypass this constitution.

## Required Reading

- [`llms.txt`](./llms.txt) — framework entry point and workflow.
- [`AGENTS.md`](./AGENTS.md) — agent roles and handoffs.
- [`specs/bug-ledger.md`](./specs/bug-ledger.md) — bug-derived invariants.
- [`templates/feature-spec.md`](./templates/feature-spec.md) — feature specification template.
- [`templates/bug-report.md`](./templates/bug-report.md) — bug report template.
