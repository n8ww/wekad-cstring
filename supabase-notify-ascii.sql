


--

--   select vault.create_secret('re_xxxxxxxx', 'resend_api_key');


create extension if not exists pg_net;

create or replace function public.notify_confirmed_order()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  api_key text;
  days_ar text[] := array[U&'\0627\0644\0623\062D\062F',U&'\0627\0644\0627\062B\0646\064A\0646',U&'\0627\0644\062B\0644\0627\062B\0627\0621',U&'\0627\0644\0623\0631\0628\0639\0627\0621',U&'\0627\0644\062E\0645\064A\0633',U&'\0627\0644\062C\0645\0639\0629',U&'\0627\0644\0633\0628\062A'];
  months_ar text[] := array[U&'\064A\0646\0627\064A\0631',U&'\0641\0628\0631\0627\064A\0631',U&'\0645\0627\0631\0633',U&'\0623\0628\0631\064A\0644',U&'\0645\0627\064A\0648',U&'\064A\0648\0646\064A\0648',U&'\064A\0648\0644\064A\0648',U&'\0623\063A\0633\0637\0633',U&'\0633\0628\062A\0645\0628\0631',U&'\0623\0643\062A\0648\0628\0631',U&'\0646\0648\0641\0645\0628\0631',U&'\062F\064A\0633\0645\0628\0631'];
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
  
  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    return new;
  end if;

  select decrypted_secret into api_key
    from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if api_key is null then
    return new;                       
  end if;

  if day is not null then
    day_ar := days_ar[extract(dow from day)::int + 1] || U&'\060C '
           || extract(day from day)::int || ' ' || months_ar[extract(month from day)::int]
           || ' ' || extract(year from day)::int;
    day_en := days_en[extract(dow from day)::int + 1] || ', '
           || extract(day from day)::int || ' ' || months_en[extract(month from day)::int]
           || ' ' || extract(year from day)::int;
  else
    day_ar := U&'\0644\0645 \064A\064F\062D\062F\064E\0651\062F';
    day_en := 'Not set';
  end if;

  city_en := case new.city
    when U&'\0627\0644\062F\0645\0627\0645' then 'Dammam' when U&'\0627\0644\062E\0628\0631' then 'Khobar' when U&'\0627\0644\0638\0647\0631\0627\0646' then 'Dhahran'
    when U&'\0627\0644\0642\0637\064A\0641' then 'Qatif' when U&'\0633\064A\0647\0627\062A' then 'Saihat' when U&'\0623\062E\0631\0649' then 'Other'
    else coalesce(new.city, U&'\2014') end;

  pkg_en := replace(replace(replace(coalesce(new.package_name, U&'\2014'),
              U&'\0628\0627\0642\0629 \0645\062E\0635\0635\0629', 'Custom package'), U&'\0643\0648\0628', 'cups'), U&'\062D\0627\0641\0638', 'Flask ');

  select coalesce(sum((i->>'qty')::numeric), 0)::int into female
    from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) i
    where i->>'id' = 'barista' or i->>'unit' = U&'\0628\0627\0631\064A\0633\062A\0627';

  if new.lat is not null and new.lng is not null then
    map_url := 'https://maps.google.com/?q=' || new.lat || ',' || new.lng;
  end if;

  
  rows_html :=
       U&'<tr><td style="color:#7d8b83;padding:8px 0;vertical-align:top">\0627\0644\064A\0648\0645<br><small>Date</small></td>'
    || '<td style="padding:8px 0"><b>' || day_ar || '</b><br><span dir="ltr">' || day_en || '</span></td></tr>'
    || U&'<tr><td style="color:#7d8b83;padding:8px 0;vertical-align:top">\0648\0642\062A \0627\0644\062A\0631\0643\064A\0628<br><small>Setup time</small></td>'
    || '<td style="padding:8px 0" dir="ltr">' || coalesce(new.setup_time::text, U&'\2014') || '</td></tr>'
    || U&'<tr><td style="color:#7d8b83;padding:8px 0;vertical-align:top">\0627\0644\0645\0648\0642\0639<br><small>Location</small></td>'
    || '<td style="padding:8px 0">' || coalesce(new.city, U&'\2014') || coalesce(U&' \2014 ' || new.district, '')
    || coalesce('<br>' || new.venue, '') || '<br><span dir="ltr">' || city_en || '</span></td></tr>'
    || U&'<tr><td style="color:#7d8b83;padding:8px 0;vertical-align:top">\0627\0644\0628\0627\0642\0629<br><small>Package</small></td>'
    || '<td style="padding:8px 0">' || coalesce(new.package_name, U&'\2014') || U&' \00B7 ' || coalesce(new.days, 1) || U&' \064A\0648\0645'
    || '<br><span dir="ltr">' || pkg_en || U&' \00B7 ' || coalesce(new.days, 1) || ' day(s)</span></td></tr>'
    || U&'<tr><td style="color:#7d8b83;padding:8px 0;vertical-align:top">\0627\0644\0628\0627\0631\064A\0633\062A\0627<br><small>Baristas</small></td>'
    || U&'<td style="padding:8px 0">\0631\062C\0644 ' || coalesce(new.included_baristas, 0) || U&' \00B7 \0628\0646\062A ' || female
    || '<br><span dir="ltr">Male ' || coalesce(new.included_baristas, 0) || U&' \00B7 Female ' || female || '</span></td></tr>'
    || U&'<tr><td style="color:#7d8b83;padding:8px 0;vertical-align:top">\0627\0644\0639\0645\064A\0644<br><small>Customer</small></td>'
    || '<td style="padding:8px 0">' || coalesce(new.customer_name, U&'\2014') || '</td></tr>';

  html := '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:540px;margin:auto;color:#0c1a12">'
       || U&'<h2 style="color:#0a6b41;margin:0">\062D\062C\0632 \0645\0624\0643\0651\062F \062C\062F\064A\062F \2615</h2>'
       || '<h3 dir="ltr" style="color:#0a6b41;margin:2px 0 4px;font-weight:normal;text-align:right">New confirmed booking</h3>'
       || U&'<p style="color:#7d8b83;margin:0 0 16px">\0631\0642\0645 \0627\0644\0637\0644\0628 \00B7 Order <b dir="ltr">' || new.ref || '</b></p>'
       || '<table style="width:100%;border-collapse:collapse;font-size:15px">' || rows_html || '</table>'
       || coalesce('<p style="margin:16px 0 0"><a href="' || map_url || '" style="color:#0a6b41">'
       || U&'\0627\0641\062A\062D \0627\0644\0645\0648\0642\0639 \0639\0644\0649 \0627\0644\062E\0631\064A\0637\0629 \00B7 Open map</a></p>', '')
       || '<p style="margin:20px 0 0"><a href="https://wekad.store/dashboard.html" '
       || 'style="background:#0a6b41;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">'
       || U&'\0627\0641\062A\062D \0627\0644\0644\0648\062D\0629 \00B7 Open dashboard</a></p>'
       || '</div>';

  subject := U&'\062D\062C\0632 \0645\0624\0643\0651\062F | Confirmed booking \2014 ' || day_en || U&' \2014 ' || city_en;

  
  select jsonb_agg(jsonb_build_object(
           'from', U&'Wekad \0648\0650\0643\0627\062F <orders@wekad.store>',
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
  return new;                         
end;
$$;

drop trigger if exists orders_notify_confirmed on public.orders;
create trigger orders_notify_confirmed
after insert or update of status on public.orders
for each row
when (new.status = 'confirmed')
execute function public.notify_confirmed_order();
