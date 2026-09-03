# [PROJECT_NAME] Product Roadmap

**Purpose:** Record the MVP must-haves, deferred V2 good-to-haves, and the highest-risk architecture challenges to mitigate while coding.
**Governance:** [`constitution.md`](./constitution.md) and [`AGENTS.md`](./AGENTS.md)
**Workflow entry point:** [`llms.txt`](./llms.txt)

> The roadmap is a planning reference. It is not a substitute for a feature specification. Before implementing any item, create a spec from [`templates/feature-spec.md`](./templates/feature-spec.md) and record defects in [`specs/bug-ledger.md`](./specs/bug-ledger.md).

## MVP Must-Haves

The MVP is considered production-ready only when a traveler can complete all of the following:

1. Authenticate securely on a mobile browser with Passkey/WebAuthn and an OTP fallback.
2. Open and use a synchronized trip with no network connection.
3. Create, edit, reorder, and review itinerary items offline.
4. Collaborate with other trip members when connectivity returns.
5. Track expenses and understand settlement balances.
6. Access essential trip media and documents offline.
7. Recover safely from conflicts, failed sync, refreshes, and interrupted uploads.
8. Use the application accessibly across modern mobile and desktop browsers.

### Core rules

- **Dexie (IndexedDB) is the local domain source of truth.**
- **Supabase is the remote synchronization target.**
- **UI components never query the remote database directly.**
- **Zustand holds only ephemeral UI state.**
- **Security, offline behavior, and accessibility are release requirements.**

## V2 Good-to-Haves (Deferred)

Defer this work until the local data model, sync engine, permission system, and core itinerary flows are stable.

### Collaboration

- Presence indicators and live editing cursors.
- Activity-level change history with restore.
- Conflict comparison UI for high-value fields.
- Mentions and notifications.
- Push/email notification preferences.
- Granular per-section or per-day permissions.
- Trip activity feed.

### Planning and itinerary

- Calendar integration and ICS export.
- Automatic itinerary suggestions.
- Travel-time-aware scheduling and route optimization.
- Reservation reminders and countdowns.
- Weather forecasts attached to activities.
- Trip templates and import from bookings.
- Public read-only itinerary links.
- Time-zone-aware itinerary display.

### Maps and location

- Offline map tile packs and geocoding for accessed places.
- Route estimates for walking, driving, and transit.
- Saved places and destination guides.
- Distance/travel-time warnings between activities.

### Finance

- Live exchange-rate integrations with cached rates.
- Settlement optimization and money-transfer integrations.
- Receipt scanning and OCR.
- Expense categories, analytics, and budget alerts.
- CSV/PDF export and accounting integration.

### Media and documents

- Background and resumable uploads.
- Duplicate detection and auto-grouping.
- OCR for tickets and reservations.
- Video support and end-to-end encrypted private media.
- Automatic offline-pack creation per trip.

### Logistics and personalization

- Packing templates and weather-aware suggestions.
- Item ownership, quantity, and shared shopping lists.
- Complete trip import/export.
- Localization and right-to-left support.
- PWA enhancements, background sync, and push.
- Native mobile applications.

### Intelligence

- AI itinerary drafts and categorization.
- Natural-language expense entry.
- Trip summarization and packing recommendations.
- Privacy controls and data minimization before any AI features.

## Architecture Risk Assessment

### Risk 1: Offline sync race conditions and conflicting mutations

Duplicate records, lost edits, stale overwrites, and resurrected deletes can occur during retries or simultaneous Realtime events.

**Mitigation:**

- Assign a unique mutation ID to every local mutation.
- Use explicit version/timestamp metadata and idempotent server handling.
- Store outbox state transitions atomically in Dexie.
- Serialize replay per trip or entity where ordering matters.
- Route incoming Realtime changes through the same reconciliation path as sync responses.
- Use tombstones for deletes and deterministic conflict tests.

### Risk 2: Drag-and-drop ordering and index collisions

Integer `order_index` values collide when multiple clients reorder offline or insert between the same two activities.

**Mitigation:**

- Use stable activity IDs independently from ordering metadata.
- Prefer sortable rank keys over naive contiguous integers.
- Treat a move as an atomic operation with source, destination, and intended rank.
- Compact ranks deterministically and resolve concurrent reorders with version metadata.
- Provide explicit move controls for keyboard and accessibility users.

### Risk 3: Data integrity and authorization across Dexie, Supabase, and Storage

Mismatches between client assumptions, service logic, RLS, and Storage policies can cause unauthorized access, viewer writes, or invalid data.

**Mitigation:**

- Treat Dexie as a cache/local working store, not an authorization boundary.
- Enforce membership and roles through Supabase RLS and Storage policies.
- Validate all mutations at service and database boundaries.
- Test RLS with owner, editor, viewer, removed-member, and unauthenticated identities.
- Version Dexie schemas with forward-compatible migrations.
- Use integer minor units and transactions for monetary data.
- Define stale-local-data behavior after access is revoked.

## Release Gates

Do not release broadly until:

- Authentication and session handling are secure and tested.
- RLS and Storage policies are tested for every membership role.
- Core trip functionality works offline after synchronization.
- Outbox mutations survive refresh and restart.
- Duplicate, delayed, and conflicting sync events are deterministic.
- Activity ordering works across devices and offline transitions.
- Expense splits and settlements have comprehensive tests.
- Essential media and tickets are explicitly available offline.
- Critical flows pass mobile, keyboard, and accessibility testing.
- Production monitoring, backups, migrations, rollback, and incident procedures exist.
- CI verifies type safety, tests, builds, dependency risk, and secrets.
