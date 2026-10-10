# Feature Specification: Vacation Planner & Local Wishlist

**Project:** Viatik  
**Owner:** TBD  
**Status:** Ready for QA  
**Created:** 2026-10-09  
**Updated:** 2026-10-10  
**Related work:** Existing trip workspace, local-only `TripBudget`, destination lookup, and activity/transit planning. The former AI Trip Builder spec is superseded; this feature does not restore its whole-trip AI generation flow. See [`ai-trip-builder.md`](./ai-trip-builder.md), [`ai-activity-scout.md`](./ai-activity-scout.md), and [`bug-budget-mixes-group-and-personal-spend.md`](./bug-budget-mixes-group-and-personal-spend.md).

> This specification incorporates the approved Phase 1 product and architecture decisions. Implementation may begin with the repository's required Red → Green → Refactor workflow. Any deviation from the local-only, single-currency, no-income, and provider-link boundaries below requires an explicit spec update.

## What & Why

### What

Add an offline-capable, device-local vacation-planning area where an authenticated traveler can save destinations they want to visit, enter globally agnostic origin/destination and date preferences, manually record prices found through outbound Google Travel flight/hotel searches, create a private trip-cost plan, and calculate monthly, weekly, or one-time savings contributions using only the trip target and current savings.

The user can turn a saved idea into a regular Viatik trip. The local wishlist and savings data remain private to the creator's current device; they are not written to Supabase or the outbox. A created trip and its owner membership continue through the existing sync behavior. Any initial trip budget remains local-only, consistent with the existing `TripBudgetRepository`.

Phase 1 provides **search shortcuts and manual price capture**, not live fare/hotel inventory, a price guarantee, or booking. Google Travel links are generated from verified, allowlisted query formats; prices are entered and maintained by the user.

### Why

Viatik already supports destination-aware trips, offline itinerary planning, activity estimates, transit details, expenses, and a local trip budget. A private wishlist and transparent savings plan can connect inspiration to those existing workflows without introducing a remote provider dependency or prematurely synchronizing speculative personal data.

The feature must keep planned costs distinct from confirmed bookings and actual trip spending. Prior finance UX work found that group totals can be mistaken for personal spending; this planner must label its values as the current user's private plan and must not blend them with shared expenses.

### Users and scenarios

- **Primary user:** An authenticated Viatik traveler planning a possible future trip for themselves or their household.
- **Scenario 1 — Save an idea:** Given I have a destination in mind, when I add a trip idea with an optional origin, dates or travel month, duration, and traveler count, then it appears in my local wishlist and remains available after reload and while offline.
- **Scenario 2 — Research a price:** Given an idea has an origin, destination, and applicable dates, when I select an outbound Google Travel search, then it opens separately with the available route/date query; after returning, I can manually record a price in the idea's single currency, source, and check date.
- **Scenario 3 — Plan savings:** Given an exact future trip start date, target trip cost, and current savings, when I view the savings plan, then the app shows a monthly or (when under 30 days) weekly/one-time contribution based only on those inputs, with no income or salary field.
- **Scenario 4 — Convert an idea:** Given I choose to start a trip from an idea, when I confirm, then Viatik creates a regular trip through the existing trip application/repository boundary and carries over the selected destination, dates, traveler counts, and private budget estimate without creating duplicate trips on retry.
- **Offline or degraded-network behavior:** Create, view, edit, and remove ideas, manual estimates, and savings inputs locally without a network. Destination suggestions may be unavailable offline; typed city names remain valid. Outbound searches require connectivity and must fail gracefully if opening the provider is blocked.

## In Scope

