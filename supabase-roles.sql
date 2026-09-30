-- Wekad - roles: admin (everything) and staff (schedule only, no money)
-- Paste into Supabase > SQL Editor > New query > Run. Safe to re-run.

-- 1. who is allowed in, and with which role
create table if not exists public.allowed_staff (
  email text primary key,
  role text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz not null default now()
);

-- 2. role helpers (security definer so they bypass RLS and cannot recurse)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false);
$$;

-- 3. a new sign-up only gets a profile if the admin allow-listed the email
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare allowed_role text;
begin
  select role into allowed_role from public.allowed_staff where lower(email) = lower(new.email);
  if allowed_role is not null then
    insert into public.profiles (id, email, role) values (new.id, new.email, allowed_role)
    on conflict (id) do update set role = excluded.role;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. orders: only admins may read or change them
alter table public.orders enable row level security;
drop policy if exists "staff can read orders" on public.orders;
drop policy if exists "staff can update orders" on public.orders;
drop policy if exists "admin reads orders" on public.orders;
drop policy if exists "admin updates orders" on public.orders;
drop policy if exists "admin deletes orders" on public.orders;

create policy "admin reads orders" on public.orders
  for select to authenticated using (public.is_admin());
create policy "admin updates orders" on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes orders" on public.orders
  for delete to authenticated using (public.is_admin());

-- 5. the staff view: schedule only. No price columns exist here at all,
--    and item prices are stripped out of the JSON.
drop view if exists public.schedule;
create view public.schedule as
select
  o.id,
  o.ref,
  o.created_at,
  o.event_date,
  o.event_time,
  o.days,
  o.service,
  o.package_name,
  o.city,
  o.district,
  o.venue,
  o.lat,
  o.lng,
  o.customer_name,
  o.phone,
  o.notes,
  o.included_baristas,
  o.status,
  (select jsonb_agg(jsonb_build_object('name', i->>'name', 'qty', i->'qty', 'unit', i->>'unit'))
     from jsonb_array_elements(o.items) i) as items
from public.orders o
where o.status <> 'cancelled'
  and exists (select 1 from public.profiles p where p.id = auth.uid());

revoke all on public.schedule from anon;
grant select on public.schedule to authenticated;

-- 6. profiles and the allow-list
alter table public.profiles enable row level security;
alter table public.allowed_staff enable row level security;

drop policy if exists "see own profile" on public.profiles;
drop policy if exists "admin manages profiles" on public.profiles;
create policy "see own profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "admin manages profiles" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin manages allowed staff" on public.allowed_staff;
create policy "admin manages allowed staff" on public.allowed_staff
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 7. visits stay admin-only
drop policy if exists "staff can read visits" on public.visits;
drop policy if exists "admin reads visits" on public.visits;
create policy "admin reads visits" on public.visits
  for select to authenticated using (public.is_admin());

select 'roles ready' as status;

-- 8. bootstrap: make the FIRST existing account the admin
insert into public.profiles (id, email, role)
  select id, email, 'admin' from auth.users order by created_at asc limit 1
  on conflict (id) do update set role = 'admin';

insert into public.allowed_staff (email, role)
  select email, 'admin' from auth.users order by created_at asc limit 1
  on conflict (email) do update set role = 'admin';

select p.email, p.role from public.profiles p;
