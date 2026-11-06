# Feature Specification: Centralized Environment Validation

**Project:** Viatik  
**Owner:** Engineering  
**Status:** In Progress  
**Created:** 2026-11-06  
**Updated:** 2026-11-06  
**Related work:** Environment-variable audit

## What & Why

### What

Use the existing Zod-backed `env.mjs` module as the sole declaration point for
application secrets and required Supabase client settings. Add a small
runtime-independent Zod parser for Viatik-owned configuration consumed by
standalone scripts and tool configuration, then route owned consumers through
parsed values.

### Why

Unvalidated project configuration can fail later in network, crypto, or file
operations, and Zod's default issue reporting can include rejected input. A
single validated boundary should reject malformed values at startup without
printing secret contents or forcing framework-owned variables through the
application schema.

### Users and scenarios

- **Primary user:** Maintainers configuring Viatik for local development,
  production, mobile preview, and repository tooling.
- **Scenario 1:** A maintainer leaves optional provider keys and file overrides
  unset or blank; the existing offline/provider and repository-local fallback
  behavior remains available.
- **Scenario 2:** A maintainer supplies malformed URLs, origin allowlists,
  paths, or secrets; startup fails with the affected variable name and no value.
- **Offline or degraded-network behavior:** Not applicable; validation is local
  startup/configuration and does not add a network dependency.

## Audit Scope and Ownership

The requested 61-finding export was not present in the tracked main worktree.
The implementation audit therefore inventories tracked runtime/config sources,
tests, and Supabase Edge Function environment boundaries; generated output,
worktrees, dependencies, and other excluded paths are not modified.

| Finding family | Ownership / treatment |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_MAPS_API_KEY`, `AI_SCOUT_ENDPOINT`, `AI_SCOUT_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `QR_SIGNING_SECRET`, and Twilio settings | Viatik application secrets/configuration already declared in `env.mjs`; retain current optionality and add schema/startup/redaction coverage. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Viatik-required public settings already declared in `env.mjs`; retain required behavior and client exposure only for these explicitly public values. |
| `SMS_PROVIDER_API_KEY` | Viatik-reserved optional setting already declared in `env.mjs`; no tracked runtime consumer exists. Keep the existing optional declaration for compatibility; do not add behavior. |
| `SKIP_ENV_VALIDATION` | Viatik bootstrap switch; validate its supported string-boolean values before passing the result to `createEnv`. `NODE_ENV` remains a Node/Next runtime input. |
| `VIATIK_DELEGATION_FILE`, `VIATIK_TEST_HEALTH_FILE`, `VIATIK_USAGE_LOG`, `SECRETS_PASSWORD` | Viatik-owned standalone tooling inputs; validate in a small shared parser that does not require application/Supabase credentials. |
| `CAPACITOR_SERVER_URL`, `SERVER_ACTIONS_ALLOWED_ORIGINS` | Viatik-defined configuration consumed by Capacitor/Next config, not variables supplied by those frameworks; validate and preserve their current defaults/transforms. |
| `CI`, `PLAYWRIGHT_BASE_URL`, `NODE_ENV` | CI-provider, Playwright, and Node/Next-owned runtime inputs; leave with their existing consumers and do not put them in the application schema. |
| `process.env` in test fixtures and agent skill examples | Test/documentation inputs, not production configuration; leave unchanged. |
| Supabase Edge Function `env(name)` reads | Deno/Supabase runtime boundary rather than Node `process.env`; retain the function-local checks for required service credentials, webhook secrets, and optional provider keys. |
| `AUTH_SESSION_SECRET` and `NEXT_PUBLIC_WEBAUTHN_*` documented in `.env.example` | No tracked runtime consumer was found; do not invent schemas or required settings for unused values. |
| Next.js, Node.js, Vercel, Babel, Capacitor internals, third-party dependencies, `.next`, `.worktrees`, and `node_modules` findings | Excluded by scope; do not modify or attempt to validate all runtime/framework variables through Viatik's application schema. |

## In Scope

