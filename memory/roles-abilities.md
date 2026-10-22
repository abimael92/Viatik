# Viatik Roles, Personas & Permission Matrix

> **Authoritative sources:** [`features/domain/entities.ts`](../features/domain/entities.ts)
> (`TripMemberRole`, `InvitationStatus`, `ConnectionStatus`), the Supabase RLS policies in
> [`supabase/migrations/`](../supabase/migrations/), and the UI gates in
> [`features/trips/components/trip-workspace.tsx`](../features/trips/components/trip-workspace.tsx)
> and [`features/collaboration/member-panel.tsx`](../features/collaboration/member-panel.tsx).
>
> Last audited: 2026-10-22.

## 1. The role model

There are exactly **three trip roles**, defined once and reused everywhere:

```ts
// features/domain/entities.ts
export type TripMemberRole = "owner" | "editor" | "viewer";
```

- Postgres enum: `public.trip_member_role` (`supabase/migrations/00000000000004_trip_members.sql`).
- Stored per user per trip in `trip_members` (`unique (trip_id, user_id)`).
- `trips.owner_id` is the creator; the owner is also inserted as a `trip_members`
  row with `role = 'owner'` at creation time.
- `TripMember` carries `roleChangedAt/By` and `removedAt/By` (server-driven
  metadata, mapped in `lib/supabase/mappers.ts`). The local repository's
  `removeMember()` currently **hard-deletes** the row and queues a `tripMember`
  delete; `features/media/data/staged-trip-media-repository.ts` also treats
  `removedAt !== null` as "no longer a member" for photo staging.

### Server-side predicates (RLS helpers)

| Function | True when |
|---|---|
| `is_trip_member(trip_id)` | caller has a `trip_members` row (any role) |
| `is_trip_editor(trip_id)` | caller's role ∈ `{owner, editor}` |
| `is_trip_owner(trip_id)` | caller's role = `owner` |
| `is_trip_creator(trip_id)` | `trips.owner_id = auth.uid()` (used to bootstrap the owner row) |
| `is_active_trip_member(trip_id, user_id)` | member row exists and the trip is not soft-deleted |
| `is_active_trip_media_member(trip_id)` | media-specific membership check (migration 81) |

### Client-side gate (UX only)

```ts
const canEdit = members.some(
  (m) => m.userId === userId && (m.role === "owner" || m.role === "editor")
);
const isOwner = members.some((m) => m.userId === userId && m.role === "owner");
```

`trip-workspace.tsx` passes `canEdit` down to every tab; `itineraryCanEdit`
additionally requires the explicit itinerary edit-mode toggle. **Client checks are
convenience, never the security boundary** — RLS is.

## 2. Personas

| Persona | Where it lives | Notes |
|---|---|---|
| **Account holder** | `auth.users` + `profiles` | Email/password primary; passkey + 8-digit OTP fallbacks. `full_name` required or redirected to `/onboarding`. |
| **Trip owner** | `trips.owner_id` + `trip_members.role='owner'` | Exactly one per trip. Only role that can delete the trip, change roles, remove members, or mint share links. |
| **Trip editor** | `trip_members.role='editor'` | "Admin collaborator". Full planning rights, no membership/share-link authority. **Default role when a linked contact is added to a trip** (`features/collaboration/lib/ensure-member.ts`). |
| **Trip viewer** | `trip_members.role='viewer'` | Read-only planning. Can still vote in decisions and set **their own** activity attendance. |
| **Invitee** | `trip_invitations` | `status`: `pending → accepted / rejected / revoked`; expires after 14 days (`invite()` sets `expiresAt`). Invitation role is `editor` or `viewer` (never `owner`). |
| **Offline traveler** | `trip_travelers` (+ `contacts`) | A person on the trip without a Viatik account. Referenced by `traveler:<uuid>` keys in expenses/shares. Cannot log in, vote, or sync. |
| **Linked contact** | `contacts.linkedProfileId` | Contact bound to a real profile. `connectionStatus`: `pending`, `accepted`, `unverified_offline`. Only linked contacts receive a `tripMembers` row. |
| **Guest** | `/share/[slug]` (no auth) | Read-only snapshot from `trip_share_links`. Owner-only creation; `active=false` revokes. |

## 3. Permission matrix

Legend: ✅ allowed · ⚠️ allowed with a narrow restriction · ❌ denied.
"Member" = any role.

### Trip & membership

| Action | Owner | Editor | Viewer | Guest | Offline traveler |
|---|---|---|---|---|---|
| View trip | ✅ | ✅ | ✅ | ⚠️ link active + section flag | — (no account) |
| Create trip | ✅ (creator) | — | — | — | — |
| Edit trip fields (name, dates, location, cover, status) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete trip | ✅ | ❌ | ❌ | ❌ | ❌ |
| Invite by email | ✅ | ✅ | ❌ | ❌ | ❌ |
| Revoke invitation | ✅ | ✅ | ❌ | ❌ | ❌ |
| Add member directly | ✅ | ✅ | ❌ | ❌ | ❌ |
| Change a member's role | ✅ | ❌ | ❌ | ❌ | ❌ |
| Remove another member | ✅ | ❌ | ❌ | ❌ | ❌ |
| Leave trip (remove self) | ✅ | ✅ | ✅ | — | — |
| Generate / edit / revoke share links | ✅ | ❌ | ❌ | ❌ | ❌ |

