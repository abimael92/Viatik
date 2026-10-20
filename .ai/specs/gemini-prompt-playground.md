# Feature Specification: Gemini Prompt Playground

**Project:** Viatik  
**Owner:** Abimael Garcia  
**Status:** Ready for QA  
**Created:** 2026-10-20  
**Updated:** 2026-10-20  
**Related work:** AI Activity Scout

## What & Why

Add a small authenticated prompt playground at `/gemini` to demonstrate a secure
server-side integration with Google's Gemini API. A signed-in user submits a
bounded text prompt and sees the generated text response.

## In Scope

- A responsive client form with prompt input, loading, error, and response states.
- An authenticated Next.js Server Action that validates input and calls Gemini
  without exposing the API key.
- A type-safe server-only `GEMINI_API_KEY` environment variable.
- Focused action and component tests.

## Out of Scope

- Persisting prompts or responses, adding AI tools, or using Gemini output to
  mutate domain data.
- Anonymous access, streaming responses, rate limiting, or provider fallback.

## Constraints and Design

- **Architecture:** Use an App Router page under the authenticated `(app)` route
  group, a Client Component in `features/ai/components`, and a Server Action in
  `app/actions`.
- **Data ownership:** This playground does not read or write domain data; it
  sends only the submitted prompt to Google's API.
- **Security:** Require an authenticated user in the action, validate and cap the
  prompt length server-side, keep the API key in a non-public env var, use a
  request timeout, return generic provider failures, and do not log prompt text
  or secrets.
- **Model:** Use `gemini-1.5-flash` as requested. Confirm model availability in
  the Google AI project before production use.
- **UI:** Compose existing Button/Card/Label primitives and render model text as
  escaped React text, never as HTML.
- **Offline:** Explain failure and preserve the entered prompt; generation
  requires network access.

## Acceptance Criteria

- [x] The authenticated `/gemini` page renders a labeled prompt form.
- [x] Empty and over-limit prompts are rejected before calling Gemini.
- [x] Unauthenticated Server Action calls do not reach Gemini.
- [x] The API key is read only server-side and is not returned to the client.
- [x] The client communicates loading, errors, and generated text accessibly.
- [x] Tests cover validation, authentication, provider success/failure, and UI
  response/error states.

## Verification

Run the focused Vitest suites, full `pnpm test`, `pnpm typecheck`, `pnpm lint`,
and `pnpm build`. Record actual results in Completion Notes.

## Completion Notes

- **Verification results:** Focused Gemini tests passed (2 files / 6 tests);
  full `pnpm test` passed (212 files / 1,331 tests); `pnpm typecheck`,
  `pnpm lint`, `pnpm build`, and `git diff --check` passed.
- **Security review:** Independent Security Agent review pending. The action
  authenticates, validates prompt size, uses a server-only key, limits the
  upstream request duration, and returns generic provider errors. No live Gemini
  request was made.
- **Follow-up work:** Verify that the requested `gemini-1.5-flash` model remains
  available in the Google AI project; add a persistent rate limiter before broad
  production exposure.