- A signed-in user's local-only wishlist of `TripIdea` records.
- Optional origin text, destination text, optional resolved destination place details, date/date-range flexibility, expected duration, adult/child counts, currency, interests/tags, and notes.
- Manual category estimates and user-entered price checks (including transport and lodging) in the idea's single currency, with source/provider label and checked-on date. Provider URLs are generated from validated fields at click time and are not user-supplied or persisted.
- Validated outbound Google Travel search links for flights and hotels using URL-encoded natural-language queries. The user explicitly initiates external navigation.
- A private `TripSavingsPlan` with current savings and contribution cadence; the goal comes from the idea's target trip cost. No salary, income, bank account, or transaction connection is requested or stored.
- Conversion of a wishlist idea into a regular Viatik trip through the transaction-aware, idempotent use case defined below.
- A responsive wishlist/planner UI with empty, loading, validation, offline, error, and converted states.
- Dexie persistence through a feature repository/application boundary, local schema migration, and automated tests.
- Existing destination lookup reuse when available; manual origin and destination entry remain possible.

## Out of Scope

- Live flight, hotel, rental, attraction, or discount search APIs; background price monitoring; guaranteed prices or availability.
- Booking, checkout, payments, affiliate tracking, or reservation confirmation.
- Supabase tables or Supabase domain-table reads/writes from UI; outbox mutations for wishlist/savings records; cross-device wishlist sync; or shared wishlist collaboration.
- Syncing private savings inputs or speculative wishlist budgets to trip members.
- Asking for or storing salary, income, financial accounts, bank connections, or transactions.
- Automated regional pricing/cost-of-living matrices or region-specific origin validation.
- Multi-currency estimates, FX conversion, and live exchange rates. Each idea uses one supported profile/default currency; any currency-domain expansion requires separate finance review.
- AI-generated whole-trip plans. Existing AI Activity Scout remains a separate optional itinerary tool after a regular trip exists.
- Replacing the current trip budget, expense ledger, or actual-spend calculations.
- Booking import, calendar synchronization, price alerts, and cross-device backup; potential follow-up only after product validation.

## Constraints and Design

