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
  days_en text[] := array['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  months_en text[] := array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  day date := coalesce(new.setup_date, new.event_date);
  day_ar text;
  day_en text;
  city_en text;
  pkg_en text;
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
    day_ar := days_ar[extract(dow from day)::int + 1] || '، '
           || extract(day from day)::int || ' ' || months_ar[extract(month from day)::int]
           || ' ' || extract(year from day)::int;
    day_en := days_en[extract(dow from day)::int + 1] || ', '
           || extract(day from day)::int || ' ' || months_en[extract(month from day)::int]
           || ' ' || extract(year from day)::int;
  else
    day_ar := 'لم يُحدَّد';
    day_en := 'Not set';
  end if;

  city_en := case new.city
    when 'الدمام' then 'Dammam' when 'الخبر' then 'Khobar' when 'الظهران' then 'Dhahran'
    when 'القطيف' then 'Qatif' when 'سيهات' then 'Saihat' when 'أخرى' then 'Other'
    else coalesce(new.city, '—') end;

  pkg_en := replace(replace(replace(coalesce(new.package_name, '—'),
              'باقة مخصصة', 'Custom package'), 'كوب', 'cups'), 'حافظ', 'Flask ');

  select coalesce(sum((i->>'qty')::numeric), 0)::int into female
    from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) i
    where i->>'id' = 'barista' or i->>'unit' = 'باريستا';

  if new.lat is not null and new.lng is not null then
    map_url := 'https://maps.google.com/?q=' || new.lat || ',' || new.lng;
  end if;

  -- كل سطر: العنوان بالعربي والإنقليزي، والقيمة بالعربي وتحتها الإنقليزي
  rows_html :=
       '<tr><td style="color:#7d8b83;padding:8px 0;vertical-align:top">اليوم<br><small>Date</small></td>'
    || '<td style="padding:8px 0"><b>' || day_ar || '</b><br><span dir="ltr">' || day_en || '</span></td></tr>'
    || '<tr><td style="color:#7d8b83;padding:8px 0;vertical-align:top">وقت التركيب<br><small>Setup time</small></td>'
    || '<td style="padding:8px 0" dir="ltr">' || coalesce(new.setup_time::text, '—') || '</td></tr>'
    || '<tr><td style="color:#7d8b83;padding:8px 0;vertical-align:top">الموقع<br><small>Location</small></td>'
    || '<td style="padding:8px 0">' || coalesce(new.city, '—') || coalesce(' — ' || new.district, '')
    || coalesce('<br>' || new.venue, '') || '<br><span dir="ltr">' || city_en || '</span></td></tr>'
    || '<tr><td style="color:#7d8b83;padding:8px 0;vertical-align:top">الباقة<br><small>Package</small></td>'
    || '<td style="padding:8px 0">' || coalesce(new.package_name, '—') || ' · ' || coalesce(new.days, 1) || ' يوم'
    || '<br><span dir="ltr">' || pkg_en || ' · ' || coalesce(new.days, 1) || ' day(s)</span></td></tr>'
    || '<tr><td style="color:#7d8b83;padding:8px 0;vertical-align:top">الباريستا<br><small>Baristas</small></td>'
    || '<td style="padding:8px 0">رجل ' || coalesce(new.included_baristas, 0) || ' · بنت ' || female
    || '<br><span dir="ltr">Male ' || coalesce(new.included_baristas, 0) || ' · Female ' || female || '</span></td></tr>'
    || '<tr><td style="color:#7d8b83;padding:8px 0;vertical-align:top">العميل<br><small>Customer</small></td>'
    || '<td style="padding:8px 0">' || coalesce(new.customer_name, '—') || '</td></tr>';

  html := '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:540px;margin:auto;color:#0c1a12">'
       || '<h2 style="color:#0a6b41;margin:0">حجز مؤكّد جديد ☕</h2>'
       || '<h3 dir="ltr" style="color:#0a6b41;margin:2px 0 4px;font-weight:normal;text-align:right">New confirmed booking</h3>'
       || '<p style="color:#7d8b83;margin:0 0 16px">رقم الطلب · Order <b dir="ltr">' || new.ref || '</b></p>'
       || '<table style="width:100%;border-collapse:collapse;font-size:15px">' || rows_html || '</table>'
       || coalesce('<p style="margin:16px 0 0"><a href="' || map_url || '" style="color:#0a6b41">'
       || 'افتح الموقع على الخريطة · Open map</a></p>', '')
       || '<p style="margin:20px 0 0"><a href="https://wekad.store/dashboard.html" '
       || 'style="background:#0a6b41;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">'
       || 'افتح اللوحة · Open dashboard</a></p>'
       || '</div>';

  subject := 'حجز مؤكّد | Confirmed booking — ' || day_en || ' — ' || city_en;

  -- إيميل مستقل لكل حساب، كلها في طلب واحد (حد Resend المجاني ٢ طلب/ثانية)
  select jsonb_agg(jsonb_build_object(
           'from', 'Wekad وِكاد <orders@wekad.store>',
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
