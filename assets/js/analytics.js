/* ==========================================================================
   وِكاد — التحليلات
   ضع معرّفاتك في الأسفل وخلاص. ما دامت فاضية، الموقع يشتغل عادي
   والأحداث تُطبع في Console فقط (مفيد وأنت تجرّب).
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------
     ✏️  ضع المعرّفات هنا
     ------------------------------------------------------------------ */

  // Google Analytics 4 — من analytics.google.com، شكله: G-XXXXXXXXXX
  const GA4_ID = 'G-0FR2WHHC0G';

  // Microsoft Clarity — من clarity.microsoft.com، شكله: abcdefghij
  const CLARITY_ID = '';

  /* ------------------------------------------------------------------ */

  const debug = !GA4_ID && !CLARITY_ID;

  // ---------- Google Analytics 4 ----------
  if (GA4_ID) {
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
    document.head.appendChild(tag);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA4_ID, { send_page_view: true });
  }

  // ---------- Microsoft Clarity (heatmaps + session recordings) ----------
  if (CLARITY_ID) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }

  /**
   * One call site for every event in the app. Sends to whichever providers are
   * configured; falls back to the console so events stay visible while testing.
   */
  window.wekadTrack = function wekadTrack(name, params = {}) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, params);
    }
    if (typeof window.clarity === 'function') {
      // Clarity takes a bare event name, plus tags we can segment recordings by.
      window.clarity('event', name);
      Object.entries(params).forEach(([key, value]) => {
        if (typeof value === 'string' || typeof value === 'number') {
          window.clarity('set', key, String(value));
        }
      });
    }
    // نسخة في قاعدة بياناتنا، لتظهر الأرقام في لوحة الطلبات لحظياً
    try { window.wekadLogVisit?.(name, params); } catch { /* لا يعطّل شيئاً */ }

    if (debug) console.info('[track]', name, params);
  };
})();
