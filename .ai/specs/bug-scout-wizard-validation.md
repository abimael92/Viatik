# Bug Report: Scout wizard hides mandatory-field validation

**Project:** Viatik
**Reporter:** Abimael Garcia
**Status:** Ready for QA
**Date reported:** 2026-10-25
**Priority:** P1
**Related feature/spec:** [Scout's Trip Idea Wizard](./scout-idea-wizard.md)

## Observed Problem

In the **Let Scout help you brainstorm!** wizard (the "Quiero viajar con Scout"
flow), the traveler cannot tell why the flow will not advance:

- **Vibe** and **Crew** steps render a disabled **Next** button until the answer
  is valid. There is no message, no inline error, and no focus change, so the
  button looks broken — especially on mobile, where a disabled control gives no
  feedback on tap.
- **Savings** accepts free text, but an invalid amount (for example `abc`) is not
  rejected on its own step. The traveler only discovers it on the final screen,
  in a generic error box below the whole step, far from the field.
- **Exact number of days** and **Consent** are likewise validated only on the
  final screen, in the same generic error box.
- Choosing **A specific month** leaves **Which month?** empty with no error; the
  wizard silently sends `targetMonth: null`.
- Nothing in the UI says which answers are mandatory and which are optional, so
  travelers cannot plan the flow. The savings screen conveys "optional" only
  through a long sentence, and the departure screen never says it is optional.
- Several helper sentences are longer than they need to be for a five-step
  conversational wizard.

## Expected Behavior

1. Every mandatory field blocks advancement with a **visible, localized inline
   error** attached to the field (`role="alert"`, `aria-invalid`,
   `aria-describedby`) and receives focus, instead of relying on a disabled
   button.
2. Optional fields are explicitly labelled **Optional** and never block the flow.
   Mandatory fields are explicitly labelled **Required**.
3. Validation runs on the step that owns the field: vibe and crew on their
   steps, savings on the budget step, month/duration/consent on the timing step.
4. Helper copy is shortened without losing meaning or the privacy disclosure.
5. Copy remains available in English and Spanish.

## Impact

- **Users affected:** Every traveler who opens the Scout wizard.
- **Severity:** Medium (blocked flow, no data loss).
- **Data/security impact:** None. No payload, schema, or sync change.
- **Workaround:** Type at least two characters of vibe, pick a crew size, and
  keep the savings field numeric or empty.

## How to Reproduce

1. Open the trip planner and start **Let Scout help you brainstorm!**.
2. Leave the vibe empty and try to press **Next**.
3. Observe the button is disabled with no explanation.
4. Continue, enter `abc` as the savings amount, and advance to the last screen.
5. Press **Find my trip ideas** and observe the error appears far from the field.
6. Select **A specific month** and leave the month empty; press **Find my trip
   ideas** and observe that the request still runs with no month.

**Reproducibility:** Always

## Investigation

### Root Cause

`scout-idea-wizard.tsx` encoded mandatory rules as `disabled` expressions on the
Next button (`step === 0 && vibe.trim().length < 2`, `step === 1 && !crewSize`)
and deferred the remaining checks to `askScout()` on the final screen, where all
messages share one generic `error` box. There is no per-field error state, no
`aria-required`/`aria-invalid` wiring, and no required/optional affordance.

### Contributing Factors

- Validation was never modelled per step; the wizard only had a submission-level
  error string.
- The month input had no validation at all.
- Tests asserted the deferred behaviour (generic alert on the last screen) but
  not the per-step behaviour.

### Security Assessment

No security-relevant change. The consent text stays accurate about the data sent
to the AI provider; validation remains client-side UX, and the Server Action
still validates its input independently.

## Fix Plan

1. Add regression tests for per-step inline errors, focus, optional labels, and
   the empty pinned month.
2. Introduce per-field error state and a `validateStep()` / `validateAll()` pair
   in the wizard; keep Next enabled and validate on press.
3. Add localized `Required`, `Optional`, and error strings; shorten verbose help
   copy.
4. Verify with Vitest, typecheck, lint, and build.

## Acceptance Criteria for Resolution

- [x] Pressing **Next** on the vibe step with an empty answer shows an inline
      error and stays on the step.
- [x] Pressing **Next** on the crew step with no choice shows an inline error and
      stays on the step.
- [x] An invalid savings amount is rejected on the budget step with an inline
      error.
- [x] An out-of-range exact day count is rejected on the timing step with an
      inline error.
- [x] Consent is rejected with an inline error next to the checkbox.
- [x] Choosing **A specific month** requires a month.
- [x] Mandatory and optional fields are labelled in the UI.
- [x] Errors clear when the traveler fixes the field.
- [x] English and Spanish copy exist for every new string.
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.

## Resolution

- **Resolved behavior:** Next stays enabled and `validateStep()` rejects the
  current step's invalid fields with inline, localized errors, `aria-invalid` /
  `aria-describedby`, and focus on the first invalid control. `RequirementHint`
  labels mandatory answers **Required** and optional answers **Optional**.
  Savings, exact days, consent, and the pinned month are validated on the step
  that owns them; the pinned month is now mandatory when chosen. Verbose helper
  copy was shortened in both locales.
- **Fix commit/PR:** Pending.
- **Verification evidence:** `pnpm typecheck` ✅ · `pnpm lint` ✅ (no warnings) ·
  `pnpm test` ✅ 218 files / 1,422 tests · `pnpm build` ✅ (21 routes). Focused
  coverage added in `scout-idea-wizard.test.tsx` (inline vibe/crew errors with
  focus, savings rejected on its own step, mandatory pinned month, required vs
  optional labels, duration error recovery, consent `aria-invalid`) and
  `i18n-provider.test.tsx` (new EN/ES strings). All five screens and the inline
  errors were exercised in a real browser through the `/e2e` harness.
- **Bug ledger entry:** Added 2026-10-25 entry in
  [`bug-ledger.md`](./bug-ledger.md).
- **Follow-up:** None.
