/* ==========================================================================
   وِكاد — حفظ الطلبات
   يُستدعى لحظة ضغط "تأكيد الطلب"، قبل فتح واتساب، حتى لا تضيع بيانات
   العميل إذا لم يُكمل إرسال الرسالة.
   ========================================================================== */
(() => {
  'use strict';

  const cfg = window.WEKAD_CONFIG || {};
  const ready = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_KEY);

  /**
   * Writes one order row. Resolves to true on success.
   * Never throws: a database outage must not stop the customer from ordering.
   */
  window.wekadSaveOrder = async function wekadSaveOrder(order) {
    if (!ready) {
      console.info('[orders] لم تُضبط إعدادات قاعدة البيانات — تم تخطي الحفظ.');
      return false;
    }

    try {
      const response = await fetch(`${cfg.SUPABASE_URL}/rest/v1/orders`, {
        method: 'POST',
        headers: {
          apikey: cfg.SUPABASE_KEY,
          Authorization: `Bearer ${cfg.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(order),
      });

      if (!response.ok) {
        console.warn('[orders] فشل الحفظ:', response.status, await response.text());
        return false;
      }
      return true;
    } catch (error) {
      console.warn('[orders] تعذّر الاتصال بقاعدة البيانات:', error);
      return false;
    }
  };
})();
