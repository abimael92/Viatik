create table public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  credential_id text not null unique,
  public_key bytea not null,
  counter bigint not null default 0,
  device_type text,
  backed_up boolean not null default false,
  transports text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index webauthn_credentials_user_id_idx on public.webauthn_credentials (user_id);

create trigger set_webauthn_credentials_updated_at
  before update on public.webauthn_credentials
  for each row
  execute function public.set_updated_at();

alter table public.webauthn_credentials enable row level security;

create policy "webauthn_credentials_select_self"
  on public.webauthn_credentials for select
  to authenticated
  using (user_id = auth.uid());

create policy "webauthn_credentials_insert_self"
  on public.webauthn_credentials for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "webauthn_credentials_delete_self"
  on public.webauthn_credentials for delete
  to authenticated
  using (user_id = auth.uid());
