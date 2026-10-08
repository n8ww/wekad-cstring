-- وِكاد — المدفوعات: العربون وتاريخ تحويله
-- الصقه في Supabase ← SQL Editor ← New query ← Run
-- آمن للتشغيل أكثر من مرة.

alter table public.orders add column if not exists deposit      numeric(10,2);
alter table public.orders add column if not exists deposit_date date;

comment on column public.orders.deposit      is 'العربون المحوَّل بالريال؛ المتبقي = total - deposit';
comment on column public.orders.deposit_date is 'تاريخ تحويل العربون';

-- فهرس للتقرير: الطلبات التي لم يصل عربونها بعد
create index if not exists orders_deposit_idx on public.orders (deposit);

select 'payment columns ready' as status,
       count(*) filter (where deposit is not null) as with_deposit,
       count(*)                                    as total_rows
from public.orders;
