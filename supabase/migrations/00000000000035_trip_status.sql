-- Trip lifecycle: explicit status with optional started/completed timestamps.
-- UI changes status only via explicit user action (start/end/cancel); the app's
-- date-derived fallback (resolveTripStatus) handles legacy rows.

alter table public.trips
  add column status text not null default 'planned',
  add column started_at timestamptz,
  add column completed_at timestamptz;

alter table public.trips
  add constraint trips_status_chk check (status in ('planned', 'active', 'completed', 'cancelled'));

-- Backfill existing rows: past trips become "completed", everything else stays
-- "planned". In-flight trips keep "planned" and the UI may nudge the user to
-- confirm a start rather than silently changing state.
update public.trips
  set status = 'completed'
  where status = 'planned'
    and end_date is not null
    and end_date < current_date;
