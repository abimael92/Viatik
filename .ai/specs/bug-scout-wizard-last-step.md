# Bug Report: Scout wizard's last screen is crowded, duplicated, and hides its CTA

**Project:** Viatik
**Reporter:** Abimael Garcia
**Status:** Ready for QA
**Date reported:** 2026-10-25
**Priority:** P1
**Related feature/spec:** [Scout's Trip Idea Wizard](./scout-idea-wizard.md)

## Observed Problem

On the final screen of the Scout wizard (Timing), the surface is hard to read and
hard to act on:

- The dialog heading is the same sentence as the button that opened it
  ("Let Scout help you brainstorm!" / "¡Deja que Scout te ayude a pensar!"). The
  copy is chatty, ends in an exclamation mark, and repeats verbatim, so the screen
  reads as duplicated content.
- Three stacked layers of chrome repeat the same context: the dialog subtitle
  ("Question 5 of 5"), a "Scout says · Timing" row, and the five-segment rail.
  The rail's past and current segments both use the brand gradient, so the current
  step cannot be picked out at a glance.
- The last screen asks four optional things (timing, trip length, exact days,
  free-text constraints) plus consent in one long stack. Each optional field
  repeats an "Optional" pill, and the trip-length preset and the exact-day input
  sit side by side with no relationship stated, so the step looks redundant.
- At 430×900 the primary action (**Find my trip ideas**) and even the consent
  checkbox fall below the fold: the nav row lives inside the scroll container.

## Expected Behavior

1. The trigger and the dialog heading are different strings; the heading is a
   short, neutral title (no exclamation mark) and the subtitle carries the step.
2. Exactly one progress affordance names the current step. Past/current/future
   segments are visually distinct.
3. The last screen shows timing + consent by default. Trip length, exact days,
   and constraints move into one `Collapsible` ("Trip details") that is closed by
   default, shows a one-line summary of what is set, and is reused from
   `components/ui/collapsible.tsx` (no new primitive).
4. The nav row (Back / Next / Find my trip ideas) is a fixed footer inside the
   dialog, always visible without scrolling.
5. Validation still opens the collapsed section, shows the inline error, and
   focuses the invalid field.
6. Copy stays localized in English and Spanish and keeps the AI privacy
   disclosure accurate.

## Impact

- **Users affected:** Every traveler who opens the Scout wizard.
- **Severity:** Medium (no data loss; the last step's CTA is effectively hidden on
  phones).
- **Data/security impact:** None. No payload, schema, sync, or consent-semantics
  change; the same answers are still sent with the same consent gate.
- **Workaround:** Scroll the dialog to reach the consent checkbox and CTA.

## How to Reproduce

1. Open the trip planner (`/e2e` harness → **Open trip wishlist**) at 430×900.
2. Start **Let Scout help you brainstorm!** and advance through all five screens.
3. Observe the duplicated heading, the three progress layers, the four optional
   fields with three "Optional" pills, and that **Find my trip ideas** is below
   the fold.

**Reproducibility:** Always
**Minimal reproduction/test:** `features/trip-planner/components/__tests__/scout-idea-wizard.test.tsx`

## Environment Details

- **Application version/commit:** `019202d`
- **Browser/device:** Chromium, 430×900 and 900×900
- **Operating system:** macOS
- **Network state:** Online
- **User role/account state:** `/e2e` harness user (`e2e-planner-user`)
- **Logs/traces/screenshots:** mobile capture of the Timing screen

## Investigation

### Root Cause

The wizard grew by accretion across three UX passes: the trigger and title were
given the same string, the step name was added to the rail *and* kept in the
counter, and every new optional answer was appended to the last screen as its own
block with its own requirement pill. The nav row was authored inside the scroll
container, so it scrolls away from the primary action.

### Contributing Factors

- No test asserted that the trigger and the dialog title differ.
- The rail used the same gradient for `index <= step` and for `index === step`.
- Optional answers had no progressive-disclosure home; `Collapsible` existed but
  was not used, and it had no controlled mode, which validation needs.

### Security Assessment

No change to authentication, authorization, RLS, or data flow. The consent copy
still discloses the exact fields sent (vibe, crew size, savings pace, currency)
and that account details are never sent.

## Fix Plan

1. Add a regression test for the collapsed trip-details section, its summary, and
   the opened-on-validation behavior; update the copy assertions.
2. Extend `Collapsible` with optional controlled `open` / `onOpenChange` props.
3. Retitle the dialog, shorten the consent, and split the trigger/title strings
   (EN + ES).
4. Rebuild the last screen around `Collapsible`; move the nav row into a fixed
   dialog footer; distinguish rail states.
5. Update `scout-idea-wizard.md` acceptance criteria and `memory/`.

## Acceptance Criteria for Resolution

- [x] Trigger and dialog title are different, non-exclamatory strings in EN/ES.
- [x] One progress affordance names the current step; rail states differ.
- [x] Trip length, exact days, and constraints live in a closed-by-default
      "Trip details" collapsible with a summary badge.
- [x] Back / Next / Find my trip ideas render in a fixed footer, outside the
      scroll area.
- [x] An invalid exact-day count opens the section, shows the inline error, and
      focuses the input.
- [x] Existing tests, lint, typecheck, and build pass.

## Resolution

- **Resolved behavior:** Title is "Scout's trip ideas"; subtitle reads
  "Step 5 of 5 · Timing". The rail is the only step indicator. The last screen is
  timing + a "Trip details" collapsible + consent, with the nav row pinned to the
  dialog footer.
- **Fix commit/PR:** pending
- **Verification evidence:** recorded in `scout-idea-wizard.md` completion notes.
- **Bug ledger entry:** None — layout/copy defect with no durable invariant.
- **Follow-up:** None.
