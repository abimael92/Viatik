# Bug Report: Collaborator changes are not live

**Status:** Fixed in client and migration; hosted database still needs migration 63 applied  
**Date:** 2026-09-25

## Observed

Another traveler's itinerary, expense, member, and media changes can stay invisible until a later poll. Connection requests, wallets, personal budgets, and notifications never arrive over Realtime at all.

## Expected

Once a change is stored in Supabase, every other signed-in traveler who can read that row sees it in their local trip without waiting for the 30-second poll. If the Realtime socket drops, the app reconnects and pulls immediately. Returning to the tab also pulls.

## Root cause

The client subscribes to `activity_personal_budgets`, `connections`, `user_wallets`, and `notifications`, but those tables were never added to `supabase_realtime`. A binding for an unpublished table fails the collaboration channel, so published trip tables stop streaming too. `startRealtimeSync` ignores channel errors, and the sync engine does not pull when the tab becomes visible.

## Invariant

Every table the client applies from Realtime is a member of `supabase_realtime`. A channel error reconnects and requests a pull. A visible or focused tab requests a pull.

## Out of scope

Packing lists, health documents, and journal notes stay on the device. Flights, the shared trip budget, and map pins are still local and should be crew-visible in a follow-up.
