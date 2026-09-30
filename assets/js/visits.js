/* ==========================================================================
   وِكاد — تتبّع الزوار
   يسجّل الزيارات وخطوات الحجز في قاعدة بياناتنا، فتظهر الأرقام في اللوحة
   لحظياً بدل انتظار تقارير خارجية. لا تُخزَّن أي بيانات شخصية هنا.
   ========================================================================== */
(() => {
  'use strict';

  const cfg = window.WEKAD_CONFIG || {};
  if (!cfg.SUPABASE_URL) return;

  const LOGGED = new Set([
    'page_view', 'begin_checkout', 'booking_step', 'purchase', 'booking_error',
  ]);

  // معرّف مجهول ثابت للزائر + معرّف للجلسة الحالية
  function id(store, key) {
    try {
      let v = store.getItem(key);
      if (!v) {
        v = (crypto.randomUUID?.() || String(Math.random()).slice(2)).slice(0, 18);
        store.setItem(key, v);
      }
      return v;
    } catch {
      return 'anon';
    }
  }

  const visitor = id(localStorage, 'wekad_vid');
  const sessionId = id(sessionStorage, 'wekad_sid');

  /** من وين جاء الزائر: utm_source إن وُجد، وإلا نطاق المُحيل. */
  function source() {
    try {
      const utm = new URLSearchParams(location.search).get('utm_source');
      if (utm) return utm.toLowerCase().slice(0, 40);
      if (!document.referrer) return 'direct';
      const host = new URL(document.referrer).hostname.replace(/^www\./, '');
      if (host === location.hostname) return 'internal';
      if (/instagram/.test(host)) return 'instagram';
      if (/google/.test(host)) return 'google';
      if (/t\.co|twitter|x\.com/.test(host)) return 'twitter';
      if (/snapchat/.test(host)) return 'snapchat';
      if (/tiktok/.test(host)) return 'tiktok';
      if (/whatsapp|wa\.me/.test(host)) return 'whatsapp';
      return host.slice(0, 40);
    } catch {
      return 'direct';
    }
  }

  const device = matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';
  const src = source();

  function send(row) {
    const body = JSON.stringify(row);
    const url = `${cfg.SUPABASE_URL}/rest/v1/visits`;
    // fire-and-forget: التتبّع يجب ألا يؤخّر الصفحة أو يكسرها
    fetch(url, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: cfg.SUPABASE_KEY,
        Authorization: `Bearer ${cfg.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body,
    }).catch(() => { /* تجاهل */ });
  }

  window.wekadLogVisit = function wekadLogVisit(event, params = {}) {
    if (!LOGGED.has(event)) return;
    send({
      visitor,
      session_id: sessionId,
      event,
      step: params.step_name || params.step_label || null,
      source: src,
      referrer: (document.referrer || '').slice(0, 200) || null,
      device,
      path: location.pathname.slice(0, 120),
    });
  };

  // زيارة الصفحة تُسجَّل مرة واحدة لكل جلسة تحميل
  window.wekadLogVisit('page_view');
})();
