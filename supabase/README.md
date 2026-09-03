# Database

Migrations are plain, ordered SQL files under `migrations/`, applied with the
Supabase CLI (`supabase db push` / `supabase migration up`) or `psql`.

| File | Contents |
| --- | --- |
| `00000000000001_extensions_and_helpers.sql` | Extensions, `set_updated_at()` trigger fn, `is_trip_member/editor/owner()` RLS helpers |
| `00000000000002_profiles.sql` | `profiles` table + auto-provisioning trigger on `auth.users` insert |
| `00000000000003_trips.sql` | `trips` table |
| `00000000000004_trip_members.sql` | `trip_members` table + `trip_member_role` enum |
| `00000000000005_activities.sql` | `activities` table (itinerary items, fractional `position` for drag-and-drop) |
| `00000000000006_expenses.sql` | `expenses` + `expense_shares` tables + `expense_split_type` enum |

Every mutable table has an `updated_at` column kept current by a `BEFORE
UPDATE` trigger (`set_updated_at`), which the client-side sync engine relies
on for Last-Write-Wins conflict resolution. Soft deletes (`deleted_at`) are
used on `trips`/`activities`/`expenses` instead of hard deletes so offline
clients can reconcile deletions that happened while disconnected.

All tables have Row-Level Security enabled: access is always scoped to trips
the requesting user is a member of (`trip_members`), with `owner`/`editor`
roles required for writes and `owner` required for destructive trip-level
actions.
