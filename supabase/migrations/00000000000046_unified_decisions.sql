create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  type text not null check (type in ('activity_proposal', 'standalone_poll')),
  question text not null check (char_length(trim(question)) > 0),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'resolved', 'cancelled')),
  voting_ends_at timestamptz,
  resolution jsonb,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null
);

create table public.decision_options (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions (id) on delete cascade,
  label text not null check (char_length(trim(label)) > 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  unique (decision_id, position)
);

create table public.decision_votes (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions (id) on delete cascade,
  option_id uuid not null references public.decision_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  unique (decision_id, user_id)
);

create index decisions_trip_id_idx on public.decisions (trip_id, status, updated_at);
create index decision_options_decision_id_idx on public.decision_options (decision_id, position);
create index decision_votes_decision_id_idx on public.decision_votes (decision_id, updated_at);
create index decision_votes_user_id_idx on public.decision_votes (user_id, updated_at);

alter table public.decisions enable row level security;
alter table public.decision_options enable row level security;
alter table public.decision_votes enable row level security;

create policy "decisions_select_members"
  on public.decisions for select to authenticated
  using (public.is_trip_member(trip_id));

create policy "decisions_insert_editors"
  on public.decisions for insert to authenticated
  with check (public.is_trip_editor(trip_id) and created_by = auth.uid() and updated_by = auth.uid());

create policy "decisions_update_editors"
  on public.decisions for update to authenticated
  using (public.is_trip_editor(trip_id))
  with check (public.is_trip_editor(trip_id));

create policy "decision_options_select_members"
  on public.decision_options for select to authenticated
  using (exists (select 1 from public.decisions d where d.id = decision_id and public.is_trip_member(d.trip_id)));

create policy "decision_options_write_editors"
  on public.decision_options for all to authenticated
  using (exists (select 1 from public.decisions d where d.id = decision_id and public.is_trip_editor(d.trip_id)))
  with check (exists (select 1 from public.decisions d where d.id = decision_id and public.is_trip_editor(d.trip_id)));

create policy "decision_votes_select_members"
  on public.decision_votes for select to authenticated
  using (exists (select 1 from public.decisions d where d.id = decision_id and public.is_trip_member(d.trip_id)));

create policy "decision_votes_insert_members"
  on public.decision_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and created_by = auth.uid()
    and updated_by = auth.uid()
    and exists (
      select 1
      from public.decisions d
      join public.decision_options o on o.decision_id = d.id and o.id = option_id
      where d.id = decision_id
        and public.is_trip_member(d.trip_id)
        and d.status = 'open'
        and (d.voting_ends_at is null or d.voting_ends_at > now())
    )
  );

create policy "decision_votes_update_own"
  on public.decision_votes for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.decisions d
      where d.id = decision_id
        and public.is_trip_member(d.trip_id)
        and d.status = 'open'
        and (d.voting_ends_at is null or d.voting_ends_at > now())
    )
  )
  with check (
    user_id = auth.uid()
    and updated_by = auth.uid()
    and exists (
      select 1
      from public.decisions d
      join public.decision_options o on o.decision_id = d.id and o.id = option_id
      where d.id = decision_id
        and public.is_trip_member(d.trip_id)
        and d.status = 'open'
        and (d.voting_ends_at is null or d.voting_ends_at > now())
    )
  );

create policy "decision_votes_delete_own"
  on public.decision_votes for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.validate_decision_vote_option()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.decision_options option_row
    where option_row.id = new.option_id
      and option_row.decision_id = new.decision_id
  ) then
    raise exception 'Decision vote option must belong to the decision' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_decision_vote_option
  before insert or update of decision_id, option_id on public.decision_votes
  for each row execute function public.validate_decision_vote_option();
