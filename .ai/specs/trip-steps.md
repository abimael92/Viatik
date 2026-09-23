# Feature Specification: Native Health Steps Integration

**Project:** Viatik  
**Owner:** Viatik Product  
**Status:** Native integration scaffold  
**Created:** 2026-09-22  
**Updated:** 2026-09-22  
**Related work:** `lib/health/health-service.ts`

## What & Why

Viatik's active-trip Overview exposes a Walking Steps widget. The initial release accepted manual daily counts locally. The native mobile release adds opt-in background collection through the platform health stores while preserving local-first ownership and the existing `DailyStepCount` model.

Native health data is sensitive. Viatik must request only the steps read permission required for this feature, explain the purpose before the system prompt, and keep raw health data on the device unless the traveler explicitly opts into a separately designed remote-sync feature.

## Users and scenarios

- **Primary user:** A signed-in traveler using the native iOS or Android application.
- **Permission onboarding:** Before requesting access, the app explains that steps are used to show daily movement for the selected trip, identifies the permission being requested, and provides a continue/cancel choice.
- **Authorized collection:** After consent, the app reads daily step totals in the background, normalizes them, and stores them in the local Dexie database.
- **Denied or unavailable access:** The app keeps the manual/local experience available, explains that health access was not enabled, and provides a route to platform settings where supported. It must not repeatedly prompt after a denial without an explicit user action.
- **Offline behavior:** Native reads and local writes continue without network access. No remote request is required to display or save a local health-derived count.

## Platform integration

### iOS — Apple HealthKit

- Use HealthKit step-count read authorization only; do not request write access unless a future specification requires it.
- Aggregate `stepCount` samples by the user's local calendar day and trip date range.
- Use anchored queries for incremental/background collection. The iOS adapter owns the HealthKit anchor and observer/query lifecycle; anchors are private implementation state and are not part of the domain payload.
- Handle restricted, denied, unavailable, and revoked authorization states distinctly enough for the UI to provide actionable guidance.
- The iOS native target must include the HealthKit capability and the required usage description in the native project configuration as a follow-up implementation step.

### Android — Health Connect

- Request the Health Connect read permission for steps only.
- Aggregate `StepsRecord` data by the user's local calendar day and trip date range.
- Use Health Connect changes/incremental APIs where available for background refresh, while treating missing, revoked, or unavailable Health Connect access as a normal user-facing state.
- The Android native target must declare the Health Connect permission and provide the required rationale/settings handoff as a follow-up implementation step.

## Normalized local contract

Platform adapters must return only an aggregate daily payload:

```ts
interface DailyHealthSteps {
  dayDate: string; // ISO calendar day, YYYY-MM-DD
  steps: number;   // integer, 0 through 200,000
}
```

`HealthService` validates this payload and maps `dayDate` and `steps` through the existing `DailyStepCountRepository.upsert()` boundary. The resulting record remains the existing local `DailyStepCount` shape, including user/trip scoping and repository-managed IDs and timestamps. Native adapters must never pass raw HealthKit samples, Health Connect records, device identifiers, or permission tokens into Dexie or UI state.

Dexie remains the local domain source of truth. This scaffold does not add a Dexie table/version, alter the existing database schema, add an outbox entity, or introduce Supabase writes.

## Privacy and permissions UX requirements

- Explain **why** Viatik needs steps, what date range is read, and that the feature is optional before showing a native permission prompt.
- Request the minimum read permission: daily step counts only. Never request unrelated health categories.
- Treat denial, restricted access, revoked access, missing HealthKit, and missing Health Connect as expected states—not application errors.
- Keep manual entry available when native access is denied or unavailable.
- Do not block trip planning, itinerary use, or other app features on health permission.
- Provide a visible permission status and an explicit retry/settings action. Do not loop prompts or infer consent from a failed query.
- Do not log raw samples, daily totals, health-store errors containing health details, or permission tokens. Analytics must not include step values.
- Raw health data and normalized local records stay on the device by default. Any future remote synchronization requires a separate opt-in, explicit consent copy, documented data minimization, authorization rules, and a new specification. This task introduces no remote health sync.
- Clear local health-derived records when the user uses a future “delete local health data” control; account deletion behavior must be specified separately.