- **Architecture boundaries:** Proposed modules are `features/trip-planner/domain/`, `features/trip-planner/data/`, `features/trip-planner/lib/`, and `features/trip-planner/components/`, with an authenticated entry point adjacent to the existing Trips experience and using existing navigation conventions. UI components depend on focused `TripIdeaRepository` and `TripSavingsPlanRepository` contracts plus application/use-case functions, not directly on Dexie or Supabase.
- **Data ownership:** `tripIdeas` and `tripSavingsPlans` are Level C, device-local Dexie stores in the authenticated user's local database. They are authoritative on that device and are not cached copies of remote rows. Neither store is added to `cloud-sync.ts`, remote mappers, Supabase, realtime, or the outbox. Conversion is the exception only for the newly created collaborative `Trip` and its owner `TripMember`: one local Dexie transaction writes those records, their normal outbox INSERT mutations, a local `TripBudget`, and the `TripIdea.convertedToTripId`. `TripBudget` is currently device-local and must not be queued to the outbox. Use a transaction-aware application/repository operation that preserves the existing trip creation invariants; do not duplicate the process in UI code.
- **Data model:** `TripIdea` has UUIDv4 `id`, `createdAt`, `updatedAt`, local `version` (initialize to 1 and increment on update), a user-editable name, free-text origin/destination, optional resolved destination place details, optional target start/end date or month, optional duration, adult/child counts, one currency, interests/tags, notes, optional target trip cost in `MinorUnits`, category estimates in that same currency using existing spending categories where possible, manual price checks (category, amount in the same currency, source/provider label, and checked timestamp), and nullable `convertedToTripId`. A separate `TripSavingsPlan` has UUIDv4 `id`, unique `tripIdeaId`, `currentSavingsMinor`, selected contribution cadence, `createdAt`, `updatedAt`, and local `version` (initialize to 1 and increment on update). The target amount is authoritative; category estimates may be incomplete, so visibly show any unallocated remainder or over-allocation rather than implying the breakdown reconciles. The savings goal is sourced from `TripIdea`; the suggested contribution is derived and not stored. No owner/actor field is needed because the authenticated database is already per-user. No remote version, tombstone, or `deletedAt` is used. Removing an idea physically deletes the idea and its savings plan in one transaction; it never deletes an already-converted Trip.
- **Metadata strategy:** Classify both stores as Level C device-local state: local identifiers, local timestamps, and a local row revision only; no collaborative/cloud metadata or remote migration. Keep Dexie schema evolution additive. This is not a synchronized table and has no legacy rows requiring actor/date backfill. Do not add either store to sync entity types or mappers.
- **Trip conversion:** Generate a UUIDv4 `tripId` before entering the transaction. In one Dexie transaction spanning `tripIdeas`, `trips`, `tripMembers`, `tripBudgets`, and `outboxMutations`, create the regular Trip and owner membership, append the normal INSERT mutations for those synchronized entities, create/update the local TripBudget without an outbox mutation, and persist `convertedToTripId` on the idea. An application-level transaction-aware repository/use case must reuse the existing trip validation and owner-membership behavior; it must not nest an incompatible transaction or duplicate Trip construction in UI code. The transaction commits locally and the UI routes to the new trip workspace immediately, including offline; the outbox replays when online. If already converted, route to the stored `convertedToTripId` rather than creating another Trip. Transaction rollback leaves the idea unconverted and no partial Trip/budget/outbox state.
- **Security and privacy:** Require authenticated app access. Data is device-local in the per-user Dexie database and is not a server authorization boundary. Do not log origin, destination notes, manual prices, or savings values. Do not expose wishlist data in shared trip feeds, trip-share links, collaborator views, analytics payloads, or notifications. An outbound search may include only the route/date values the user explicitly selected; never include notes, budget totals, savings, or price history. Disclose before navigation that selected route/date values are sent to the external provider. UI copy must disclose that clearing browser/app storage or using another device can make local ideas unavailable. This reduces sensitive data collected but is not a claim that all legal obligations are eliminated.
- **Money and currency rules:** Store all monetary fields as `MinorUnits` (`bigint`) using existing parse/format helpers. Each idea uses exactly one currency, initialized from the signed-in user's profile `preferredCurrency` when it is supported by the money domain; otherwise use the existing USD default. No FX rates or conversion are used. Manual prices must be entered in the idea's currency; if a provider quotes another currency, the user must convert externally before entry. Reject unsupported currency input visibly and do not silently reinterpret it. Keep target cost, estimates, manual quotes, and actual expenses distinct; do not create an `Expense` for a wishlist estimate or quote.
- **Savings calculation:** `TripIdea.targetTripCostMinor` is the savings goal; `TripSavingsPlan.currentSavingsMinor` is the manually entered current amount. Never request or store income. When the exact trip start is at least 30 calendar days away, use `max(1, differenceInCalendarMonths(tripStartDate, today))` monthly periods. When fewer than 30 calendar days remain, default to weekly cadence with `max(1, ceil(remainingCalendarDays / 7))` periods; allow a one-time lump-sum option. Show `ceil(max(0, targetTripCostMinor - currentSavingsMinor) / periods)` in minor units for the selected cadence. If current savings meet/exceed the target, show zero. If exact start date or target cost is missing, show which input is needed; a flexible month alone is not enough to calculate. If the date is today or past, show the remaining amount as due now (or zero if already saved), not a divided periodic amount. Label all results as estimates, not financial advice.
- **Outbound links:** Do not accept arbitrary user-provided URLs. Build links from the fixed `https://www.google.com` host and URL-encoded natural-language queries: flights use `/travel/flights?q={encoded query}` with `Flights to {destination} from {origin} on {YYYY-MM-DD}` when fields exist; hotels use `/travel/hotels?q={encoded query}` with `Hotels in {destination}`. Omit unavailable optional details rather than inventing them. Test generated URLs and manually smoke-check provider behavior; if query routing changes, fall back to general search and tell the user which fields were not carried over. Open only after explicit user action, use safe new-window behavior (`noopener`, `noreferrer`), and disclose that selected route/date text is sent to Google. Never include notes, budget/savings amounts, or quote history in a link. Do not label a search result a booking or guaranteed price.
- **Global reach:** Origin and destination are free text and are not constrained to hardcoded airports, regions, or price tiers. Currency follows the single supported profile/default currency rule above; there is no location-to-currency inference or regional price matrix.
- **Compatibility:** Current Next.js 16/React 19 app conventions. If implementation changes Next.js routing/server behavior, first read the installed Next documentation as required by root `AGENTS.md`. Follow `.ai/specs/design-system.md` for tokens, responsive layout, 44px target sizing, reduced motion, and UI tests.
- **SOLID/design decisions:** Keep savings arithmetic and quote validation pure and unit-testable. Repository owns Dexie access and live queries; application use cases own conversion orchestration; components own input/display only. Reuse existing `DestinationField`, shared money utilities, and existing UI primitives where appropriate.
- **Migration/rollback plan:** Add an additive Dexie schema version and `tripIdeas`/`tripSavingsPlans` stores after checking the actual current schema version at implementation time. Index `tripSavingsPlans.tripIdeaId` uniquely. There are no legacy rows to backfill in these new stores; the migration must preserve all existing stores/rows. No remote migration. Rollback should be code-compatible with the previous app version where feasible; do not destructively clear user ideas.
- **Observability:** No personal planning or savings values in logs or telemetry. If aggregate adoption metrics are used, record only non-identifying event counts after confirming existing analytics/privacy policy; otherwise defer instrumentation.

