# Feature Specification: Community idea cards on Home

**Project:** Viatik
**Owner:** Abimael Garcia
**Status:** Ready for QA
**Created:** 2026-11-01
**Related work:** [Scout's Trip Idea Wizard](./scout-idea-wizard.md), [Home pre-trip & command palette](./home-pretrip-and-command-palette.md)

## What & Why

The Home **Travel ideas** entry point opens `SuggestionsDrawer`, a bottom sheet of
community itineraries. It offered **four** cards, and each card carried only a
name, a destination, a one-line description, up to three tags, and an activity
count — none of the numbers a traveler actually weighs before opening one.

This pass takes the sheet to **five** ideas and gives every card the details that
are already set on the idea: how long it is, how many people it is authored for,
how many activities it holds, what the whole trip costs, and what it takes to
save for it over **3 months** or **5 months**.

## In Scope

- A fifth template, **Marrakech & the Atlas** (5 days, culture / adventure / food),
  so the sheet spans culture, city break, trekking, food, and adventure.
- `PublicTripTemplate` gains `durationDays` and a `cost` baseline
  (`flightPerPerson`, `dailyPerPerson`, `hotelPerNight`) in whole units of the
  template's own `baseCurrency`.
- Each card shows a detail row (duration · travelers · activities), a **Trip
  cost** block with the whole-party total, and the per-month figure for a
  3-month and a 5-month saving window.
- The sheet states the figures are estimates for the whole party, in the
  traveler's currency.
- Cards widen from `w-56` to `w-72` so the detail fits without truncating, and
  keep the horizontal snap-scroll on mobile.

## Out of Scope

- The `/community` page's own cards and preview dialog. They keep using
  `budgetMinor` (activities × 85.00), which this pass does **not** redefine.
- Live fares or stay availability. Baselines are historical estimates.
- Per-template authoring of costs from the UI; baselines are authored in
  `features/community/data/public-templates.ts`.
- Changing the Scout wizard.

## Constraints and Design

- **Pure pricing.** `features/community/domain/template-cost-estimate.ts`:
  `templateCostEstimate({ days, travelers, baseCurrency, flightPerPerson,
  dailyPerPerson, hotelPerNight, currency })` returns
  `{ totalMinor, perTravelerMinor, travelers, currency, monthly[] }`.
  Flights and daily spending are per traveler; the nightly rate covers the whole
  party; nights are `max(1, days - 1)`. Everything is `bigint` minor units.
- **Currency.** The display currency is `budgetUserCurrency(profile.preferredCurrency,
  template.baseCurrency)` and the conversion uses `convertBudget` (offline
  default rate table), so the sheet renders with no network round-trip. When
  either currency falls outside the money domain the function returns `null` and
  the card omits the cost block instead of mislabelling a number.
- **Rounding.** Each saving window rounds **up**, so saving the shown amount
  always covers the goal.
- **Data ownership.** Templates stay static, read-only data; nothing is written
  to Dexie or Supabase and no schema changes.
- **Profile read.** The sheet reads `preferredCurrency` through
  `useLocalProfile(userId)`, which serves the Dexie mirror and refreshes it
  best-effort.

## Acceptance Criteria

- [x] The sheet lists five ideas, and every card shows duration, travelers, and
      activity count.
- [x] Every card shows a whole-party trip cost and the 3-month and 5-month
      per-month figures, rounded up.
- [x] The cost block is priced in the traveler's preferred currency when it is
      supported, otherwise the template's own currency.
- [x] An unsupported currency omits the cost block rather than showing a wrong
      figure.
- [x] The sheet explains that the figures are estimates for the whole party.
- [x] All new copy renders in English and Spanish through `lib/i18n`.
- [x] Cards render without clipping at 1280×900 and 430×900.

## Verification

- `features/community/domain/template-cost-estimate.test.ts` — per-traveler vs
  per-party pricing, 3/5-month windows, round-up, MXN and JPY conversion,
  unsupported currency, invalid party/length.
- `features/community/components/__tests__/suggestions-drawer.test.tsx` — five
  cards, per-card detail and cost, estimate note.
- Visual check of the sheet at 1280×900 and 430×900 through the dev `/e2e`
  harness (temporary render, reverted afterwards).
