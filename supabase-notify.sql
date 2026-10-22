-- وِكاد — إيميل لكل حسابات اللوحة عند تأكيد حجز
-- يُرسَل لما تصير حالة الطلب «مؤكّد» (أو يُضاف حجز يدوي مؤكّد)، عبر Resend.
-- الإيميل بلا أي مبلغ: الموظفون لا يرون الأسعار في اللوحة، ولا هنا.
--
-- قبل التشغيل: احفظ مفتاح Resend مرة واحدة (في استعلام منفصل):
--   select vault.create_secret('re_xxxxxxxx', 'resend_api_key');
-- آمن للتشغيل أكثر من مرة.

create extension if not exists pg_net;

create or replace function public.notify_confirmed_order()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  api_key text;
  days_ar text[] := array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  months_ar text[] := array['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  day date := coalesce(new.setup_date, new.event_date);
  day_txt text;
  female int := 0;
  map_url text;
  rows_html text;
  html text;
  subject text;
  batch jsonb;
begin
  -- الحفظ من اللوحة يرسل الحالة مع كل تعديل؛ نرسل فقط لما تتحوّل فعلاً إلى «مؤكّد»
  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    return new;
  end if;

  select decrypted_secret into api_key
    from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if api_key is null then
    return new;                       -- لا مفتاح بعد: لا إيميل، والطلب يُحفظ عادي
  end if;

  if day is not null then
    day_txt := days_ar[extract(dow from day)::int + 1] || '، '
            || extract(day from day)::int || ' ' || months_ar[extract(month from day)::int]
            || ' ' || extract(year from day)::int;
  else
    day_txt := 'لم يُحدَّد';
  end if;

  select coalesce(sum((i->>'qty')::numeric), 0)::int into female
    from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) i
    where i->>'id' = 'barista' or i->>'unit' = 'باريستا';

  if new.lat is not null and new.lng is not null then
    map_url := 'https://maps.google.com/?q=' || new.lat || ',' || new.lng;
  end if;

  rows_html :=
       '<tr><td style="color:#7d8b83;padding:6px 0">اليوم</td><td style="padding:6px 0"><b>' || day_txt || '</b></td></tr>'
    || '<tr><td style="color:#7d8b83;padding:6px 0">وقت التركيب</td><td style="padding:6px 0">' || coalesce(new.setup_time::text, 'لم يُحدَّد') || '</td></tr>'
    || '<tr><td style="color:#7d8b83;padding:6px 0">الموقع</td><td style="padding:6px 0">'
         || coalesce(new.city, '—') || coalesce(' — ' || new.district, '') || coalesce('<br>' || new.venue, '') || '</td></tr>'
    || '<tr><td style="color:#7d8b83;padding:6px 0">الباقة</td><td style="padding:6px 0">'
         || coalesce(new.package_name, '—') || ' · ' || coalesce(new.days, 1) || ' يوم</td></tr>'
    || '<tr><td style="color:#7d8b83;padding:6px 0">الباريستا</td><td style="padding:6px 0">رجل '
         || coalesce(new.included_baristas, 0) || ' · بنت ' || female || '</td></tr>'
    || '<tr><td style="color:#7d8b83;padding:6px 0">العميل</td><td style="padding:6px 0">'
         || coalesce(new.customer_name, '—') || '</td></tr>';

  html := '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:520px;margin:auto;color:#0c1a12">'
       || '<h2 style="color:#0a6b41;margin:0 0 4px">حجز مؤكّد جديد ☕</h2>'
       || '<p style="color:#7d8b83;margin:0 0 16px">رقم الطلب ' || new.ref || '</p>'
       || '<table style="width:100%;border-collapse:collapse;font-size:15px">' || rows_html || '</table>'
       || coalesce('<p style="margin:16px 0 0"><a href="' || map_url || '" style="color:#0a6b41">افتح الموقع على الخريطة</a></p>', '')
       || '<p style="margin:20px 0 0"><a href="https://wekad.store/dashboard.html" '
       || 'style="background:#0a6b41;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">افتح اللوحة</a></p>'
       || '</div>';

  subject := 'حجز مؤكّد — ' || day_txt || ' — ' || coalesce(new.city, '');

  -- إيميل مستقل لكل حساب، كلها في طلب واحد (حد Resend المجاني ٢ طلب/ثانية)
  select jsonb_agg(jsonb_build_object(
           'from', 'وِكاد <orders@wekad.store>',
           'to', jsonb_build_array(p.email),
           'subject', subject,
           'html', html))
    into batch
    from public.profiles p
    where p.email is not null;

  if batch is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails/batch',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json'),
    body := batch
  );
  return new;
exception when others then
  return new;                         -- أي خلل في الإيميل لا يمنع حفظ الطلب
end;
$$;

drop trigger if exists orders_notify_confirmed on public.orders;
create trigger orders_notify_confirmed
after insert or update of status on public.orders
for each row
when (new.status = 'confirmed')
execute function public.notify_confirmed_order();
