-- Wekad: a day closes automatically once it holds 3 bookings, and reopens by
-- itself if a booking is cancelled, moved or deleted and the count drops.
--
-- Done in the database on purpose: the public site holds only the anon key,
-- so giving it INSERT on blocked_dates would let anyone close any day.
-- A SECURITY DEFINER trigger writes the row without granting that right.
--
-- Only rows with reason 'booked' are managed here; days an admin closed by
-- hand (any other reason) are never touched.
-- Safe to re-run. Change the capacity in day_capacity().

create unique index if not exists blocked_dates_day_key on public.blocked_dates (day);

create or replace function public.day_capacity()
returns integer
language sql immutable as $$ select 3 $$;

-- Recount one day and close or reopen it to match.
create or replace function public.sync_booked_day(p_day date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_day is null then
    return;
  end if;

  if (select count(*) from public.orders
        where event_date = p_day and status <> 'cancelled') >= public.day_capacity() then
    insert into public.blocked_dates (day, reason)
    values (p_day, 'booked')
    on conflict (day) do nothing;
  else
    delete from public.blocked_dates where day = p_day and reason = 'booked';
  end if;
end;
$$;

create or replace function public.block_booked_day()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.sync_booked_day(new.event_date);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.sync_booked_day(old.event_date);
  end if;
  return null;
end;
$$;

drop trigger if exists orders_block_day on public.orders;

create trigger orders_block_day
after insert or delete or update of event_date, status on public.orders
for each row execute function public.block_booked_day();

-- Apply the new rule to every day already closed by a booking.
select public.sync_booked_day(day) from public.blocked_dates where reason = 'booked';

select day, reason from public.blocked_dates where day >= current_date order by day;
