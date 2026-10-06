-- Wekad: close the event day automatically when an order is placed.
--
-- Done in the database on purpose: the public site holds only the anon key,
-- so giving it INSERT on blocked_dates would let anyone close any day.
-- A SECURITY DEFINER trigger writes the row without granting that right.
--
-- The day stays closed until an admin reopens it from the dashboard; the
-- trigger fires only on new orders, so a reopened day is not closed again.

create unique index if not exists blocked_dates_day_key on public.blocked_dates (day);

create or replace function public.block_booked_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_date is not null then
    insert into public.blocked_dates (day, reason)
    values (new.event_date, 'booked')
    on conflict (day) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_block_day on public.orders;

create trigger orders_block_day
after insert on public.orders
for each row execute function public.block_booked_day();
