# Feature Specification: Password reset

**Project:** Viatik  
**Owner:** Viatik  
**Status:** Complete  
**Created:** 2026-09-25  
**Updated:** 2026-09-25  
**Related work:** None

## What & Why

### What

Signed-out people can request a password reset from the sign-in screen. If the email matches an account, Supabase sends a one-time link. Opening the link proves control of the inbox, then the person chooses a new password.

### Why

Email-and-password is the primary sign-in. Without a reset path, a forgotten password locks the account.

### Users and scenarios

- **Primary user:** A traveler who already has a Viatik account and no longer knows the password.
- **Scenario 1:** Given the sign-in screen, when they choose Forgot password and submit an email, then they see a confirmation that does not reveal whether that email has an account.
- **Scenario 2:** Given a valid reset link, when they choose a password that meets the registration rules, then the password is replaced and they continue into the app on this device.
- **Offline or degraded-network behavior:** Reset requires Supabase Auth and email delivery. The form shows a clear failure when the network or mail provider rejects the request.

## In Scope

- Forgot-password entry on the sign-in form and a `/forgot-password` request screen.
- Server action that asks Supabase to email a recovery link to `/auth/confirm`.
- Confirmation route treats recovery links as a password reset, not as a normal sign-in.
- `/reset-password` screen to validate and save a new password.
- English and Spanish copy.
- Tests for the request, the confirmation redirect, and the password update.

## Out of Scope

- Changing a password from Settings while already signed in.
- SMS or passkey reset.
- A database migration. Passwords stay in Supabase Auth.
- Sending mail from the app itself. Delivery stays in Supabase.

## Constraints and Design

- **Architecture boundaries:** UI calls server actions in `app/actions/auth.ts`. Those actions call the Supabase server client. No domain table is read or written for the password itself.
- **Data ownership:** Supabase Auth owns the credential. Dexie is not involved.
- **Security requirements:**
  - Validate email and password on the server.
  - Use the same password rules as registration: at least 8 characters, an uppercase letter, a lowercase letter, and a number, and at most 72 characters.
  - Do not reveal whether an email is registered.
  - Do not log the email, password, or reset token.
  - Accept a new password only after the confirmation route has set a short-lived httpOnly recovery cookie. A normal signed-in session cannot call the update action.
  - After a successful change, sign out other sessions.
  - Reset links must use the existing `/auth/confirm` allow-listed redirect. `next` stays a same-origin path.
- **Compatibility:** Works with the current `@supabase/ssr` PKCE flow and with a recovery email template that passes `token_hash` (works when the link is opened on another device).
- **SOLID/design decisions:** Request and update are separate actions. The recovery cookie is the authorization boundary between "proved inbox control" and "may set a password."
- **Migration/rollback plan:** No SQL. Removing the routes and actions rolls the feature back. Supabase dashboard settings can stay.
- **Observability:** Log provider error codes only.

### Supabase project settings

No migration. In the Supabase dashboard for this project:

1. **Authentication → URL Configuration**
   - **Site URL:** `https://viatik-six.vercel.app`. A localhost Site URL makes every reset email open localhost instead of the reset page.
   - **Redirect URLs:** `https://viatik-six.vercel.app/**` and `https://viatik-six.vercel.app/reset-password`. The app always sends recovery links to `https://viatik-six.vercel.app/reset-password`, including when the request is made from local development.
2. **Authentication → Emails → Reset password template** (needed so the link works on any device, not only the browser that requested it):

```html
<h2>Reset your password</h2>
<p>Follow this link to choose a new password for your Viatik account.</p>
<p><a href="https://viatik-six.vercel.app/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Reset password</a></p>
<p>If you did not ask for this, you can ignore this email.</p>
```

3. **Authentication → Emails → SMTP.** The built-in sender is limited to about 2 emails per hour and is not enough for real use. Configure custom SMTP (host, port, username, password, sender address). Local `supabase start` captures mail in Inbucket instead.
4. **Authentication → Providers → Email.** Keep Email enabled. Set the minimum password length to **8** so it matches the app.
5. Leave the default PKCE flow in place. Do not switch the project to the implicit flow.

The default reset template (`{{ .ConfirmationURL }}`) still works when the link is opened in the same browser that requested it. The template above is the one to use.

## Acceptance Criteria

### Functional

- [x] Sign-in shows a Forgot password link to `/forgot-password`.
- [x] A valid email submission returns a generic success message.
- [x] An invalid email is rejected without calling Supabase.
- [x] A recovery confirmation redirects to `/reset-password` and sets the recovery cookie.
- [x] A normal confirmation does not set that cookie.
- [x] A strong new password is saved only when the recovery cookie and a session are both present.
- [x] A weak or oversized password is rejected before Supabase is called.
- [x] Other sessions are signed out after a successful change.

### Authorization and security

- [x] Unknown emails look the same as known emails.
- [x] The update action rejects a signed-in session that did not arrive through the reset link.
- [x] Passwords and emails are not written to logs.
- [x] The recovery cookie is httpOnly, SameSite=Lax, and short-lived.

### Reliability and offline behavior

- [x] Mail rate limits and disallowed redirect URLs return an actionable error.
- [x] An expired or already-used link shows a way to request a new one.

### Accessibility and UX

- [x] Email and password fields have labels, and failures use an alert.
- [x] Password visibility can be toggled, and the rules are listed as the password is typed.
- [x] Copy exists in English and Spanish.

### Verification

- [x] Unit tests added or updated
- [x] Typecheck and the relevant test file pass
- [x] Security review recorded in this spec

## Implementation Plan

1. Add failing tests for the request, confirmation redirect, and password update.
2. Add the server actions and confirmation-route behavior.
3. Add the forgot-password and reset-password screens, plus the sign-in link.
4. Run tests and typecheck.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Reset request does not reveal accounts | No reset flow | Generic success for any valid email | Unit test | Viatik |
| Password rules enforced on the server | Registration only | Reset uses the same rules | Unit test | Viatik |

## Risks and Open Questions

- **Risk:** Without custom SMTP, Supabase will refuse most reset emails after the hourly quota. Mitigation: document SMTP in this spec.
- **Risk:** Without the recovery email template, a link opened on another device can fail PKCE verification. Mitigation: document the `token_hash` template.
- **Question:** None remaining.

## Completion Notes

- **Verification commands:** `pnpm exec vitest run` on the auth, confirm, forgot-password, reset-password, and login form tests; `pnpm exec eslint` on the touched files; `pnpm typecheck`.
- **Verification results:** 24 tests passed. ESLint and `tsc --noEmit` passed. In the browser, sign-in shows Forgot password, `/forgot-password` submits `requestPasswordReset`, and `/reset-password` without a recovery cookie shows the invalid-link state with a request-new-link action. A live inbox round-trip was not completed.
- **Security review:** Request responses do not reveal whether an email is registered. Password rules are enforced in the server action before Supabase is called. `updatePassword` requires both a session and the short-lived httpOnly recovery cookie, then signs out other sessions. The recovery token stays on `/auth/confirm` and is not kept on the reset page URL. Residual risk: the one-time token is in the email link query string until it is verified, which is the Supabase SSR pattern, and it can appear in server access logs. No database policy change.
- **Bug-ledger updates:** Not applicable
- **Follow-up work:** Settings "change password" is out of scope. Custom SMTP and the recovery email template are required in the Supabase project before real emails will reliably arrive.
