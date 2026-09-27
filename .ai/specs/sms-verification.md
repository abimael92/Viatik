# SMS verification is disabled

SMS verification is not part of this release. The unfinished phone-login path could not send or confirm a code without a production SMS provider, and Settings claimed a verified session anyway.

## What was disabled

- `sendPhoneOtp` and `verifyPhoneOtp` return "SMS verification is not available." They do not call Supabase. The previous `signInWithOtp({ channel: "sms" })` and `verifyOtp({ type: "sms" })` calls are kept as comments in `app/actions/auth.ts`.
- The Settings security row that showed "SMS authentication" and "Verified session" next to `auth.users.phone` is not rendered.
- `SMS_PROVIDER_API_KEY` stays in `env.mjs` and `.env.example` so existing environments do not break. No application code reads it.

## Why

There is no OTP screen, no verified-phone state, and no production SMS provider. Calling Supabase Phone Auth in that state fails or does nothing. Showing "Verified session" told people a phone had been confirmed when it had not.

## What still works

These are not SMS and were left in place:

- Email and password sign-in, email confirmation, and the email one-time code.
- Password reset by email.
- Passkeys.
- The profile phone number collected at signup, onboarding, and Settings. It is contact data, not a verified login phone.
- In-app trip alerts, friend requests, votes, settlements, and invitations. Nothing texts those.

## What remains

1. Supabase Dashboard: enable the Phone provider and connect a production SMS provider (Twilio, MessageBird, Vonage, or Textlocal) with a funded sender. Supabase test SMS does not deliver to real phones.
2. Store and validate the login phone in E.164 (`+` and country code). The current profile check only counts 7–15 digits.
3. Build the OTP UI: send, enter the code, resend, and show provider errors. Wire it to the preserved actions only after those actions call Supabase again.
4. Record verified-phone state from a successful `verifyOtp`. Do not treat a saved profile phone, or any signed-in session, as SMS-verified.
5. Decide whether phone login creates an account or only verifies the phone on an existing email account. Today the product account is email-based.
6. Tests must prove a code is refused before the provider is configured, and that a successful verify is the only path that marks the phone verified. Cover wrong codes, expiry, and rate limits.
7. `SMS_PROVIDER_API_KEY` is still unused. Prefer the Supabase Phone provider. Use a direct provider only if Supabase cannot send the message.

## Recommended approach

Keep email as the account identity. Add phone verification later as an optional step on the existing account: send a code, verify it, then store the confirmed E.164 number separately from the free-text profile phone. Restore the Settings row only after that success state exists. Do not send trip or friend-request SMS in that same change.
