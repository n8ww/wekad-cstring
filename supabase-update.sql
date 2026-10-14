-- وِكاد — تحديث أكتوبر ٢٠٢٦: المدفوعات + حماية الطلبات + تنظيف + نسخة من هيكل القاعدة
-- الصقه كاملاً في Supabase ← SQL Editor ← New query ← Run
-- (اضغط على مكان فارغ قبل Run حتى لا يشتغل جزء محدَّد فقط)
-- آمن للتشغيل أكثر من مرة.
--
-- شغّله بعد نشر الموقع الجديد (./deploy.sh)، لا قبله: الموقع القديم يطلب
-- سبب الإقفال، والخطوة ٥ تمنعه عنه.

-- ============================================================================
-- ١. المدفوعات: العربون وتاريخه (المتبقي = الإجمالي − العربون، لا يُخزَّن)
-- ============================================================================
alter table public.orders add column if not exists deposit      numeric(10,2);
alter table public.orders add column if not exists deposit_date date;

comment on column public.orders.deposit      is 'العربون المحوَّل بالريال؛ المتبقي = total - deposit';
comment on column public.orders.deposit_date is 'تاريخ تحويل العربون';

create index if not exists orders_deposit_idx on public.orders (deposit);

-- ============================================================================
-- ٢. هل اليوم مفتوح للحجز؟ — تقرأ الأيام المقفلة دون أن تمنح الزائر صلاحية عليها
-- ============================================================================
create or replace function public.day_is_open(p_day date)
returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.blocked_dates where day = p_day);
$$;

-- ============================================================================
-- ٣. من يضيف طلباً، وبأي شروط
--    قبل: أي زائر يضيف أي صف بأي قيم — بما فيها «مؤكّد» وأي تاريخ.
--    الآن: الموقع العام يضيف طلباً «جديداً» فقط، بتاريخ قادم مفتوح وبيانات
--    سليمة، والمدير يضيف الحجز اليدوي بجلسته.
-- ============================================================================
drop policy if exists "site can insert orders"        on public.orders;
drop policy if exists "public site inserts new orders" on public.orders;
drop policy if exists "admin inserts orders"          on public.orders;

create policy "public site inserts new orders" on public.orders
  for insert to anon
  with check (
        status = 'new'
    and deposit is null
    and deposit_date is null
    and ref ~ '^WK-[A-Z0-9]{5}$'
    and event_date >  current_date
    and event_date <= current_date + 400
    and public.day_is_open(event_date)
    and char_length(coalesce(customer_name, '')) between 3 and 80
    and regexp_replace(coalesce(phone, ''), '[\s-]', '', 'g') ~ '^(\+?9665|05|5)[0-9]{8}$'
    and coalesce(char_length(notes), 0)          <= 1000
    and coalesce(char_length(custom_request), 0) <= 1000
    and coalesce(total, 0) >= 0
  );

create policy "admin inserts orders" on public.orders
  for insert to authenticated
  with check (public.is_admin());

-- ============================================================================
-- ٤. حدّ للطلبات من الموقع العام
--    كل طلب يقفل يومه تلقائياً، فبدون حدّ يقدر شخص واحد يقفل التقويم كله
--    بطلبات وهمية. الحد: ٣ طلبات لنفس الجوال في ٢٤ ساعة، و٢٠ طلباً للموقع
--    كله في الساعة. الحجز اليدوي من اللوحة لا يخضع له.
-- ============================================================================
create or replace function public.limit_public_orders()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  clean_phone text := regexp_replace(coalesce(new.phone, ''), '[\s-]', '', 'g');
begin
  if coalesce(auth.role(), 'anon') <> 'anon' then
    return new;
  end if;

  if (select count(*) from public.orders
        where regexp_replace(coalesce(phone, ''), '[\s-]', '', 'g') = clean_phone
          and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'too many orders for this phone' using errcode = 'P0001';
  end if;

  if (select count(*) from public.orders
        where created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many orders, try later' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_limit_public on public.orders;
create trigger orders_limit_public
before insert on public.orders
for each row execute function public.limit_public_orders();

-- ============================================================================
-- ٥. سبب الإقفال داخلي: الزائر يرى أن اليوم مقفل، لا لماذا
-- ============================================================================
revoke select on public.blocked_dates from anon;
grant  select (day) on public.blocked_dates to anon;

-- ============================================================================
-- ٦. تنظيف: طلبات التجربة، والأيام التي أقفلتها ولم يعد لها طلب
-- ============================================================================
delete from public.orders
where ref in ('WK-PING-OK', 'WK-K6MRW', 'WK-TNGPQ', 'WK-9DQQU',
              'WK-ROLECHK', 'WK-SETUPCHK', 'WK-CUSTCHK');

-- يفتح فقط ما أقفله المشغّل تلقائياً ('booked') ولا يوجد أي طلب في ذلك اليوم
delete from public.blocked_dates b
where b.reason = 'booked'
  and b.day >= current_date
  and not exists (select 1 from public.orders o where o.event_date = b.day);

-- ============================================================================
-- ٧. نسخة من هيكل القاعدة كما هو فعلاً — انسخ الخانة الناتجة وأرسلها
--    (جداول، فهارس، عروض، دوال، صلاحيات، مشغّلات)
-- ============================================================================
select string_agg(ddl, E'\n\n' order by o, n) as schema_dump
from (
  select 1 as o, c.relname::text as n,
         'create table if not exists public.' || c.relname || E' (\n'
         || string_agg('  ' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
              || case when a.attidentity = 'a' then ' generated always as identity'
                      when a.attidentity = 'd' then ' generated by default as identity' else '' end
              || case when a.attnotnull then ' not null' else '' end
              || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''),
            E',\n' order by a.attnum)
         || E'\n);' as ddl
  from pg_class c
  join pg_namespace s on s.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where s.nspname = 'public' and c.relkind = 'r'
  group by c.relname
  union all
  select 2, tablename || indexname, indexdef || ';'
  from pg_indexes where schemaname = 'public'
  union all
  select 3, c.relname, 'alter table public.' || c.relname || ' enable row level security;'
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  union all
  select 4, c.relname, 'create or replace view public.' || c.relname || E' as\n' || pg_get_viewdef(c.oid, true)
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'v'
  union all
  select 5, p.proname, pg_get_functiondef(p.oid) || ';'
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.prokind = 'f'
  union all
  select 6, tablename || policyname,
         format('create policy %I on public.%I as %s for %s to %s%s%s;',
                policyname, tablename, permissive, cmd, array_to_string(roles, ', '),
                coalesce(E'\n  using (' || qual || ')', ''),
                coalesce(E'\n  with check (' || with_check || ')', ''))
  from pg_policies where schemaname = 'public'
  union all
  select 7, t.tgname, pg_get_triggerdef(t.oid) || ';'
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where not t.tgisinternal
    and (c.relnamespace = 'public'::regnamespace
         or (c.relnamespace = 'auth'::regnamespace and c.relname = 'users'))
  union all
  select 8, table_name || grantee || privilege_type,
         format('grant %s on public.%I to %I;', privilege_type, table_name, grantee)
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all
  select 9, table_name || column_name || grantee,
         format('grant %s (%I) on public.%I to %I;', privilege_type, column_name, table_name, grantee)
  from information_schema.column_privileges
  where table_schema = 'public' and grantee = 'anon' and table_name = 'blocked_dates'
) x;