## In Scope for this scaffold

- Capacitor iOS and Android shells using a hosted Next.js server through `CAPACITOR_SERVER_URL` (defaulting to `http://localhost:3000` in development).
- A provider interface for platform adapters.
- `requestPermissions()`, `queryDailySteps(date)`, and `syncToDexie()` in `lib/health/health-service.ts`.
- Validation and local repository writes through the existing `DailyStepCountRepository` boundary.
- Documentation of native permission and privacy behavior.

## Out of Scope for this scaffold

- HealthKit or Health Connect plugin selection and native bridge implementation.
- Background task registration, anchored-query persistence, HealthKit observers, or Health Connect change-token persistence.
- Changes to the Dexie schema, existing repository contract, Supabase schema, outbox, or remote synchronization.
- Automatic collection in the browser/PWA.
- Distance, calories, goals, workouts, or other health categories.

## Architecture and security constraints

- **Local-first:** Dexie is the only domain write target for this feature. Supabase remains a remote synchronization/authorization target and is not touched by the health service.
- **Boundary:** `HealthProvider` adapters own platform APIs. `HealthService` validates normalized aggregates and delegates persistence to `DailyStepCountRepository`.
- **Authorization:** Every local write is scoped by the active `userId` and `tripId`; repository validation remains authoritative for trip date bounds and step limits.
- **Validation:** Accept only ISO day keys and integer steps from 0 through 200,000. Reject mismatched provider dates and invalid values before persistence.
- **Privacy:** Raw platform records never leave the adapter boundary and are never logged.
- **Compatibility:** Capacitor 8 hosted WebView, Next.js 16 server rendering, React 19, TypeScript strict, iOS HealthKit, and Android Health Connect.

## Acceptance criteria

### Functional

- [ ] A native iOS adapter can request steps read permission and report authorized, denied, restricted/unavailable states without crashing.
- [ ] A native Android adapter can request Health Connect steps read permission and report unavailable/denied states without crashing.
- [ ] iOS daily reads use anchored/incremental query semantics owned by the iOS adapter.
- [ ] Android daily reads use Health Connect aggregate/change semantics owned by the Android adapter.
- [x] The shared health service exposes permission, daily query, and Dexie sync methods.
- [x] Normalized native payloads are validated and persisted through the existing local repository boundary.
- [ ] Background refresh updates local daily records without requiring a network connection.
- [x] The Walking Steps widget reads local records only and shows a native-permission placeholder when no daily record is available.

### Privacy and security

- [ ] Permission rationale precedes each first native permission request.
- [ ] Only steps read permission is requested.
- [ ] Denials are handled gracefully with an explicit settings/retry path and no prompt loop.
- [x] This scaffold performs no Supabase or remote health-data synchronization.
- [x] Raw health samples and values are not logged by the health service.

### Verification

- [ ] Unit tests cover provider permission states, invalid normalized payloads, date mismatches, and repository writes.
- [ ] Native tests cover HealthKit authorization/query behavior and Health Connect permission/query behavior.
- [ ] `pnpm build:web`, Capacitor sync, hosted-WebView smoke checks, lint, typecheck, and the relevant test suites pass.

## Implementation plan

1. Keep the Capacitor shell configured for the hosted Next.js WebView and verify the configured server URL.
2. Implement platform adapters behind `HealthProvider`; persist iOS anchors and Android change tokens in native-private storage.
3. Add unit tests for `HealthService` and adapter contract behavior.
4. Add permission rationale/settings UI and native capability declarations.
5. Wire background refresh to the active user's local database without adding remote health sync.
6. Run native simulator/device privacy, denial, offline, and background-refresh QA.

## Risks and follow-up

- The hosted WebView requires a reachable Next.js server; production deployments must provide `CAPACITOR_SERVER_URL` and native networking/security configuration appropriate to that host.
- HealthKit and Health Connect availability varies by device, OS version, account state, and user settings. All unavailable states must remain non-blocking.
- Anchors/change tokens are platform-specific and must never be synchronized as user domain data.
