-- Wekad - database setup
-- Paste into Supabase > SQL Editor > New query > Run
-- Safe to run more than once.

create table if not exists public.orders (
  id                bigint generated always as identity primary key,
  ref               text not null unique,
  created_at        timestamptz not null default now(),
  service           text not null,
  package_id        text,
  package_name      text,
  package_price     numeric(10,2),
  days              integer not null default 1,
  event_date        date,
  event_time        text,
  city              text,
  district          text,
  venue             text,
  lat               double precision,
  lng               double precision,
  client_type       text,
  customer_name     text,
  phone             text,
  company           text,
  vat               text,
  notes             text,
  included_baristas integer not null default 1,
  items             jsonb not null default '[]'::jsonb,
  desserts_total    numeric(10,2) not null default 0,
  addons_total      numeric(10,2) not null default 0,
  total             numeric(10,2) not null default 0,
  status            text not null default 'new',
  sent_whatsapp     boolean not null default false
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

alter table public.orders enable row level security;

drop policy if exists "site can insert orders" on public.orders;
drop policy if exists "staff can read orders" on public.orders;
drop policy if exists "staff can update orders" on public.orders;

create policy "site can insert orders"
  on public.orders for insert
  to anon, authenticated
  with check (true);

create policy "staff can read orders"
  on public.orders for select
  to authenticated
  using (true);

create policy "staff can update orders"
  on public.orders for update
  to authenticated
  using (true)
  with check (true);

select 'orders table ready' as status, count(*) as row_count from public.orders;
