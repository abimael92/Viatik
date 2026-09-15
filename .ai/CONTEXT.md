# Viatik — Fast Context Snapshot

> Quick, cheap read for any agent. Read this first, then `llms.txt` for the full
> workflow. Update this file whenever a feature or architecture changes.

## What Viatik is

A collaborative, **offline-first travel workspace**: build itineraries, coordinate
travelers, split expenses, track travel documents, and keep every plan usable on
unreliable networks.

## Stack (authoritative: `package.json`)

| Area | Choice |
|---|---|
| Web | Next.js 16 (App Router), React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4, OKLCH tokens, Radix UI primitives |
| Local state | Dexie.js / IndexedDB = **source of truth**; Zustand = transient UI only |
| Remote | Supabase: Postgres, Auth, Storage, Realtime |
| Drag/anim | @dnd-kit, Motion |
| Validation | Zod + boundary validation |
| Tests | Vitest/Testing Library + Playwright E2E |

## Core invariant (never break)

`Dexie` is the local domain source of truth. `Supabase` is the remote sync target.
**UI components never query Supabase directly** — all reads/writes flow through
repository/application boundaries and an optimistic outbox sync engine.

## Auth (recently changed)

- **Email + password** is the primary sign-in.
- **Passkey (WebAuthn)** and **one-time-code (8-digit)** are fallbacks.
- **Signup collects**: display name, email, phone, date of birth (all required) +
  optional avatar. Profile row is pre-created at signup so onboarding isn't forced.
- **Email confirmation** is required for new signups; the app shows a "check your
  email" screen until the address is confirmed.
- **Production email requires custom SMTP** in Supabase (built-in sender is limited
  to ~2/hr). Auth actions live in `app/actions/auth.ts`.

## Features (`features/`)

activities, ai (Scout — itinerary ideas, works offline), collaboration, community/feed,
contacts, emergency, expenses (multi-currency splits), finance (budgets), health
(passport/visa tracking), journal, maps, media, packing, polls, profile, sharing,
transit, trips, vault (offline documents), weather (per-day forecasts + conflict warnings).

## Brand

Gradient **blue `#0ea5e9` → magenta `#a855f7` → red `#f43f5e`**; dark/navy surfaces
(`#090a0f` / `#101a3a`); Geist Sans + Geist Mono. Tokens in `app/globals.css`.

## Commands

```bash
pnpm dev            # dev server (port 3000)
pnpm test           # Vitest unit/integration
pnpm test:e2e       # Playwright
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm build          # production build
supabase start      # local Supabase stack
supabase db reset   # recreate local DB + apply migrations
```

## Verification gate

A change isn't done until `pnpm lint`, `pnpm typecheck`, relevant `pnpm test`, and
(where applicable) `pnpm build` pass. Full suite: 664 tests across 90 files.

## Where to look

- `app/actions/auth.ts` — auth server actions (password, OTP, onboarding, profile).
- `app/(auth)/login/login-form.tsx` — login + register UI.
- `app/(app)/settings/settings-client.tsx` — profile settings.
- `app/(auth)/onboarding/onboarding-form.tsx` — traveler onboarding form.
- `lib/sync/`, `lib/db/`, `lib/supabase/` — offline sync + persistence boundaries.
