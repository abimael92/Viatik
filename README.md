# Viatik

Viatik is an offline-first, collaborative travel itinerary app. Trips, activities,
and expenses are planned together in real time, but the app is fully usable with
no network connection — every mutation is written locally first and synced to the
cloud when possible.

## Tech Stack

- **Next.js (App Router)** — routing, server actions, and server-rendered shells.
- **Tailwind CSS v4** — utility styling driven entirely by `@theme` tokens in
  `app/globals.css` (OKLCH color space, no legacy `tailwind.config.ts`).
- **Dexie.js (IndexedDB)** — the single local source of truth for domain data.
- **Supabase (Postgres + Auth + Storage)** — the remote source of truth, RLS-secured.
- **Zustand** — transient, non-persisted UI state only (open modals, drag state).
- **dnd-kit** — the drag-and-drop itinerary board.
- **Motion** — `transform`/`opacity` animations only.

## Architecture

Viatik follows a Clean Architecture / hexagonal layout so that UI code never talks
to Dexie or Supabase directly:

```
features/
  domain/            # Entities + repository interfaces (pure TS, no I/O)
  <feature>/
    data/            # Dexie + Supabase implementations of the repositories
    components/      # UI, depends only on the domain interfaces
lib/
  db/                # Dexie schema + database instance
  sync/              # Offline outbox + sync engine
  supabase/          # Supabase client factories (browser/server)
```

Rules enforced across the codebase:

1. **No overlapping state.** Dexie is the only local source of truth for domain
   data (trips, activities, expenses, members). Zustand never stores domain data.
2. **Repositories, not direct calls.** Components call a `TripRepository`,
   `ActivityRepository`, etc. Whether that repository reads Dexie, hits Supabase,
   or does both is an implementation detail hidden behind the interface.
3. **Styling via design tokens.** Colors, radii, spacing, and shadows are defined
   once as OKLCH CSS variables inside `@theme` in `globals.css`.

## Offline-First Strategy

1. Every mutation (create/update/delete) is applied optimistically to Dexie first,
   so the UI updates instantly regardless of connectivity.
2. The same mutation is appended to an `outbox_mutations` table in Dexie.
3. A `SyncEngine` listens for `online`/`offline` events and, whenever the app is
   online, drains the outbox against Supabase in order.
4. Conflicts are resolved deterministically with **Last-Write-Wins**, comparing
   the `updated_at` timestamp of the local mutation against the row's current
   `updated_at` on the server.
5. Realtime changes from Supabase (from other collaborators) are written back
   into Dexie, which re-renders the UI via `dexie-react-hooks`.

This means the app never blocks on the network: reads and writes always go
through Dexie, and synchronization happens asynchronously in the background.

## Getting Started

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase credentials
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `pnpm dev` — start the development server
- `pnpm build` — production build
- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript project check (no emit)