- Keep all currently consumed application-owned variables declared in the
  existing server/client Zod schemas.
- Treat empty optional application secrets as unset while keeping required
  public Supabase values required.
- Validate URL, secret-length, boolean bootstrap, origins, and path inputs
  without logging or echoing values.
- Add a standalone parser for Viatik-owned tooling/config variables that can
  load without application Supabase credentials.
- Replace owned direct reads in the three `.ai/infra/scripts/*.mjs` scripts,
  `bin/secrets.mjs`, `capacitor.config.ts`, `next.config.ts`, and the Scout
  server action with validated values.
- Preserve existing URL defaults, origin splitting/trim behavior, path
  fallback locations, secret optionality, and offline/provider fallback.
- Document supported settings and ownership in the README and project
  context/memory. Keep invoking-process-only tool overrides out of `.env.example`
  because standalone tools do not load `.env.local`.
- Re-run a tracked-source audit and report framework/dependency exclusions.

## Out of Scope

- Validating `NODE_ENV`, `CI`, or Playwright-owned `PLAYWRIGHT_BASE_URL` through
  the Viatik application schema.
- Modifying Next.js, Node.js, Vercel, Babel, Capacitor, Supabase, or other
  dependency internals.
- Modifying `.next`, `.worktrees`, `node_modules`, or generated output.
- Changing routes, UI copy, domain behavior, Dexie/Supabase schema, RLS,
  migrations, or sync.
- Making currently optional provider credentials required.
- Adding environment declarations for documented-but-unused settings.

## Constraints and Design

- **Architecture boundaries:** `env.mjs` remains the server/client-aware
  application entry point. `lib/config/runtime-env.mjs` exposes only parsed
  Viatik tool/config values so standalone Node scripts do not import the
  application schema.
- **Data ownership:** No domain data, Dexie tables, Supabase tables, migrations,
  RLS policies, mappers, or sync entities are affected.
- **Security requirements:** `env.mjs` reports invalid variable names only;
  Zod issue input, key material, and passwords are never logged. Server secrets
  remain in the `server` schema and are not added to client exports.
- **Compatibility:** No new dependency. ESM scripts/configs use the shared
  `.mjs` parser. Next.js loads `.env*` files before server modules; the Scout
  action uses the already-validated `env` values instead of reparsing
  `.env.local`.
- **Environment defaults and parsing:**
  - Empty optional provider keys and file overrides behave as unset.
  - Required public Supabase URL/key remain required; a blank value is invalid.
  - `AI_SCOUT_ENDPOINT` and `CAPACITOR_SERVER_URL` accept HTTP(S) URLs only;
    the latter defaults to `http://localhost:3000`.
  - `SKIP_ENV_VALIDATION` accepts only `"true"` or `"false"` when set; tests
    continue to skip application env validation when `NODE_ENV === "test"`.
  - `SERVER_ACTIONS_ALLOWED_ORIGINS` remains comma-separated, trimmed, and
    ignores blank entries while rejecting malformed nonblank entries.
  - `VIATIK_*_FILE` values remain optional; unset/blank uses each existing
    repository-local fallback. Nonblank paths remain caller-selected paths.
  - `SECRETS_PASSWORD` remains optional; blank retains the current prompt/TTY
    behavior and a supplied passphrase is never normalized or logged.
- **SOLID/design decisions:** Application environment validation stays
  separate from standalone tool parsing; neither schema reads unrelated
  framework variables.
- **Migration/rollback plan:** No data migration. Revert schema and consumer
  changes together if a supported tool cannot import the shared `.mjs` module.
- **Observability:** Invalid application configuration identifies variable
  names only. No values, Zod `input` fields, or secrets are emitted.

### Removal / relocation inventory

- **Requested relocation:** Move direct reads of Viatik-owned variables in
  application/tool source into the shared validated modules.
- **Requested fallback relocation:** Remove Scout's handwritten `.env.local`
  key parser; Next.js already loads `.env.local` before the server action
  imports `env.mjs`, so the validated `env` remains the supported source.