The approved design decisions are binding for implementation. Any change to local-only persistence, outbox scope, currency behavior, sensitive-data collection, savings cadence, or provider-link hosts requires an explicit update to this spec before implementation proceeds.

## Acceptance Criteria

All criteria must be objectively testable.

### Functional

- [ ] An authenticated user can create, read, update, and remove a local `TripIdea`; the idea remains after page reload and is absent from another user's isolated database.
- [ ] Origin accepts arbitrary reasonable free text without a region allowlist. Destination can be typed without network access; selecting an available destination suggestion fills the resolved location fields.
- [ ] A user can save future dates or a flexible target month, duration, traveler counts, one supported currency, notes, and interests without requiring a live quote. Currency defaults to supported profile `preferredCurrency`, or USD if missing/unsupported.
- [ ] A user can enter/edit/remove manual category estimates and manual price checks in the idea's single currency, with source/provider label and checked date. The UI labels them as user-entered and non-guaranteed.
- [ ] Saving current savings creates or updates exactly one `TripSavingsPlan` for the idea; removing an idea removes its plan in the same local transaction.
- [ ] Google Travel flight and hotel search links open only from explicit user action, use the approved encoded natural-language query, and do not accept arbitrary URLs. Missing origin/date fields are omitted and explained. Links do not imply booking or guaranteed price.
- [ ] The planner displays a category breakdown and an authoritative target cost without creating actual expenses or changing existing group expense totals; any difference between the target and entered categories is visibly labeled as remaining/unallocated or over-allocated.
- [ ] `TripSavingsPlan` stores current savings and cadence, not a computed contribution. For monthly cadence at least 30 days out, periods equal `max(1, differenceInCalendarMonths(tripStartDate, today))`; below 30 days the default is weekly with `max(1, ceil(remainingCalendarDays / 7))`, with a one-time option. Contribution equals the positive remaining target divided by periods, rounded up to a whole minor unit. It is zero when the target is met; missing target/date is actionable; a due-today/past target shows remaining amount due now. No income field or income-derived behavior exists.
- [ ] Converting an idea creates a normal Viatik trip and owner membership with the selected destination/date/traveler/currency details; creates its budget locally; stores `convertedToTripId`; and queues outbox INSERTs for the Trip and owner TripMember only. Repeating conversion routes to the same trip and creates no duplicates.
- [ ] Local planning values are not visible in shared trip views, shared links, feeds, or collaborator data. Converting an idea does not copy current savings or private-only notes into synced trip fields.
- [ ] Empty, validation-error, persistence-error, offline, and already-converted states have clear recovery actions.

