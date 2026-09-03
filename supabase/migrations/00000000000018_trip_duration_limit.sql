alter table public.trips drop constraint if exists trips_date_range_chk;

alter table public.trips add constraint trips_date_range_chk check (
  start_date is null or end_date is null or (
    end_date >= start_date and end_date - start_date <= 59
  )
) not valid;
