-- Tables the client already subscribes to must be in supabase_realtime.
-- An unpublished binding fails the shared collaboration channel, so trip
-- changes stop streaming to other travelers.

do $$
declare
  target text;
begin
  foreach target in array array[
    'activity_personal_budgets',
    'connections',
    'user_wallets',
    'notifications'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;