### Authorization and security

- [ ] The feature is available only within the authenticated application.
- [ ] UI code reads/writes ideas only through the repository/application boundary; it never accesses Supabase domain tables.
- [ ] Wishlist and savings-plan writes are not added to Supabase, the outbox, shared feed, or notifications. The locally created TripBudget is not queued. Trip conversion queues only the regular Trip and owner TripMember mutations required by existing sync behavior.
- [ ] Provider navigation is restricted to verified Google Travel hosts; user-controlled text is encoded and cannot change host or protocol. Route/date disclosure appears before navigation.
- [ ] Monetary input is parsed and validated at the boundary; invalid, negative, over-limit, and unsupported-currency values cannot be persisted. All saved amounts in an idea use its single currency.
- [ ] No income/salary is requested, stored, logged, or transmitted; notes, budget totals, savings, and manual price history are excluded from outbound links. Only the explicitly selected route/date query may be sent.

### Reliability and offline behavior

- [ ] Idea CRUD and savings calculations work without network access after app shell load.
- [ ] Dexie upgrade tests cover opening an existing database at the prior schema version and preserve all existing trip, budget, and other data while creating the two new stores.
- [ ] Local idea and savings-plan writes are durable across reload/restart and follow current per-user database lifecycle semantics.
- [ ] Trip, owner membership, local TripBudget, conversion marker, and their relevant outbox rows commit or roll back together. A repeated conversion routes to the recorded trip; a network failure after commit is recovered by the existing outbox without duplicate trips.
- [ ] Missing or stale destination lookup and blocked/unavailable outbound navigation do not discard local edits.

### Accessibility and UX

- [ ] Create/edit forms and price/savings controls are keyboard operable, correctly labelled, and expose validation/status changes to assistive technology.
- [ ] Touch targets meet the existing 44×44px standard where applicable; focus rings and reduced-motion behavior follow the design system.
- [ ] Wishlist and planner are usable at supported mobile and desktop viewports, with progressive disclosure for detailed estimates.
- [ ] Private versus shared/actual money is clearly labeled; no estimate is visually presented as a confirmed fare, booking, or expense.

### Verification

- [ ] Unit tests cover validation, single-currency money parsing, calendar-month and weekly/lump-sum savings periods, rounding and due-date edges, Google query URL encoding/host allowlisting, and category totals.
- [ ] Dexie repository tests cover CRUD, live updates, unique savings-plan-per-idea behavior, local hard-delete cascading, persistence, and schema upgrade behavior.
- [ ] Conversion tests assert one transaction writes the Trip, owner membership, local TripBudget, idea marker, and only the valid Trip/TripMember outbox mutations; injected failure leaves no partial state.
- [ ] UI tests cover creation/editing, manual quote entry, offline/failure states, external-link disclosure, accessibility labels, and conversion feedback.
- [ ] An end-to-end test covers create idea → save manual prices → calculate savings → convert to trip → reload, including a repeated conversion action.
- [ ] Coverage for changed/critical code is at least 90%, or an exception is documented with rationale.
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass; `pnpm test:e2e` runs for the end-to-end flow where the environment supports it.
- [ ] QA Agent report is attached; Security Agent reviews local-data isolation, outbound link safety, and privacy behavior.

## Implementation Plan

