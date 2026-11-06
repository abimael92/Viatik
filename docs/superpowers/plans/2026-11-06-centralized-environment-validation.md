# Centralized Environment Validation Implementation Plan

> **For agentic workers:** Use the native execution path in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate Viatik-owned application and tooling environment values at startup without changing defaults, leaking secrets, or validating framework-owned variables through the app schema.

**Architecture:** Keep `env.mjs` as the existing Next-aware application schema and add a narrow pure `.mjs` parser for Viatik-owned standalone/tool configuration. Consumers use the validated exports; `NODE_ENV`, `CI`, Playwright-owned settings, tests, and Deno/Supabase runtime reads remain at their current runtime boundaries.

**Tech Stack:** Zod 4, `@t3-oss/env-nextjs`, ESM `.mjs`, TypeScript, Next.js, Capacitor, Vitest.

**Spec:** `.ai/specs/environment-validation.md`

## Global Constraints

- Do not modify `.next`, `.worktrees`, `node_modules`, generated files, or third-party dependencies.
- Keep currently optional provider variables optional and required Supabase public configuration required.
- Do not log variable values or Zod issue `input` values.
- Keep application secrets in the server schema; client exposure is limited to existing `NEXT_PUBLIC_*` values.
- Do not validate `NODE_ENV`, `CI`, or `PLAYWRIGHT_BASE_URL` through the Viatik schema.
- Do not add dependencies or change domain, Dexie, Supabase schema, sync, or UI behavior.

## Implementation Ruling

- **Ruling:** `runtime-env.mjs` exposes parse functions rather than an eagerly
  evaluated singleton. The secrets CLI parses only `SECRETS_PASSWORD` and does
  not validate unrelated Capacitor/origin/path settings; this preserves the
  CLI's standalone boundary. Cost if wrong: each consumer must explicitly call
  its parser at startup rather than importing a pre-parsed singleton.
- **Ruling:** Keep process-only tool overrides out of `.env.example`; standalone
  scripts/config do not load `.env.local`, so listing them there would imply
  automatic loading that does not happen. The README documents their exports.
  Cost if wrong: maintainers may prefer a shell-template rather than README
  documentation.

## Review Focus

- **Unset vs blank:** optional provider values and path overrides treat empty strings as unset; required public Supabase values remain invalid when blank.
- **Malformed secrets:** short QR signing material fails validation without echoing the rejected value.
- **Startup redaction:** application env validation reports the key name only; test through an isolated child process.
- **Standalone consumers:** infra scripts and `bin/secrets.mjs` parse only their needed schema and run without Supabase credentials.
- **Runtime ownership:** framework, test-runner, CI-provider, and Deno/Supabase env reads remain outside the app schema.

---

### Task 1: Pin parser and startup behavior with tests

**Files:**
- Create: `lib/config/runtime-env.test.ts`
- Create: `env.test.ts`
- Modify: `.ai/infra/scripts/delegate.test.mjs`
- Modify: `.ai/infra/scripts/test-health.test.mjs`
- Modify: `.ai/infra/scripts/usage-log.test.mjs`
- Modify: `app/actions/scout-trip-ideas.test.ts`

**Interfaces:**
- Tests exercise pure `parseRuntimeEnv(source?: Record<string, string | undefined>)` and `parseSecretsToolEnv(source?: Record<string, string | undefined>)`.
- Startup tests import `env.mjs` in a child Node process with controlled environment and assert missing/malformed key names without echoed values.
- Existing infra suites remain public behavior seams for path overrides and fallbacks.

- [x] Write tests for valid URLs/origins/paths, defaults, empty optional values, malformed values, and optional secret-password input.
- [x] Write startup tests for missing required Supabase public configuration and malformed optional app settings; assert a sentinel secret does not appear in stdout/stderr.
- [x] Confirm existing script/action suites cover consumer behavior; no redundant tests added.
- [x] Run focused tests and confirm new assertions fail before implementation.

