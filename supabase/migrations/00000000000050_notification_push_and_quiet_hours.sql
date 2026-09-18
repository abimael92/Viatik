alter table public.notifications add column if not exists push_sent_at timestamptz;
alter table public.profiles add column if not exists mute_trip_notifications boolean not null default false;
create index if not exists notifications_user_unread_idx on public.notifications (user_id, is_read);