1. Define the `TripIdea` and `TripSavingsPlan` Level C local contracts, supported single-currency rules, and pure savings-period/calculation helpers.
2. Write failing unit tests for validation, monthly/weekly/lump-sum arithmetic, minor-unit rounding, due-date boundaries, Google Travel query generation/host allowlisting, and trip-conversion retry behavior.
3. Add an additive Dexie version with `tripIdeas` and `tripSavingsPlans`, a unique savings-plan-per-idea index, repository interfaces/implementations, and tests proving those two stores never enqueue mutations.
4. Add the transaction-aware conversion use case. In one Dexie transaction create the Trip, owner TripMember, local TripBudget, `convertedToTripId`, and the Trip/TripMember outbox inserts; reuse existing Trip validation and membership construction behavior.
5. Build the wishlist, idea editor/planner, manual quote capture, external-link disclosure, cost breakdown, and savings sections using existing UI primitives and destination lookup.
6. Add UI and end-to-end tests; verify offline/reload/account isolation, privacy separation, transaction rollback/idempotency, mobile layout, keyboard access, and empty/failure states.
7. Run tests, lint, typecheck, build, and applicable E2E checks; complete QA and Security reviews and update this spec with evidence.

## Success Metrics

| Metric                                                                     |                       Baseline |                                                                  Target | Measurement method                                                                   | Owner          |
| -------------------------------------------------------------------------- | -----------------------------: | ----------------------------------------------------------------------: | ------------------------------------------------------------------------------------ | -------------- |
| Users who save an idea and later convert it to a trip                      |        Establish before launch | Set after a pilot; proposed initial signal: at least 15% within 30 days | Local aggregate funnel only if approved by privacy policy; otherwise opt-in research | Product        |
| Idea persistence/recovery success after reload                             |             Establish in tests |                              100% in deterministic repository/E2E tests | Automated tests; no personal values in telemetry                                     | Engineering    |
| Savings calculation correctness                                            |                    No baseline |                                         100% for covered boundary cases | Pure unit tests using integer minor units                                            | QA             |
| User understanding that prices are manual estimates, not guaranteed offers | Establish in usability testing |                          No observed critical misunderstanding in pilot | Moderated usability test                                                             | Product/Design |

## Risks and Open Questions

No unresolved product or architecture decisions remain for the approved Phase 1 scope. Revisit this section if implementation evidence requires changing an approved boundary.

- **Risk — local-only data loss:** Browser/app storage clearing and device changes can remove wishlist and savings data. Mitigation: disclose this limitation; evaluate export/backup only as a separately scoped follow-up.
- **Risk — transaction-aware conversion touches synced and local-only stores:** A partial write could leave a duplicate or incomplete conversion if the application bypasses the transaction boundary. Mitigation: use one Dexie transaction, reuse existing Trip validation/owner-membership rules, and test rollback plus repeated conversion.
- **Risk — provider links may not preserve every search field indefinitely:** Google may change query interpretation or route support. Mitigation: generate encoded natural-language queries, run unit tests and a manual smoke check, and fall back to a general search with truthful UI copy.
- **Risk — finite supported currency set:** Globally free-text destinations do not imply every currency is supported. Mitigation: inherit a supported profile currency or default to USD; do not infer currency from location or add FX conversion in Phase 1.
- **Risk — local-only is not equivalent to encrypted:** Values remain on the device in IndexedDB. Mitigation: collect only target/current-savings amounts, do not collect income, exclude private values from logs/links, and clearly describe device-local persistence.

## Completion Notes

- **Verification commands:** `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e`, and Prettier checks for changed files.
- **Verification results:** All checks passed; `pnpm test` passed 206 files / 1,312 tests, and `pnpm test:e2e` passed 2 Playwright tests. The Vacation Planner E2E flow covered idea creation, manual estimates/price capture, savings, conversion, retry, and reload. Awaiting manual local QA and independent Security review.
- **Bug-ledger updates:** Not applicable; no bug was discovered.
- **Follow-up work:** Perform manual responsive/keyboard QA at `/trips` → **Want to go**. Live provider APIs remain out of scope.