- **Adjacent / not authorized:** No other `process.env` references, test
  fixtures, docs examples, tool/framework settings, routes, or behavior are
  removed or redefined.

## Acceptance Criteria

### Functional

- [x] Every consumed Viatik-owned configuration value has one Zod declaration
  in the appropriate shared schema.
- [x] Empty optional values preserve the current optional/fallback behavior;
  required public Supabase values fail clearly when missing or malformed.
- [x] Invalid configured URLs, secret lengths, origins, and boolean flags fail
  at the configuration boundary.
- [x] Existing provider fallback, local paths, URL defaults, and origin
  normalization remain unchanged.
- [x] Application modules and Viatik scripts no longer read their owned
  variables directly from `process.env` outside the validation boundary.

### Authorization and security

- [x] Server secrets remain server-only; only existing `NEXT_PUBLIC_*` values
  are available to client code.
- [x] Validation output identifies invalid variable names without including
  secret values or raw Zod issue inputs.
- [x] Framework/platform-owned variables are not forced through the app schema.

### Reliability and offline behavior

- [x] No domain persistence, sync, remote API, or offline behavior changes.
- [x] Standalone scripts and configuration parsers run without Supabase
  credentials.

### Accessibility and UX

- Not applicable; no user-facing UI or interaction changes.

### Verification

- [x] Add parser tests for valid, missing, malformed, optional, and default
  values.
- [x] Add startup-boundary tests for required values, malformed settings, and
  secret-safe errors.
- [x] Relevant infra-script and Scout action suites pass.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and an isolated production
  build pass. (The isolated build used webpack to avoid touching repository
  `.next`; see completion evidence.)
- [x] `pnpm agent:schema` and `pnpm agent:audit-i18n` pass (no domain/schema or
  copy changes are expected).
- [x] A final source audit documents remaining framework/test/Edge-runtime
  findings and confirms all in-scope owned reads use validated values.

## Implementation Plan

1. Agree on the schema/parser and startup-test seams.
2. Add failing tests for shared runtime parsing and application startup errors.
3. Implement the safe application env validation and standalone runtime parser.
4. Route Viatik-owned consumers through validated values; keep external runtime
   variables unchanged.
5. Update environment documentation, spec evidence, and memory.
6. Run the focused and full verification gates and repeat the source audit.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Raw reads of Viatik-owned settings outside validation | Multiple | 0 | Tracked-source audit | Engineering |
| Environment parser/startup tests | No dedicated tests | Defaults, malformed and secret-safe paths covered | Vitest | Engineering |
| Exposed validation values | Potential raw Zod issue logging | No secret/input values in logs | Startup regression test | Engineering |

## Risks and Open Questions

- **Risk:** The initial audit references 61 findings, but no 61-row report was
  present in the tracked main worktree; this spec records the source inventory
  available here and excludes protected/generated paths as requested.
- **Question:** None for the implementation scope; test seams are proposed in
  the accompanying implementation plan for review before tests are added.

## Completion Notes

- **Verification commands:** `pnpm agent:verify`, focused `pnpm exec vitest run`
  suites, `pnpm agent:schema`, `pnpm agent:audit-i18n`, `pnpm agent:infra`,
  `pnpm agent:drift`, `pnpm exec playwright test --list`,
  `pnpm exec cap config`, and isolated `next build --webpack`.
- **Verification results:** `agent:verify` passed (259 files; 1,765 passed,
  3 skipped); focused tests passed (57); schema, i18n, and infra checks passed;
  drift check passed with one pre-existing accepted symbol-name finding;
  Playwright listed 2 tests; Capacitor resolved `http://localhost:3000`; the
  isolated production build generated all 21 routes. Default Turbopack in the
  `/tmp` copy could not resolve the external `node_modules` symlink; it did not
  touch the main worktree's `.next`.
- **Bug-ledger updates:** Not applicable; no domain bug invariant is changed.
- **Follow-up work:** Reconcile this source inventory against the original
  61-finding export if it becomes available; no copy of that report was found
  in the tracked main worktree.
