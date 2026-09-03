# [PROJECT_NAME] Bug Ledger

**Purpose:** Record confirmed bugs, their root causes, and the durable invariants added to prevent recurrence.  
**Framework entry point:** [`../llms.txt`](../llms.txt)  
**Governing rules:** [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md)
**Related templates:** [`../templates/feature-spec.md`](../templates/feature-spec.md) and [`../templates/bug-report.md`](../templates/bug-report.md)

## How to Use This Ledger

1. Create a bug report from [`../templates/bug-report.md`](../templates/bug-report.md).
2. Reproduce the problem before changing code.
3. Identify the root cause, not only the visible symptom.
4. Decide whether the fix requires a durable invariant.
5. Add a row below and link the bug report, test, or design record where useful.
6. Update the affected feature specification if expected behavior changed.
7. Record the fix commit only after verification passes.

## When to Add an Invariant

Add an invariant when the bug reveals a rule that must remain true across implementations, future refactors, environments, or data states. Typical cases include:

- Authorization or security boundaries.
- Data integrity, money, ordering, or state-transition rules.
- Offline synchronization and idempotency behavior.
- A regression likely to recur without an explicit test or constraint.
- A rule that belongs in the domain model, database constraint, RLS policy, or shared validation layer.

## When It Is Reasonable to Skip an Invariant

An invariant may be skipped when the issue is purely incidental and does not reveal a reusable system rule, for example:

- A typo or copy-only correction with no behavior change.
- A one-off test-fixture mistake.
- A tooling failure unrelated to application behavior.
- A temporary development-only issue that cannot occur in supported environments.

When skipping, record `None — incidental issue` in the bug report or related spec and explain why.

## Good and Bad Invariants

### Good invariants

- `A viewer cannot create, update, or delete any trip-owned record, even with a crafted client request.`
- `Every locally applied mutation has a stable mutation ID and is safe to replay more than once.`
- `An exact expense split must equal the expense total in integer minor units.`
- `A stale compare-and-swap mutation cannot overwrite a newer remote record.`
- `An activity order is based on stable IDs and sortable rank metadata, never array position as identity.`

### Bad invariants

- `The page should work correctly.` — not testable or specific.
- `Users should not see errors.` — ignores valid failure states.
- `Use the new helper everywhere.` — prescribes an implementation rather than a behavior.
- `The button is blue.` — a styling detail, not a durable correctness rule.
- `Make it fast.` — lacks a measurable threshold and measurement method.

## Bug Table

| Date | Bug | Root Cause | Fix |
|---|---|---|---|
| [YYYY-MM-DD] | [Short bug description and link to report] | [Underlying technical cause and invariant/spec decision] | [COMMIT_SHA, PR link, or `Pending`] |

## Entry Quality Checklist

- [ ] The bug was reproduced or evidence was collected.
- [ ] The root cause is distinguished from the symptom.
- [ ] The invariant is behavior-focused and testable, or the skip reason is documented.
- [ ] A regression test, constraint, policy, or validation rule was added when appropriate.
- [ ] The related feature spec or bug report was updated.
- [ ] Verification passed before the fix commit was recorded.