### Planning

| Action | Owner | Editor | Viewer | Guest |
|---|---|---|---|---|
| Read itinerary, map, photos | ✅ | ✅ | ✅ | ⚠️ per `allowItinerary` / `allowMap` / `allowGallery` |
| Create / edit / reorder / delete activities | ✅ | ✅ | ❌ | ❌ |
| Add photos & voice notes (`trip_media`) | ✅ | ✅ | ❌ | ❌ |
| View photos / download | ✅ | ✅ | ✅ | ⚠️ gallery flag (signed URLs) |
| Manage packing, journal, transit, pins, polls (local-only) | ✅ | ✅ | ⚠️ device-local data is visible/editable on that device only | ❌ |
| Write trip notes & crew tasks | ✅ | ✅ | ✅ (member-level insert policy) | ❌ |
| Edit activity checklist progress | ✅ | ✅ | ⚠️ progress only, no structural edits | ❌ |
| RSVP own attendance | ✅ | ✅ | ✅ (own row only) | ❌ |
| Cancel an activity proposal | ⚠️ creator or editor | ⚠️ creator or editor | ⚠️ only if creator | ❌ |

### Money

| Action | Owner | Editor | Viewer | Guest |
|---|---|---|---|---|
| View expenses, balances, settlement ledger | ✅ | ✅ | ✅ | ❌ |
| Create / edit / delete expense | ✅ | ✅ | ❌ | ❌ |
| Split shares | ✅ | ✅ | ❌ | ❌ |
| Record a settlement (repayment) | ✅ (as member) | ✅ | ✅ (insert is member-level) | ❌ |
| Edit / delete a settlement | ⚠️ creator only | ⚠️ creator only | ⚠️ creator only | ❌ |
| Set trip budget / wallet (local-only) | ✅ | ✅ | ✅ (device-local) | ❌ |
| Be the payer or a debtor | ✅ | ✅ | ✅ | — |

### Group decisions, notifications, vault

| Action | Owner | Editor | Viewer | Guest |
|---|---|---|---|---|
| Create / close a decision (poll) | ✅ | ✅ | ❌ | ❌ |
| Vote on an open decision | ✅ | ✅ | ✅ (own vote, open + not expired) | ❌ |
| Read decisions & tallies | ✅ | ✅ | ✅ | ❌ |
| Read own notifications | ✅ | ✅ | ✅ | — |
| Mark own notifications read | ✅ | ✅ | ✅ | — |
| Trip vault (documents) | ⚠️ own keyset only + active member | ⚠️ own keyset only | ⚠️ own keyset only | ❌ |
| Weather forecasts | ✅ | ✅ (write) | ✅ (read) | ❌ |

> The vault is **owner-scoped**: `vault_keysets.owner_id = auth.uid()` and
> `vault_entries.owner_id = auth.uid() AND is_active_trip_member(trip_id)`. Even an
> owner cannot read another member's vault. Entries are AES-GCM encrypted in the
> browser (`lib/security/web-crypto-vault.ts`); the passphrase is never persisted.

## 4. Invitation & membership lifecycle

```
invite(email, role=editor|viewer)
  └─ trip_invitations(status=pending, expiresAt=+14d, version, statusChangedAt/By)
       ├─ accept → trip_members row created with the invitation role; status=accepted
       ├─ reject → status=rejected
       └─ revoke (editor/owner) → status=revoked
```

- Direct add of a linked contact: `ensureMemberForLinkedContact()` →
  `setMemberRoleByUser(tripId, linkedProfileId, "editor", byUserId)`, which writes the
  member row **and** queues a `trip_added` notification in the same Dexie transaction
  (see `.ai/specs/bug-viewer-rsvp-and-trip-added.md`).
- `updateMemberRole()` writes `role` + `updatedAt` and appends a `tripMember`
  update; `removeMember()` hard-deletes the row and appends a delete.
- **Accept/reject an invitation is a remote-first flow:** the repository calls the
  `accept_trip_invitation` / `reject_trip_invitation` RPC (the membership row is
  created server-side), updates the local invitation row, then runs
  `pullRemoteChanges(true)`. Offline invitation acceptance is therefore not supported.

## 5. Guest share links

`TripShareLink` (`features/sharing/domain/share-types.ts`):

- `slug` — high-entropy public token used at `/share/[slug]`.
- `allowItinerary`, `allowMap`, `allowGallery` — independent section flags.
- `active` — soft-disable without deleting.
- Created/updated/deleted **only by the trip owner** (RLS policy + `security definer`
  RPC checks in `00000000000034_trip_share_links.sql`).
- Guest data is resolved server-side into a `SharedTripSnapshot`; guests never
  touch Dexie or the authenticated sync path.

## 6. Enforcement checklist for new features

1. Decide which role may perform the action; write it in the feature spec.
2. Add/verify the RLS policy in a new `supabase/migrations/` file — never rely on UI.
3. Gate the UI with `canEdit` / `isOwner` for usability.
4. Add a negative test (viewer/guest attempt) in `supabase/*-security.test.ts`.
5. If the action changes membership semantics, update
   [`.ai/specs/bug-ledger.md`](../.ai/specs/bug-ledger.md) and this matrix.