### Task 2: Harden the application environment boundary

**Files:**
- Modify: `env.mjs`
- Test: `env.test.ts`

**Interfaces:**
- Keep `env` as the `createEnv` result and preserve its server/client split.
- Add a safe validation-error callback that emits variable names only.
- Parse `SKIP_ENV_VALIDATION` with an explicit `"true" | "false"` Zod boundary while retaining the `NODE_ENV === "test"` bypass.

- [x] Make empty optional values behave as unset without weakening required public Supabase fields.
- [x] Enforce QR secret byte-length semantics from its existing comment.
- [x] Ensure malformed values fail at import/startup and custom error handling never logs raw issue objects or values.
- [x] Run `pnpm exec vitest run env.test.ts` (18 tests passed with parser suite).

### Task 3: Add isolated Viatik runtime/tool parsing

**Files:**
- Create: `lib/config/runtime-env.mjs`
- Test: `lib/config/runtime-env.test.ts`

**Interfaces:**
- Export `parseRuntimeEnv(source?: Record<string, string | undefined>)` and `parseSecretsToolEnv(source?: Record<string, string | undefined>)`.
- Validate `CAPACITOR_SERVER_URL` as an HTTP(S) URL with the existing localhost default.
- Normalize `SERVER_ACTIONS_ALLOWED_ORIGINS` by splitting commas, trimming, and dropping blanks; reject malformed nonblank entries.
- Validate optional `VIATIK_*_FILE` paths and optional `SECRETS_PASSWORD`, treating blank values as unset.
- Do not read app-required Supabase credentials in this module.

- [x] Implement only after Task 1 demonstrates the parser tests fail.
- [x] Run `pnpm exec vitest run lib/config/runtime-env.test.ts` (9 parser tests passed).

### Task 4: Route owned consumers through validated configuration

**Files:**
- Modify: `.ai/infra/scripts/delegate.mjs`
- Modify: `.ai/infra/scripts/test-health.mjs`
- Modify: `.ai/infra/scripts/usage-log.mjs`
- Modify: `bin/secrets.mjs`
- Modify: `capacitor.config.ts`
- Modify: `next.config.ts`
- Modify: `app/actions/scout-trip-ideas.ts`

**Interfaces:**
- Standalone consumers import only from `lib/config/runtime-env.mjs`.
- Scout provider selection uses `env.GEMINI_API_KEY` and `env.OPENAI_API_KEY`; Next.js `.env*` loading remains the only file-loading path.

- [x] Replace only the owned raw reads identified in the spec.
- [x] Preserve fallback file paths, optional providers, sender defaults, and server-action origin normalization.
- [x] Leave `CI`, `PLAYWRIGHT_BASE_URL`, `NODE_ENV`, and Deno/Supabase runtime reads unchanged.
- [x] Run relevant infra, env, and Scout suites plus Playwright config listing and Capacitor config inspection (57 tests; 2 E2E tests listed; Capacitor default resolved).

### Task 5: Document ownership and verify the complete change

**Files:**
- Modify: `.ai/CONTEXT.md`
- Modify: `README.md`
- Modify: `memory/MEMORY.md`
- Modify: `.ai/specs/environment-validation.md`

- [x] Document only Viatik-owned settings and their defaults in README/context; do not add secrets or new required values.
- [x] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, an isolated production build, `pnpm agent:schema`, and `pnpm agent:audit-i18n`.
- [x] Re-run a tracked-source environment access audit and record the final classification, including exclusions.
- [x] Inspect `git diff --check` and `git status --short`; ensure `.worktrees`, `.next`, and dependency/generated paths remain untouched.

## Final Review

- Self-review completed; no unresolved implementation findings. The original
  61-row audit export was unavailable, so exact reconciliation remains a
  follow-up. No subagent reviewer was used.
- Final `pnpm agent:verify`: 259 test files passed; 1,765 passed, 3 skipped.
- Isolated production build with webpack generated all 21 routes without
  modifying the repository `.next`.
