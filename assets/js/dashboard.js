/* ==========================================================================
   وِكاد — لوحة الطلبات
   تسجيل الدخول والقراءة يتمّان مباشرة مع Supabase؛ قواعد الصلاحيات في قاعدة
   البيانات هي ما يمنع أي زائر من رؤية بيانات العملاء.
   ========================================================================== */
(() => {
  'use strict';

  const cfg = window.WEKAD_CONFIG || {};
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const STATUS_KEYS = {
    new: 'stNew', contacted: 'stContacted', confirmed: 'stConfirmed',
    done: 'stDone', cancelled: 'stCancelled',
  };
  const STATUS_COLOR = {
    new: 'var(--ramp-2)', contacted: 'var(--ramp-3)', confirmed: 'var(--brand)',
    done: 'var(--st-done)', cancelled: 'var(--st-cancelled)',
  };
  const statusName = (k) => t(STATUS_KEYS[k] || 'stNew');
  const WON = ['confirmed', 'done'];
  const JOB_FLOW = [
    { key: 'pending',   label: 'jsPending' },
    { key: 'departed',  label: 'jsDeparted' },
    { key: 'arrived',   label: 'jsArrived' },
    { key: 'installed', label: 'jsInstalled' },
    { key: 'finished',  label: 'jsFinished' },
  ];
  /** تقويم ميلادي بأرقام لاتينية في كل اللغات، حتى لا تختلط التواريخ. */
  const locale = () => ({
    ar: 'ar-SA-u-ca-gregory-nu-latn', en: 'en-GB', tl: 'fil-PH',
  }[window.WekadI18n.lang] || 'ar-SA-u-ca-gregory-nu-latn');

  const weekdayName = (index) => new Intl.DateTimeFormat(locale(), { weekday: 'long' })
    .format(new Date(Date.UTC(2024, 0, 7 + index)));

  let session = null;
  let role = null;          // admin | staff
  let schedule = [];       // ما يراه الموظف
  let allOrders = [];   // كل ما حُمّل
  let allVisits = [];
  let scopedVisits = [];
  let scoped = [];      // بعد تطبيق المدى الزمني
  let rangeDays = 0;    // 0 = كل الفترات
  let customRange = null; // { from, to } بصيغة YYYY-MM-DD عند اختيار «من – إلى»
  let sortKey = 'created_at';
  let sortDir = -1;
  let statusFilter = '';   // زر الحالة المختار في صفحة الطلبات
  let listMode = 'active'; // active = الطلبات الجارية · archive = السجل
  let pendingFilter = null; // تصفية تأتي من «عرض الكل» في الرئيسية
  let drawerId = null;     // الطلب المفتوح في اللوحة الجانبية
  let drawerDirty = false; // تعديلات لم تُحفظ بعد

  // ---------- تنسيق ----------
  const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
  const n2 = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : '—');
  /**
   * «الاثنين، 20 أكتوبر 2026» — اسم اليوم أولاً لأن الطاقم يقرأه قبل الرقم.
   * الشهر بالاسم لا بالرقم: الفلبينية ترتّب شهر/يوم بينما العربية والإنجليزية
   * ترتّبان يوم/شهر، فالأرقام وحدها تقرأ تاريخين مختلفين على نفس الكرت.
   */
  function dayLabel(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return dateOnly(v);
    return new Intl.DateTimeFormat(locale(), {
      weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
    }).format(d);
  }
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

  function dateTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(locale(), {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(d);
  }

  // ---------- الشبكة ----------
  const send = (path, options) => fetch(`${cfg.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: cfg.SUPABASE_KEY,
      Authorization: `Bearer ${session?.access_token ?? cfg.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  /**
   * رمز الدخول يعيش ساعة واحدة. نجدّده قبل انتهائه بدقيقتين، ومرة ثانية إن
   * رفضه الخادم، حتى لا يُطرد الموظف من اللوحة وهو في الموقع.
   */
  async function api(path, options = {}) {
    if (session?.refresh_token && session.expires_at
      && Date.now() / 1000 > session.expires_at - 120) {
      await refreshSession();
    }
    let response = await send(path, options);
    if (response.status === 401 && session?.refresh_token && (await refreshSession())) {
      response = await send(path, options);
    }
    return response;
  }

  let refreshing = null;
  /** يجدّد الجلسة مرة واحدة حتى لو طلبتها عدة نداءات في نفس اللحظة. */
  function refreshSession() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const r = await fetch(`${cfg.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { apikey: cfg.SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        if (!r.ok) return false;
        saveSession(await r.json());
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  // ---------- الجلسة ----------
  const STORE_KEY = 'wekad_session';
  const saveSession = (d) => { session = d; try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch {} };
  const loadSession = () => { try { const r = localStorage.getItem(STORE_KEY); if (r) session = JSON.parse(r); } catch {} };
  const clearSession = () => { session = null; try { localStorage.removeItem(STORE_KEY); } catch {} };

  async function signIn(email, password) {
    const response = await fetch(`${cfg.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: cfg.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = data.error_code || '';
      const msg = data.error_description || data.msg || '';
      if (code === 'email_not_confirmed' || /not confirmed/i.test(msg)) {
        const e = new Error(t('notConfirmed'));
        e.pending = true;
        throw e;
      }
      const e = new Error(/invalid login/i.test(msg) ? t('badLogin') : (msg || t('loginFail')));
      e.raw = msg;
      throw e;
    }
    return data;
  }

  async function fetchOrders() {
    const response = await api('/rest/v1/orders?select=*&order=created_at.desc&limit=5000');
    if (response.status === 401) { clearSession(); showLogin(t('sessionEnded')); return null; }
    if (!response.ok) throw new Error('تعذّر تحميل الطلبات');
    return response.json();
  }

  async function signUp(email, password) {
    const response = await fetch(`${cfg.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: cfg.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data.msg || data.error_description || data.message || '';
      // الرمز هو ما يُفحص لاحقاً؛ مطابقة النص المترجم تنهار بتغيير اللغة
      if (/already/i.test(msg)) {
        const e = new Error(t('emailTaken')); e.code = 'email_taken'; throw e;
      }
      if (/password/i.test(msg)) {
        const e = new Error(t('shortPass')); e.code = 'weak_password'; throw e;
      }
      throw new Error(msg || t('createFail'));
    }
    return data;   // قد يحتوي جلسة مباشرة، أو لا شيء إن كان التأكيد بالبريد مفعّلاً
  }

  /**
   * يربط الحساب بصلاحيته من قائمة المسموح لهم. يُستدعى بعد كل دخول، فيغطّي
   * حالة من أُضيف بعد أن أنشأ حسابه.
   */
  async function claimAccess() {
    const response = await api('/rest/v1/rpc/claim_access', { method: 'POST', body: '{}' });
    if (!response.ok) return null;
    const value = await response.json().catch(() => null);
    return typeof value === 'string' ? value : null;
  }

  async function saveLang(code) {
    try { await api('/rest/v1/rpc/set_my_lang', { method: 'POST', body: JSON.stringify({ p_lang: code }) }); }
    catch { /* الاختيار محفوظ محلياً على أي حال */ }
  }

  /** لغة الحساب من قاعدة البيانات، إن وُجدت. */
  async function fetchProfileLang() {
    const r = await api('/rest/v1/profiles?select=lang&limit=1');
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return rows[0]?.lang || null;
  }

  async function fetchRole() {
    const response = await api('/rest/v1/rpc/my_role', { method: 'POST', body: '{}' });
    if (!response.ok) return null;
    const value = await response.json().catch(() => null);
    return typeof value === 'string' ? value : null;
  }

  /** عرض الموظف: الجدول فقط — لا يحتوي أي عمود سعر من الأساس. */
  async function fetchSchedule() {
    const response = await api('/rest/v1/schedule?select=*&order=event_date.asc&limit=2000');
    if (!response.ok) return [];
    return response.json();
  }

  async function fetchVisits() {
    const response = await api('/rest/v1/visits?select=*&order=created_at.desc&limit=20000');
    if (!response.ok) return [];          // الجدول قد لا يكون مُنشأً بعد
    return response.json();
  }

  async function updateStatus(id, status) {
    const response = await api(`/rest/v1/orders?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status }),
    });
    return response.ok;
  }

  /**
   * العميل صار يرسل اليوم فقط؛ بقية التفاصيل نأخذها بالمكالمة ونكتبها هنا.
   * القيم الفارغة تُحفظ null حتى لا تظهر كنص فارغ في جدول الطاقم.
   */
  async function patchOrder(id, fields) {
    const clean = {};
    Object.entries(fields).forEach(([key, value]) => {
      clean[key] = value === '' || value === undefined ? null : value;
    });
    const response = await api(`/rest/v1/orders?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(clean),
    });
    if (response.ok) return { ok: true };
    // نص الخطأ يسمّي العمود المفقود، وعليه نميّز «لم تُشغَّل الهجرة» عن عطل عام
    const detail = await response.text().catch(() => '');
    return { ok: false, detail };
  }

  // ==========================================================================
  //  إدارة المستخدمين (للأدمن)
  // ==========================================================================
  async function fetchStaff() {
    const [allowed, profiles] = await Promise.all([
      api('/rest/v1/allowed_staff?select=*&order=created_at.asc').then((r) => (r.ok ? r.json() : [])),
      api('/rest/v1/profiles?select=email,role').then((r) => (r.ok ? r.json() : [])),
    ]);
    const joined = new Map(profiles.map((p) => [String(p.email || '').toLowerCase(), p.role]));
    return allowed.map((a) => ({
      ...a,
      registered: joined.has(String(a.email).toLowerCase()),
    }));
  }

  async function renderStaff() {
    const rows = await fetchStaff();
    const el = $('#staff-list');
    if (!el) return;
    el.innerHTML = !rows.length
      ? `<p class="empty">${t('noResults')}</p>`
      : rows.map((r) => {
        const isMe = String(r.email).toLowerCase() === String(session?.user?.email || '').toLowerCase();
        return `
        <div class="staff-row">
          <span class="staff-mail" dir="ltr">${esc(r.email)}${isMe ? ` <span class="me">${t('you')}</span>` : ''}</span>
          <select class="status-select role-select" data-email="${esc(r.email)}" ${isMe ? `disabled title="${t('cantChangeSelf')}"` : ''}>
            <option value="staff" ${r.role === 'staff' ? 'selected' : ''}>${t('staff')}</option>
            <option value="admin" ${r.role === 'admin' ? 'selected' : ''}>${t('admin')}</option>
          </select>
          <span class="staff-state ${r.registered ? 'ok' : ''}">
            ${r.registered ? t('registered') : t('notRegistered')}</span>
          ${r.registered ? `<button class="btn btn-ghost btn-sm" data-reset="${esc(r.email)}">${t('resetPass')}</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-remove="${esc(r.email)}" ${isMe ? 'disabled' : ''}>${t('remove')}</button>
        </div>`;
      }).join('');
  }

  async function allowEmail(email, staffRole, staffLang) {
    const response = await api('/rest/v1/allowed_staff', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), role: staffRole, lang: staffLang }),
    });
    return response.ok;
  }

  /**
   * ينشئ حساب الموظف بكلمة مرور يحدّدها المدير.
   * يُستدعى مسار التسجيل العام بمفتاح الموقع، والجلسة العائدة تُهمل عمداً
   * حتى لا تحلّ محل جلسة المدير في المتصفح.
   */
  /**
   * رابط إعادة تعيين كلمة المرور. المفتاح العام لا يسمح بتغيير كلمة مرور
   * مستخدم آخر مباشرة، فالبريد هو الطريق الوحيد من داخل اللوحة.
   * Supabase يرد بنجاح حتى لو لم يوجد البريد، منعاً لتعداد الحسابات.
   */
  async function sendReset(email) {
    try {
      const response = await fetch(`${cfg.SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: { apikey: cfg.SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      return response.ok;
    } catch {
      return false;                    // انقطاع الشبكة لا يترك الزر معطّلاً
    }
  }

  // ==========================================================================
  //  حجز يدوي — العميل الذي يتصل بدل أن يحجز من الموقع
  // ==========================================================================

  /** نفس صيغة مرجع الموقع، بحروف لا تلتبس عند الإملاء في الهاتف. */
  function newRef() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let tail = '';
    crypto.getRandomValues(new Uint8Array(5))
      .forEach((b) => { tail += alphabet[b % alphabet.length]; });
    return `WK-${tail}`;
  }

  /** يملأ قوائم النموذج من الكتالوج، فلا تتكرّر الأسماء في مكانين. */
  function fillOrderForm() {
    const c = cat();
    if (!c || !$('#o-service')) return;

    $('#o-service').innerHTML = ['counter', 'flask']
      .map((k) => `<option value="${k}">${esc(c.name(k))}</option>`).join('');

    $('#o-city').innerHTML = Object.keys(c.CITIES)
      .map((k) => `<option value="${esc(k)}">${esc(c.city(k))}</option>`).join('');

    syncPackageOptions();
  }

  /** الباقات تتبع الخدمة المختارة؛ الحافظات لا تُقاس بالأكواب. */
  function syncPackageOptions() {
    const c = cat();
    const service = $('#o-service')?.value || 'counter';
    const select = $('#o-package');
    if (!c || !select) return;

    select.innerHTML = service === 'counter'
      ? c.PACKAGES.map((n) => `<option value="p${n}">${n} ${c.unit('كوب')}</option>`).join('')
        + `<option value="custom">${esc(c.name('custom'))}</option>`
      : c.FLASKS.map((id) => `<option value="${id}">${esc(c.name(id))}</option>`).join('');

    syncCupsField();
  }

  function syncCupsField() {
    const wrap = $('#o-cups-wrap');
    if (wrap) wrap.hidden = $('#o-package')?.value !== 'custom';
  }

  /**
   * يُدرج الطلب بجلسة المدير: قاعدة البيانات تسمح للموقع العام بطلب «جديد»
   * فقط، والحجز اليدوي يُسجَّل غالباً «مؤكّداً». مشغّل إقفال اليوم يعمل كذلك.
   */
  async function saveManualOrder(row) {
    // الصف يرجع من القاعدة بمعرّفه، فيُضاف للقائمة دون إعادة تحميل اللوحة كلها.
    // ومهلة ٢٠ ثانية حتى لا يبقى الزر معلّقاً إن انقطع الاتصال.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const response = await api('/rest/v1/orders', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(row),
        signal: ctrl.signal,
      });
      if (!response.ok) return { ok: false, error: (await response.text()).slice(0, 180) };
      const rows = await response.json().catch(() => []);
      return { ok: true, saved: Array.isArray(rows) ? rows[0] : null };
    } catch (error) {
      return { ok: false, error: error.name === 'AbortError' ? t('slowNet') : t('noNet') };
    } finally {
      clearTimeout(timer);
    }
  }

  async function createStaffAccount(email, password) {
    const response = await fetch(`${cfg.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: cfg.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const msg = data.msg || data.error_description || data.message || '';
      if (/already/i.test(msg)) return { ok: true, existed: true };
      if (/signup.*disabled|not allowed/i.test(msg)) {
        return { ok: false, error: t('signupOff') };
      }
      return { ok: false, error: msg || t('createFail') };
    }
    return { ok: true, confirmed: Boolean(data.access_token), existed: false };
  }

  /** يحذّر المدير إذا كان مشروع Supabase ما زال يطلب تأكيد البريد. */
  async function checkConfirmSetting() {
    try {
      const r = await fetch(`${cfg.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: cfg.SUPABASE_KEY } });
      const d = await r.json();
      const box = $('#confirm-warn');
      if (!box) return;
      if (d.mailer_autoconfirm === false) {
        box.innerHTML = t('confirmWarn');
        box.hidden = false;
      } else {
        box.hidden = true;
      }
    } catch { /* تنبيه فقط */ }
  }

  /** تغيير صلاحية مستخدم: في قائمة المسموح لهم وفي ملفه إن كان مسجّلاً. */
  async function changeRole(email, newRole) {
    const key = encodeURIComponent(email);
    const a = await api(`/rest/v1/allowed_staff?email=eq.${key}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ role: newRole }),
    });
    await api(`/rest/v1/profiles?email=eq.${key}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ role: newRole }),
    });
    return a.ok;
  }

  async function removeStaff(email) {
    const a = await api(`/rest/v1/allowed_staff?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' });
    // يُحذف ملفه أيضاً فيفقد الوصول فوراً
    await api(`/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' });
    return a.ok;
  }

  // ==========================================================================
  //  قائمة التجهيز
  // ==========================================================================
  let checklist = [];

  /** نص البند بلغة المستخدم، مع الرجوع للعربية. */
  const cat = () => window.WekadCatalog;

  /**
   * اسم الباقة بلغة العرض. الباقات العادية رقم أكواب فقط، والحافظات
   * والباقة المخصصة لها أسماء في الكتالوج.
   */
  function packageLabel(r) {
    const id = r.package_id;
    if (r.custom_cups) {
      return `${cat() ? cat().name('custom') : 'باقة مخصصة'} — ${n0(r.custom_cups)} ${unitName2('كوب')}`;
    }
    if (id && /^p\d+$/.test(id)) return `${id.slice(1)} ${unitName2('كوب')}`;
    if (id && cat() && cat().NAMES[id]) return cat().name(id);
    return r.package_name || '—';
  }
  /** اسم الصنف بلغة العرض؛ الاسم المحفوظ احتياطي إن كان المعرّف مجهولاً. */
  const itemName = (it) => (cat() ? cat().name(it.id, it.name) : (it.name || it.id));
  const unitName2 = (u) => (cat() ? cat().unit(u) : (u || ''));
  const cityName = (c) => (cat() ? cat().city(c) : (c || ''));

  function itemLabel(it) {
    const lang = window.WekadI18n.lang;
    return (lang === 'en' && it.label_en) || (lang === 'tl' && it.label_tl) || it.label_ar;
  }

  async function fetchChecklist() {
    const r = await api('/rest/v1/checklist_items?select=*&active=is.true&order=sort_order.asc');
    return r.ok ? r.json() : [];
  }

  const UNITS = ['', 'kg', 'pcs', 'l', 'box', 'carton', 'bag'];
  const unitName = (u) => (u ? t('u' + u.charAt(0).toUpperCase() + u.slice(1)) : '');

  function unitOptions(selected) {
    return UNITS.map((u) =>
      `<option value="${u}" ${u === (selected || '') ? 'selected' : ''}>${u ? unitName(u) : t('uNone')}</option>`).join('');
  }

  let editingItem = null;

  async function renderItems() {
    const r = await api('/rest/v1/checklist_items?select=*&order=sort_order.asc');
    const rows = r.ok ? await r.json() : [];
    const el = $('#item-list');
    if (!el) return;

    el.innerHTML = !rows.length
      ? `<p class="empty">${t('noItems')}</p>`
      : rows.map((it, i) => {
        if (String(editingItem) === String(it.id)) {
          // صف قيد التعديل: كل الحقول قابلة للتغيير
          return `
          <form class="item-edit" data-save="${it.id}">
            <label class="f"><span>${t('itemAr')}</span>
              <input name="ar" value="${esc(it.label_ar)}" required></label>
            <label class="f"><span>${t('itemEn')}</span>
              <input name="en" dir="ltr" value="${esc(it.label_en || '')}"></label>
            <label class="f"><span>${t('itemTl')}</span>
              <input name="tl" dir="ltr" value="${esc(it.label_tl || '')}"></label>
            <label class="f"><span>${t('unit')}</span>
              <select name="unit">${unitOptions(it.unit)}</select></label>
            <label class="f"><span>${t('defaultQty')}</span>
              <input name="qty" type="number" step="0.5" min="0" dir="ltr"
                     value="${it.default_qty ?? ''}"></label>
            <div class="item-edit-actions">
              <button type="submit" class="btn btn-solid btn-sm">${t('save')}</button>
              <button type="button" class="btn btn-ghost btn-sm" data-canceledit="1">${t('cancel')}</button>
            </div>
          </form>`;
        }
        const qtyBadge = it.unit
          ? `<span class="pill pill-staff">${it.default_qty ?? ''} ${unitName(it.unit)}</span>` : '';
        return `
        <div class="staff-row">
          <span class="staff-mail">${esc(it.label_ar)}</span>
          <span class="staff-state" dir="ltr">${esc(it.label_en || '—')} · ${esc(it.label_tl || '—')}</span>
          ${qtyBadge}
          <button class="btn btn-ghost btn-sm" data-move="${it.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-ghost btn-sm" data-move="${it.id}" data-dir="1" ${i === rows.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-ghost btn-sm" data-edititem="${it.id}">${t('edit')}</button>
          <button class="btn btn-ghost btn-sm" data-delitem="${it.id}" data-label="${esc(it.label_ar)}">${t('remove')}</button>
        </div>`;
      }).join('');
    checklist = rows.filter((x) => x.active);
  }

  async function addItem(fields) {
    const r = await api('/rest/v1/checklist_items', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ...fields, sort_order: Date.now() % 100000 }),
    });
    return r.ok;
  }

  async function updateItem(id, fields) {
    const r = await api(`/rest/v1/checklist_items?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(fields),
    });
    return r.ok;
  }

  /** يبدّل ترتيب البند مع جاره (dir = -1 للأعلى، 1 للأسفل). */
  async function moveItem(id, dir) {
    const r = await api('/rest/v1/checklist_items?select=id,sort_order&order=sort_order.asc');
    const rows = r.ok ? await r.json() : [];
    const i = rows.findIndex((x) => String(x.id) === String(id));
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return false;
    // ترتيب متساوٍ لا يتبدّل بالتبديل، فنعيد ترقيم الكل أولاً
    rows.forEach((x, k) => { x.sort_order = (k + 1) * 10; });
    [rows[i].sort_order, rows[j].sort_order] = [rows[j].sort_order, rows[i].sort_order];
    const results = await Promise.all(rows.map((x) => updateItem(x.id, { sort_order: x.sort_order })));
    return results.every(Boolean);
  }

  async function deleteItem(id) {
    return (await api(`/rest/v1/checklist_items?id=eq.${id}`, { method: 'DELETE' })).ok;
  }

  // ---------- تعليم البنود لكل طلب ----------
  let checksByOrder = new Map();

  async function fetchChecks(orderIds) {
    if (!orderIds.length) return new Map();
    const list = orderIds.join(',');
    const r = await api(`/rest/v1/order_checks?select=*&order_id=in.(${list})`);
    const rows = r.ok ? await r.json() : [];
    const map = new Map();
    rows.forEach((row) => {
      if (!map.has(row.order_id)) map.set(row.order_id, new Map());
      map.get(row.order_id).set(row.item_id, row);
    });
    return map;
  }

  async function setJobStatus(orderId, status) {
    const r = await api('/rest/v1/rpc/set_job_status', {
      method: 'POST',
      body: JSON.stringify({ p_order: Number(orderId), p_status: status }),
    });
    return r.ok;
  }

  async function saveCheck(orderId, itemId, patch) {
    const current = checksByOrder.get(Number(orderId))?.get(Number(itemId)) || {};
    const next = {
      order_id: Number(orderId),
      item_id: Number(itemId),
      checked: patch.checked ?? current.checked ?? false,
      qty: patch.qty !== undefined ? patch.qty : (current.qty ?? null),
    };
    next.checked_by = next.checked ? (session?.user?.email || '') : null;
    next.checked_at = next.checked ? new Date().toISOString() : null;

    const r = await api('/rest/v1/order_checks', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(next),
    });
    if (r.ok) {
      if (!checksByOrder.has(Number(orderId))) checksByOrder.set(Number(orderId), new Map());
      checksByOrder.get(Number(orderId)).set(Number(itemId), next);
    }
    return r.ok;
  }

  // ==========================================================================
  //  الأيام المقفلة
  // ==========================================================================
  async function fetchBlocked() {
    const r = await api('/rest/v1/blocked_dates?select=*&order=day.asc');
    return r.ok ? r.json() : [];
  }

  async function blockRange(from, to, reason) {
    const rows = [];
    const start = new Date(`${from}T12:00:00`);
    const end = new Date(`${to || from}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return false;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      rows.push({ day: d.toISOString().slice(0, 10), reason });
      if (rows.length > 400) break;          // حدّ أمان
    }
    const r = await api('/rest/v1/blocked_dates', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
    return r.ok;
  }

  async function unblockDay(day) {
    const r = await api(`/rest/v1/blocked_dates?day=eq.${day}`, { method: 'DELETE' });
    return r.ok;
  }

  async function renderBlocked() {
    const rows = await fetchBlocked();
    const list = $('#block-list');
    if (!list) return;

    const today = new Date().toISOString().slice(0, 10);
    const upcoming = rows.filter((r) => r.day >= today);
    $('#block-count').textContent = upcoming.length
      ? t('closedCount', { n: upcoming.length }) : t('noClosed');

    list.innerHTML = !rows.length
      ? `<p class="empty">${t('noClosedDays')}</p>`
      : rows.map((r) => {
          const past = r.day < today;
          const auto = r.reason === 'booked';
          // أي طلب أقفل هذا اليوم؟ يُستدلّ عليه من تاريخ المناسبة
          const refs = auto
            ? allOrders.filter((o) => o.event_date === r.day && o.status !== 'cancelled')
                .map((o) => o.ref).join(' · ')
            : '';
          return `
          <div class="staff-row${past ? ' is-past' : ''}">
            <span class="staff-mail tab">${esc(r.day)}</span>
            <span class="staff-state">${auto ? `${t('autoBlocked')}${refs ? ` — ${esc(refs)}` : ''}` : esc(r.reason || '—')}</span>
            ${past ? `<span class="pill pill-staff">${t('pastPill')}</span>`
                   : `<span class="pill ${auto ? 'pill-auto' : 'pill-closed'}">${auto ? t('autoPill') : t('closedPill')}</span>`}
            <button class="btn btn-ghost btn-sm" data-unblock="${esc(r.day)}">${t('openDay')}</button>
          </div>`;
        }).join('');
  }

  // ==========================================================================
  //  الحسابات
  // ==========================================================================
  const itemsOf = (row) => (Array.isArray(row.items) ? row.items : []);
  const cupsOf = (row) => {
    const m = String(row.package_name || '').match(/(\d+)/);
    return row.service === 'counter' && m ? Number(m[1]) * (row.days || 1) : 0;
  };

  /** أيام بين إنشاء الطلب وتاريخ المناسبة. */
  function leadDays(row) {
    if (!row.event_date) return null;
    const diff = startOfDay(row.event_date) - startOfDay(row.created_at);
    const days = Math.round(diff / 86400000);
    return days >= 0 ? days : null;
  }

  function summarise(rows) {
    const won = rows.filter((r) => WON.includes(r.status));
    const revenue = won.reduce((s, r) => s + Number(r.total || 0), 0);
    const pipeline = rows
      .filter((r) => ['new', 'contacted'].includes(r.status))
      .reduce((s, r) => s + Number(r.total || 0), 0);

    const leads = rows.map(leadDays).filter((v) => v !== null);
    const withSweets = rows.filter((r) => Number(r.desserts_total) > 0).length;

    const today = startOfDay(new Date());
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
    const upcoming = rows.filter((r) => {
      if (!r.event_date || r.status === 'cancelled') return false;
      const d = startOfDay(r.event_date);
      return d >= today && d <= in30;
    });

    return {
      count: rows.length,
      newCount: rows.filter((r) => r.status === 'new').length,
      wonCount: won.length,
      revenue,
      pipeline,
      avg: won.length ? revenue / won.length : 0,
      conversion: rows.length ? (won.length / rows.length) * 100 : 0,
      cups: rows.reduce((s, r) => s + cupsOf(r), 0),
      sweets: rows.reduce((s, r) => s + Number(r.desserts_total || 0), 0),
      addons: rows.reduce((s, r) => s + Number(r.addons_total || 0), 0),
      avgDays: rows.length ? rows.reduce((s, r) => s + Number(r.days || 1), 0) / rows.length : 0,
      avgLead: leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : 0,
      sweetRate: rows.length ? (withSweets / rows.length) * 100 : 0,
      companyRate: rows.length
        ? (rows.filter((r) => r.client_type === 'company').length / rows.length) * 100 : 0,
      upcoming: upcoming.length,
      upcomingValue: upcoming.reduce((s, r) => s + Number(r.total || 0), 0),
      biggest: rows.reduce((max, r) => Math.max(max, Number(r.total || 0)), 0),
      baristas: rows.reduce((s, r) => s + Number(r.included_baristas || 0), 0),
    };
  }

  function summariseTraffic(rows) {
    const views = rows.filter((v) => v.event === 'page_view');
    const uniq = (list, key) => new Set(list.map((v) => v[key]).filter(Boolean)).size;

    const started = uniq(rows.filter((v) => v.event === 'begin_checkout'), 'session_id');
    const finished = uniq(rows.filter((v) => v.event === 'purchase'), 'session_id');
    const sessions = uniq(views, 'session_id');

    return {
      visitors: uniq(views, 'visitor'),
      sessions,
      views: views.length,
      started,
      finished,
      startRate: sessions ? (started / sessions) * 100 : 0,
      finishRate: started ? (finished / started) * 100 : 0,
      overall: sessions ? (finished / sessions) * 100 : 0,
      perSession: sessions ? views.length / sessions : 0,
    };
  }

  /** كم جلسة وصلت كل خطوة من خطوات الحجز. */
  function funnelCounts(rows) {
    // الترتيب هنا لازم يطابق PANES في app.js: client ← service ← when ← review.
    // خطوتا size و items أُلغيتا من الموقع، فحذفهما يمنع صفّين صفريّين دائمين.
    const stepOrder = [
      [t('fVisitors'),    (v) => v.event === 'page_view'],
      [t('fStarted'),     (v) => v.event === 'begin_checkout'],
      [t('fClient'),      (v) => v.event === 'booking_step' && v.step === 'client'],
      [t('fStepService'), (v) => v.event === 'booking_step' && v.step === 'service'],
      [t('fWhen'),        (v) => v.event === 'booking_step' && v.step === 'when'],
      [t('fReview'),      (v) => v.event === 'booking_step' && v.step === 'review'],
      [t('fDone'),        (v) => v.event === 'purchase'],
    ];
    return stepOrder.map(([label, test]) => [
      label,
      new Set(rows.filter(test).map((v) => v.session_id).filter(Boolean)).size,
    ]);
  }

  /** حدود المدى المخصص كتواريخ: من بداية يوم «من» إلى نهاية يوم «إلى». */
  function customBounds() {
    const from = new Date(`${customRange.from}T00:00:00`);
    const to = new Date(`${customRange.to}T23:59:59.999`);
    return { from, to, days: Math.round((startOfDay(to) - from) / 86400000) + 1 };
  }

  /** المدى السابق بنفس الطول، للمقارنة. */
  function previousWindow(days) {
    if (customRange) {
      const b = customBounds();
      const start = new Date(b.from); start.setDate(start.getDate() - b.days);
      return allOrders.filter((r) => {
        const d = new Date(r.created_at);
        return d >= start && d < b.from;
      });
    }
    if (!days) return [];
    const end = new Date(); end.setDate(end.getDate() - days);
    const start = new Date(end); start.setDate(start.getDate() - days);
    return allOrders.filter((r) => {
      const d = new Date(r.created_at);
      return d >= start && d < end;
    });
  }

  function tally(rows, pick, limit = 7) {
    const map = new Map();
    rows.forEach((row) => pick(row).forEach(({ key, qty }) => {
      if (!key) return;
      map.set(key, (map.get(key) || 0) + qty);
    }));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  }

  function byDay(rows, days, end = new Date()) {
    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = startOfDay(end);
      d.setDate(d.getDate() - i);
      buckets.push({ date: d, count: 0, revenue: 0 });
    }
    rows.forEach((row) => {
      const key = startOfDay(row.created_at).getTime();
      const hit = buckets.find((b) => b.date.getTime() === key);
      if (hit) { hit.count += 1; hit.revenue += Number(row.total || 0); }
    });
    return buckets;
  }

  function byMonth(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const d = new Date(row.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cur = map.get(key) || { count: 0, revenue: 0 };
      cur.count += 1;
      if (WON.includes(row.status)) cur.revenue += Number(row.total || 0);
      map.set(key, cur);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  }

  // ==========================================================================
  //  العرض
  // ==========================================================================
  function deltaHtml(now, before) {
    if (!before) return '';
    const pct = Math.round(((now - before) / before) * 100);
    if (!Number.isFinite(pct) || pct === 0) return '';
    const up = pct > 0;
    return `<span class="delta ${up ? 'delta-up' : 'delta-down'}">
      ${up ? '▲' : '▼'} <span class="num">${Math.abs(pct)}%</span></span>
      <span>${t('sVsPrev')}</span>`;
  }

  function kpi(label, value, unit, sub, hero) {
    return `<div class="kpi${hero ? ' kpi--hero' : ''}">
      <div class="k-label">${label}</div>
      <div class="k-value num">${value}${unit ? `<span class="k-unit">${unit}</span>` : ''}</div>
      <div class="k-sub">${sub || ''}</div>
    </div>`;
  }

  function renderKpis() {
    const s = summarise(scoped);
    const prev = summarise(previousWindow(rangeDays));

    $('#kpis-money').innerHTML = [
      kpi(t('kRevenue'), n0(s.revenue), t('sar'),
        deltaHtml(s.revenue, prev.revenue) || t('sFromConfirmed', { n: n0(s.wonCount) }), true),
      kpi(t('kOrders'), n0(s.count), '',
        deltaHtml(s.count, prev.count) || t('sThisPeriod')),
      kpi(t('kAvg'), n0(s.avg), t('sar'), t('sForConfirmed')),
      kpi(t('kConv'), `${s.conversion.toFixed(0)}%`, '', t('sOrderToConfirm')),
      kpi(t('kPipeline'), n0(s.pipeline), t('sar'), t('sNewOrders', { n: n0(s.newCount) })),
      kpi(t('kBiggest'), n0(s.biggest), t('sar'), t('sHighest')),
    ].join('');

    const tr = summariseTraffic(scopedVisits);
    $('#kpis-traffic').innerHTML = [
      kpi(t('kVisitors'), n0(tr.visitors), '', t('sSessions', { n: n0(tr.sessions) })),
      kpi(t('kViews'), n0(tr.views), '', t('sPerSession', { n: tr.perSession.toFixed(1) })),
      kpi(t('kStarted'), n0(tr.started), '', t('sOfSessions', { n: tr.startRate.toFixed(0) })),
      kpi(t('kFinished'), n0(tr.finished), '', t('sOfStarted', { n: tr.finishRate.toFixed(0) })),
      kpi(t('kV2O'), `${tr.overall.toFixed(1)}%`, '', t('sOverallConv')),
      kpi(t('kAvgVisitors'), n0(dailyAvgVisitors()), '', t('sThisPeriod')),
    ].join('');

    $('#kpis-ops').innerHTML = [
      kpi(t('kCups'), n0(s.cups), '', t('sPkgTimesDays')),
      kpi(t('kSweets'), n0(s.sweets), t('sar'), t('sSweetRate', { n: s.sweetRate.toFixed(0) })),
      kpi(t('kAddons'), n0(s.addons), t('sar'), t('sExtraBarista')),
      kpi(t('kBaristas'), n0(s.baristas), '', t('sFreeWithOrders')),
      kpi(t('kAvgDays'), s.avgDays.toFixed(1), t('day'), t('sPerOrder')),
      kpi(t('kLead'), Math.round(s.avgLead), t('day'), t('sBetweenOrderEvent')),
      kpi(t('kUpcoming'), n0(s.upcoming), '', t('sWithin30', { v: n0(s.upcomingValue) })),
      kpi(t('kCompanies'), `${s.companyRate.toFixed(0)}%`, '', t('sOfAllOrders')),
    ].join('');
  }

  function dailyAvgVisitors() {
    const views = scopedVisits.filter((v) => v.event === 'page_view');
    if (!views.length) return 0;
    const days = new Set(views.map((v) => startOfDay(v.created_at).getTime())).size || 1;
    return new Set(views.map((v) => v.visitor)).size / days;
  }

  function renderBars(el, entries, unit, fmt = n0) {
    if (!entries.length) { el.innerHTML = `<p class="empty">${t('noData')}</p>`; return; }
    const max = entries[0][1] || 1;
    el.innerHTML = entries.map(([name, qty]) => `
      <div class="bar-row" title="${esc(name)}: ${fmt(qty)} ${unit}">
        <span class="name">${esc(name)}</span>
        <span class="val num">${fmt(qty)}${unit ? ` ${unit}` : ''}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(qty / max) * 100}%"></span></span>
      </div>`).join('');
  }

  function renderDaily() {
    const custom = customRange ? customBounds() : null;
    const days = custom ? Math.min(custom.days, 60) : (rangeDays && rangeDays <= 30 ? rangeDays : 30);
    const orderBuckets = byDay(scoped, days, custom ? custom.to : new Date());

    const views = scopedVisits.filter((v) => v.event === 'page_view');
    const visitorBuckets = orderBuckets.map((b) => {
      const same = views.filter((v) => startOfDay(v.created_at).getTime() === b.date.getTime());
      return new Set(same.map((v) => v.visitor)).size;
    });

    // الزوار والطلبات كلاهما "عدد في اليوم" — نفس الوحدة، فمحور واحد يكفي
    const max = Math.max(1, ...visitorBuckets, ...orderBuckets.map((b) => b.count));
    const step = orderBuckets.length > 20 ? 5 : 2;

    $('#chart-daily').innerHTML = orderBuckets.map((b, i) => `
      <div class="col" title="${b.date.toISOString().slice(0, 10)} · ${visitorBuckets[i]} ${t('visitorsLegend')} · ${b.count} ${t('ordersLegend')} · ${n0(b.revenue)} ${t('sar')}">
        <span class="pair">
          <span class="col-bar bar-visitors" style="height:${(visitorBuckets[i] / max) * 120}px"></span>
          <span class="col-bar bar-orders" style="height:${(b.count / max) * 120}px"></span>
        </span>
        <span class="col-lbl">${i % step === 0 ? b.date.getDate() : ''}</span>
      </div>`).join('');

    const totalVisitors = visitorBuckets.reduce((a, c) => a + c, 0);
    const totalOrders = orderBuckets.reduce((sum, b) => sum + b.count, 0);
    $('#daily-note').innerHTML =
      `<span class="lg"><i style="background:var(--ramp-1)"></i>${t('visitorsLegend')} <b class="num">${n0(totalVisitors)}</b></span>
       <span class="lg"><i style="background:var(--ramp-4)"></i>${t('ordersLegend')} <b class="num">${n0(totalOrders)}</b></span>`;
  }

  function renderMonthly() {
    const months = byMonth(scoped);
    if (!months.length) { $('#chart-monthly').innerHTML = `<p class="empty">${t('noData')}</p>`; return; }
    const max = Math.max(1, ...months.map(([, v]) => v.revenue));
    $('#chart-monthly').innerHTML = months.map(([key, v]) => `
      <div class="col" title="${key} · ${n0(v.revenue)} ${t('sar')} · ${v.count} ${t('ordersLegend')}">
        <span class="col-bar" style="height:${(v.revenue / max) * 120}px"></span>
        <span class="col-lbl">${key.slice(5)}</span>
      </div>`).join('');
  }

  function renderStatusBars() {
    const counts = Object.entries(STATUS_KEYS)
      .map(([k]) => ({ key: k, ar: statusName(k), n: scoped.filter((r) => r.status === k).length }))
      .filter((c) => c.n > 0)
      .sort((a, b) => b.n - a.n);

    const el = $('#status-bars');
    if (!counts.length) { el.innerHTML = `<p class="empty">${t('noData')}</p>`; return; }
    const max = counts[0].n;
    const total = counts.reduce((sum, c) => sum + c.n, 0);

    el.innerHTML = counts.map((c, i) => `
      <div class="bar-row" title="${c.ar}: ${c.n} طلب">
        <span class="name">${c.ar}</span>
        <span class="val num">${c.n} · ${Math.round((c.n / total) * 100)}%</span>
        <span class="bar-track"><span class="bar-fill"
          style="width:${(c.n / max) * 100}%;background:${STATUS_COLOR[c.key] || 'var(--ramp-3)'}"></span></span>
      </div>`).join('');
  }

  function renderPanels() {
    renderDaily();
    renderMonthly();
    renderStatusBars();

    renderBars($('#top-packages'),
      tally(scoped, (r) => (r.package_name ? [{ key: r.package_name, qty: 1 }] : [])), '');

    renderBars($('#top-desserts'),
      tally(scoped, (r) => itemsOf(r).filter((i) => i.kind === 'dessert')
        .map((i) => ({ key: i.name, qty: i.qty }))), '');

    renderBars($('#top-cities'),
      tally(scoped, (r) => (r.city ? [{ key: r.city, qty: 1 }] : [])), '');

    renderBars($('#rev-cities'),
      tally(scoped.filter((r) => WON.includes(r.status)),
        (r) => (r.city ? [{ key: r.city, qty: Number(r.total || 0) }] : [])), t('sar'));

    renderBars($('#top-weekdays'),
      tally(scoped, (r) => (r.event_date
        ? [{ key: weekdayName(new Date(`${r.event_date}T12:00:00`).getDay()), qty: 1 }] : []), 7), '');

    // مسار الحجز — كل خطوة بنسبتها من الزوار
    const funnel = funnelCounts(scopedVisits);
    const top = funnel[0]?.[1] || 0;
    $('#funnel').innerHTML = !top
      ? `<p class="empty">${t('noData')}</p>`
      : funnel.map(([label, n], i) => `
          <div class="bar-row" title="${label}: ${n} جلسة">
            <span class="name">${label}</span>
            <span class="val num">${n0(n)} · ${Math.round((n / top) * 100)}%</span>
            <span class="bar-track"><span class="bar-fill"
              style="width:${(n / top) * 100}%;background:var(--ramp-${Math.min(5, 1 + Math.floor(i / 2))})"></span></span>
          </div>`).join('');

    const views = scopedVisits.filter((v) => v.event === 'page_view');
    renderBars($('#sources'),
      tally(views, (v) => (v.source ? [{ key: v.source, qty: 1 }] : [])), '');
    renderBars($('#devices'),
      tally(views, (v) => (v.device ? [{ key: v.device === 'mobile' ? 'Mobile' : 'Desktop', qty: 1 }] : [])), '');

    renderBars($('#top-addons'),
      tally(scoped, (r) => itemsOf(r).filter((i) => i.kind === 'addon')
        .map((i) => ({ key: i.name, qty: i.qty }))), '');
  }

  // ---------- الجدول ----------
  function visibleRows() {
    const q = $('#q').value.trim().toLowerCase();
    const city = $('#filter-city')?.value || '';
    const when = $('#filter-when')?.value || '';
    const today = todayIso();

    const rows = scoped.filter((r) => {
      if (!inMode(r)) return false;
      if (statusFilter === 'missing') {
        if (!needsCheck(r) || !missingOf(r).length) return false;
      } else if (statusFilter && r.status !== statusFilter) return false;
      if (city && r.city !== city) return false;
      if (when === 'upcoming' && !(eventDay(r) && eventDay(r) >= today)) return false;
      if (when === 'past' && !(eventDay(r) && eventDay(r) < today)) return false;
      if (!q) return true;
      return [r.ref, r.customer_name, r.phone, r.company, r.city, r.district, r.venue]
        .some((v) => String(v ?? '').toLowerCase().includes(q));
    });

    return rows.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (typeof av === 'number' || !Number.isNaN(Number(av)) && sortKey === 'total') {
        return (Number(av) - Number(bv)) * sortDir;
      }
      return String(av).localeCompare(String(bv)) * sortDir;
    });
  }

  /**
   * الخصم مشتقّ لا مُدخَل: نكتب السعر قبل وبعد، والنسبة تُحسب منهما.
   * ترجع null إذا لم يُسجَّل سعر قبل الخصم أو لم يكن هناك فرق.
   */
  /** المتبقي لا يُخزَّن: يُشتق دائماً من الإجمالي والعربون فلا يتعارضان. */
  function remainingOf(r) {
    const total = Number(r.total) || 0;
    const paid = Number(r.deposit) || 0;
    return Math.max(0, total - paid);
  }

  /** حالة السداد: بلا عربون · عربون واصل · مسدَّد بالكامل. */
  function payStateOf(r) {
    const paid = Number(r.deposit) || 0;
    if (!paid) return { key: 'none', label: t('payNone') };
    if (remainingOf(r) <= 0.009) return { key: 'full', label: t('payFull') };
    return { key: 'partial', label: t('payPartial') };
  }

  function discountOf(r) {
    const before = Number(r.price_before);
    const after = Number(r.total);
    if (!before || !Number.isFinite(after) || before <= after) return null;
    return { pct: Math.round(((before - after) / before) * 100), saved: before - after };
  }

  const discountPill = (r) => {
    const d = discountOf(r);
    return d ? `<span class="disc">−${d.pct}%</span>` : '';
  };

  /** حقول نكملها يدوياً بعد مكالمة العميل. */
  /** خانة واحدة في شبكة التفاصيل. */
  function fRow(label, name, type, value, extra = '') {
    return `<label${extra.includes('wide') ? ' class="wide"' : ''}><span>${label}</span>`
      + `<input type="${type}" name="${name}" value="${esc(value ?? '')}"${extra.replace('wide', '')}></label>`;
  }

  /** قائمة منسدلة داخل شبكة التفاصيل. */
  function fSelect(label, name, options, current) {
    const opts = options.map(([v, text]) =>
      `<option value="${esc(v)}" ${String(v) === String(current ?? '') ? 'selected' : ''}>${esc(text)}</option>`).join('');
    return `<label><span>${label}</span><select name="${name}">${opts}</select></label>`;
  }

  /** صف صنف واحد في محرّر الأصناف. */
  function itemRow(it = {}) {
    return `
      <div class="item-row">
        <input type="text"   data-f="name"  value="${esc(it.name || (it.id ? itemName(it) : ''))}" placeholder="${esc(t('fItemName'))}">
        <input type="number" data-f="qty"   value="${esc(it.qty ?? '')}"   min="0" step="1"    placeholder="${esc(t('fItemQty'))}">
        <input type="text"   data-f="unit"  value="${esc(it.unit || '')}"  placeholder="${esc(t('fItemUnit'))}">
        <input type="number" data-f="total" value="${esc(it.total ?? '')}" min="0" step="0.01" placeholder="${esc(t('fItemTotal'))}">
        <input type="hidden" data-f="id"    value="${esc(it.id || '')}">
        <input type="hidden" data-f="raw"   value="${esc(JSON.stringify(it))}">
        <button type="button" class="btn btn-ghost btn-sm" data-item-del>${t('fItemDel')}</button>
      </div>`;
  }

  /**
   * خانة واحدة. المطلوبة تحمل علامة «مطلوب» وتتلوّن ما دامت فاضية — تنبيه
   * بصري فقط، فالحفظ لا يُمنع ونقدر نسجّل ما عندنا الآن ونكمل لاحقاً.
   */
  function ff(label, control, { req = false, wide = false, hint = '', empty = false } = {}) {
    return `<label class="ff${wide ? ' wide' : ''}${req ? ' is-req' : ''}${req && empty ? ' is-empty' : ''}">
      <span class="ff-l">${label}${req ? `<em class="req">${t('required')}</em>` : ''}</span>
      ${control}
      ${hint ? `<small class="ff-h">${hint}</small>` : ''}
    </label>`;
  }
  const inp = (name, type, value, extra = '') =>
    `<input type="${type}" name="${name}" value="${esc(value ?? '')}"${extra}>`;
  const sel = (name, options, current) => `<select name="${name}">${options.map(([v, text]) =>
    `<option value="${esc(v)}" ${String(v) === String(current ?? '') ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
  const area = (name, value, rows = 2) => `<textarea name="${name}" rows="${rows}">${esc(value ?? '')}</textarea>`;
  const blank = (v) => v === null || v === undefined || String(v).trim() === '';

  /** بطاقة خطوة مرقّمة في نموذج الطلب. */
  const fs = (n, title, body, more = '') => `
    <section class="fs">
      <h5 class="fs-h"><span class="fs-n">${n}</span>${title}</h5>
      <div class="fs-grid">${body}</div>
      ${more ? `<details class="fs-more"><summary>${t('moreOpts')}</summary><div class="fs-grid">${more}</div></details>` : ''}
    </section>`;

  /**
   * نموذج الطلب مرتّب بترتيب المكالمة مع العميل:
   * من هو ← متى ← وين ← وش يبي ← بكم ← الحالة.
   */
  function fillForm(r) {
    const c = cat();
    const cities = c ? Object.keys(c.CITIES).map((k) => [k, c.city(k)]) : [];
    const statuses = Object.keys(STATUS_KEYS).map((k) => [k, statusName(k)]);
    const items = Array.isArray(r.items) ? r.items : [];
    const hasPin = Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng))
      && r.lat !== null && r.lng !== null;
    // يوم التركيب يظهر في الخيارات الإضافية فقط إن اختلف عن يوم المناسبة
    const setupDiff = r.setup_date && r.setup_date !== r.event_date ? r.setup_date : '';
    const eventDayVal = r.event_date || r.setup_date || '';

    return `
      <div class="fill-fields">
        ${fs(1, t('s1Client'), `
          ${ff(t('fName'), inp('customer_name', 'text', r.customer_name), { req: true, empty: blank(r.customer_name) })}
          ${ff(t('fPhone'), inp('phone', 'tel', r.phone, ' dir="ltr"'), { req: true, empty: blank(r.phone) })}
          ${ff(t('fClientType'), sel('client_type', [['individual', t('individual')], ['company', t('company')]], r.client_type || 'individual'))}
          ${ff(t('fCompany'), inp('company', 'text', r.company))}
        `, `
          ${ff(t('fVat'), inp('vat', 'text', r.vat, ' dir="ltr"'))}
        `)}

        ${fs(2, t('s2When'), `
          ${ff(t('fEventDay'), inp('event_date', 'date', eventDayVal), { req: true, empty: blank(eventDayVal) })}
          ${ff(t('fSetupTime'), inp('setup_time', 'time', r.setup_time), { req: true, empty: blank(r.setup_time), hint: t('hSetupTime') })}
          ${ff(t('fDays'), inp('days', 'number', r.days, ' min="1" max="30"'))}
        `, `
          ${ff(t('fSetupDiff'), inp('setup_date', 'date', setupDiff), { hint: t('hSetupDiff') })}
          ${ff(t('fServiceTime'), inp('event_time', 'time', r.event_time))}
        `)}

        ${fs(3, t('s3Where'), `
          ${ff(t('fCity'), sel('city', [['', '—'], ...cities], r.city), { req: true, empty: blank(r.city) || r.city === 'أخرى' })}
          ${ff(t('fDistrict'), inp('district', 'text', r.district))}
          ${ff(t('fVenue'), inp('venue', 'text', r.venue), { wide: true })}
          <div class="pin wide${hasPin ? '' : ' is-empty'}" data-pin>
            <div class="pin-head">
              <span class="ff-l">${t('fPin')}<em class="req">${t('required')}</em></span>
              <span class="pin-readout" data-pin-readout>${hasPin
                ? esc(t('fPinAt', { lat: Number(r.lat).toFixed(5), lng: Number(r.lng).toFixed(5) }))
                : t('fPinNone')}</span>
            </div>
            <p class="ff-h">${t('fPinHint')}</p>
            <div class="pin-map" data-pin-map></div>
            <div class="pin-tools">
              <input type="text" class="pin-paste" data-pin-paste placeholder="${esc(t('fPinPaste'))}">
              <button type="button" class="btn btn-solid btn-sm" data-pin-apply>${t('fPinApply')}</button>
              <button type="button" class="btn btn-ghost btn-sm" data-pin-here>${t('fPinHere')}</button>
              <button type="button" class="btn btn-ghost btn-sm" data-pin-clear>${t('fPinClear')}</button>
            </div>
            <input type="hidden" name="lat" value="${esc(hasPin ? r.lat : '')}">
            <input type="hidden" name="lng" value="${esc(hasPin ? r.lng : '')}">
          </div>
        `)}

        ${fs(4, t('s4Order'), `
          ${ff(t('fPackage'), inp('package_name', 'text', r.package_name), { wide: true })}
          ${ff(t('fBaristas'), inp('included_baristas', 'number', r.included_baristas, ' min="0" max="20"'))}
          ${ff(t('fBaristasF'), inp('female_baristas', 'number', femaleOf(r), ' min="0" max="20"'))}
          ${ff(t('fCustomReq'), area('custom_request', r.custom_request), { wide: true })}
          <div class="wide">
            <span class="ff-l">${t('fItems')}</span>
            <div class="items-edit" data-items>
              ${items.filter((it) => !isFemaleItem(it)).map((it) => itemRow(it)).join('')}
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-item-add>${t('fItemAdd')}</button>
          </div>
        `)}

        ${fs(5, t('s5Money'), `
          ${ff(t('fAgreed'), inp('total', 'number', r.total, ' min="0" step="0.01"'), { req: true, empty: !Number(r.total) })}
          ${ff(t('fDeposit'), inp('deposit', 'number', r.deposit, ' min="0" step="0.01"'))}
          ${ff(t('fDepositDate'), inp('deposit_date', 'date', r.deposit_date))}
          ${ff(t('fRemaining'), `<input type="text" value="${esc(n2(remainingOf(r)))} ${t('sar')}" disabled>`)}
        `, `
          ${ff(t('fBefore'), inp('price_before', 'number', r.price_before, ' min="0" step="0.01"'), { hint: t('hBefore') })}
          ${ff(t('fAddons'), inp('addons_total', 'number', r.addons_total, ' min="0" step="0.01"'))}
          ${ff(t('fDesserts'), inp('desserts_total', 'number', r.desserts_total, ' min="0" step="0.01"'))}
        `)}

        ${fs(6, t('s6Status'), `
          ${ff(t('fStatus'), sel('status', statuses, r.status))}
          ${ff(t('fNotes'), area('notes', r.notes, 3), { wide: true })}
        `)}
      </div>`;
  }

  /** يحدّث تلوين الخانات المطلوبة الفاضية أثناء الكتابة. */
  function refreshReq(form) {
    if (!form) return;
    $$('label.is-req', form).forEach((label) => {
      const el = $('input, select, textarea', label);
      const v = el ? String(el.value || '').trim() : '';
      const empty = !v || (el.name === 'city' && v === 'أخرى') || (el.name === 'total' && !Number(v));
      label.classList.toggle('is-empty', empty);
    });
    const pin = $('[data-pin]', form);
    if (pin) pin.classList.toggle('is-empty', !form.elements.lat?.value);
  }

  // ---------- دبوس الموقع ----------

  /**
   * يقرأ إحداثيات من رابط خرائط قوقل أو من نص «خط العرض، خط الطول».
   * يغطي الصيغ التي تصل من واتساب ومن شريط العنوان.
   */
  function parseLatLng(text) {
    const str = String(text || '').trim();
    if (!str) return null;
    const pats = [
      /[?&]q=(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/,   // ?q=lat,lng  (رابط واتساب)
      /[?&]ll=(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/,
      /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/,           // المكان نفسه داخل رابط place — أدقّ من @
      /@(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/,         // /@lat,lng,17z — مركز الشاشة
      /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/,        // إحداثيات مكتوبة يدوياً
    ];
    for (const re of pats) {
      const m = str.match(re);
      if (!m) continue;
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)
        && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
    return null;
  }

  /**
   * الروابط المختصرة لا تحمل إحداثيات، والمتصفح لا يستطيع تتبّع تحويلها
   * (CORS)، فنميّزها لنقول للمستخدم ما العمل بدل رسالة فشل عامة.
   */
  function isShortMapLink(text) {
    return /(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(String(text || ''));
  }

  /** يكتب الإحداثيات في الحقول المخفية ويحرّك الدبوس والنص. */
  function setPin(box, lat, lng, { move = true } = {}) {
    const form = box.closest('form.fill');
    setTimeout(() => refreshReq(form), 0);
    const readout = $('[data-pin-readout]', box);
    if (lat === null || lng === null) {
      form.elements.lat.value = '';
      form.elements.lng.value = '';
      if (box._marker) { box._map.removeLayer(box._marker); box._marker = null; }
      readout.textContent = t('fPinNone');
      return;
    }
    form.elements.lat.value = lat.toFixed(6);
    form.elements.lng.value = lng.toFixed(6);
    readout.textContent = t('fPinAt', { lat: lat.toFixed(5), lng: lng.toFixed(5) });
    if (!box._map) return;
    if (box._marker) box._marker.setLatLng([lat, lng]);
    else {
      box._marker = window.L.marker([lat, lng], { draggable: true }).addTo(box._map);
      box._marker.on('dragend', () => {
        const q = box._marker.getLatLng();
        setPin(box, q.lat, q.lng, { move: false });
      });
    }
    if (move) box._map.setView([lat, lng], Math.max(box._map.getZoom(), 15));
  }

  /** خريطة واحدة لكل طلب، تُبنى عند أول فتح للتفاصيل فقط. */
  function initPinMap(box) {
    const el = $('[data-pin-map]', box);
    if (!el || box._map) { if (box._map) box._map.invalidateSize(); return; }
    if (!window.L) { el.classList.add('is-off'); return; }

    const form = box.closest('form.fill');
    const lat = Number(form.elements.lat.value);
    const lng = Number(form.elements.lng.value);
    const has = Number.isFinite(lat) && Number.isFinite(lng) && form.elements.lat.value !== '';

    // الدمام/الخبر مركزاً افتراضياً لأن كل المناسبات في الشرقية
    box._map = window.L.map(el, { scrollWheelZoom: false })
      .setView(has ? [lat, lng] : [26.3927, 50.1], has ? 15 : 10);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap',
    }).addTo(box._map);
    box._map.on('click', (e) => setPin(box, e.latlng.lat, e.latlng.lng, { move: false }));
    if (has) setPin(box, lat, lng);

    // قد تُبنى الخريطة والصف مخفي أو في صفحة أخرى، فتقيس ارتفاعاً صفراً ولا
    // تطلب البلاطات. المراقب يعيد القياس أول ما يصير لها حجم فعلي.
    if (window.ResizeObserver) {
      const watch = new ResizeObserver(() => {
        if (el.clientHeight > 0 && el.clientWidth > 0) box._map.invalidateSize();
      });
      watch.observe(el);
      box._watch = watch;
    }
    setTimeout(() => box._map.invalidateSize(), 60);
  }

  /** أزرار الدبوس: تثبيت من رابط، موقعي الحالي، مسح. */
  function pinClick(e) {
    const box = e.target.closest('[data-pin]');
    if (!box) return;
    const say = (key) => { $('[data-pin-readout]', box).textContent = t(key); };

    if (e.target.matches('[data-pin-apply]')) {
      const text = $('[data-pin-paste]', box).value;
      const found = parseLatLng(text);
      if (found) { setPin(box, found.lat, found.lng); $('[data-pin-paste]', box).value = ''; }
      else say(isShortMapLink(text) ? 'fPinShort' : 'fPinBad');
    } else if (e.target.matches('[data-pin-here]')) {
      if (!navigator.geolocation) return say('fPinNoGeo');
      navigator.geolocation.getCurrentPosition(
        (pos) => setPin(box, pos.coords.latitude, pos.coords.longitude),
        () => say('fPinNoGeo'),
      );
    } else if (e.target.matches('[data-pin-clear]')) {
      setPin(box, null, null);
    }
  }

  /** حفظ نموذج التفاصيل اليدوية وتحديث الصف في الذاكرة بلا إعادة تحميل كاملة. */
  async function submitFill(form) {
    const id = form.dataset.fill;
    const data = new FormData(form);
    const text = (k) => String(data.get(k) || '').trim();
    const number = (k) => (data.get(k) === '' || data.get(k) === null ? null : Number(data.get(k)));

    // الأصناف تُقرأ من المحرّر؛ الصف الفارغ تماماً يُهمل
    const items = $$('.item-row', form).map((rowEl) => {
      const f = (n) => $(`[data-f="${n}"]`, rowEl).value.trim();
      if (!f('name') && !f('qty') && !f('total')) return null;
      // نبني على الصنف الأصلي حتى لا تضيع حقول لا يعرضها المحرّر مثل total_pieces
      let base = {};
      try { base = JSON.parse(f('raw') || '{}'); } catch { base = {}; }
      return {
        ...base,
        id: f('id') || null,
        name: f('name'),
        qty: f('qty') === '' ? null : Number(f('qty')),
        unit: f('unit') || null,
        total: f('total') === '' ? 0 : Number(f('total')),
      };
    }).filter(Boolean);

    // الباريستا البنت تُدار من خانتها، لا من محرّر الأصناف
    const female = number('female_baristas') || 0;
    const orig = allOrders.find((o) => String(o.id) === String(id));
    const oldFemale = orig ? itemsOf(orig).find(isFemaleItem) : null;
    const dayCount = number('days') || 1;
    if (female > 0) {
      items.push({
        ...(oldFemale || {}),
        id: FEMALE_ID,
        name: 'باريستا إضافية (امرأة)',
        kind: 'addon',
        unit: 'باريستا',
        qty: female,
        price: oldFemale?.price ?? 300,
        total: (oldFemale?.price ?? 300) * female * dayCount,
      });
    }

    const fields = {
      // يوم التركيب = يوم المناسبة ما لم يُحدَّد غيره في الخيارات الإضافية
      setup_date: data.get('setup_date') || data.get('event_date'),
      setup_time: data.get('setup_time'),
      event_date: data.get('event_date'),
      event_time: data.get('event_time'),
      days: number('days'),
      included_baristas: number('included_baristas') ?? 0,
      city: text('city'),
      district: text('district'),
      venue: text('venue'),
      lat: number('lat'),
      lng: number('lng'),
      total: number('total'),
      price_before: number('price_before'),
      deposit: number('deposit'),
      deposit_date: data.get('deposit_date'),
      addons_total: number('addons_total') ?? 0,
      desserts_total: number('desserts_total') ?? 0,
      status: text('status'),
      customer_name: text('customer_name'),
      phone: text('phone'),
      client_type: text('client_type') || 'individual',
      company: text('company'),
      vat: text('vat'),
      package_name: text('package_name'),
      custom_request: text('custom_request'),
      notes: text('notes'),
      items,
    };
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    const result = await patchOrder(id, fields);
    button.disabled = false;

    if (!result.ok) {
      const note = $('.fill-msg', form);
      // خانتا العربون تُضافان بملف supabase-payments.sql؛ غيابهما يفشل الحفظ كله
      note.textContent = /deposit/i.test(result.detail || '') ? t('payNeedsCols') : t('failSave');
      note.className = 'fill-msg bad';
      return;
    }

    const row = allOrders.find((o) => String(o.id) === String(id));
    if (row) Object.assign(row, fields, { items });
    applyRange();                       // الجدول والرئيسية يعرضان الجديد فوراً
    // نعيد رسم اللوحة لتتحدّث الحالة والناقص في رأسها، ونبقي موضع التمرير
    const panel = $('#order-drawer .drawer-panel');
    const top = panel ? panel.scrollTop : 0;
    openOrder(id, t('saved'));
    if (panel) panel.scrollTop = top;
  }

  // ---------- مساعدات العرض ----------
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  /** يوم التنفيذ: التركيب إن وُجد، وإلا يوم المناسبة. */
  const eventDay = (r) => dateOnly(r.setup_date || r.event_date).replace('—', '');
  const isOpenOrder = (r) => ['new', 'contacted', 'confirmed'].includes(r.status);
  /** السجل: ما أُنجز أو أُلغي، أو فات يومه. الباقي شغل جارٍ. */
  const isArchived = (r) => ['done', 'cancelled'].includes(r.status)
    || Boolean(eventDay(r) && eventDay(r) < todayIso());
  const inMode = (r) => (listMode === 'archive' ? isArchived(r) : !isArchived(r));
  /** الطلب الجديد ناقص بطبيعته حتى نتصل؛ النقص يُحسب بعد التواصل فقط. */
  const needsCheck = (r) => ['contacted', 'confirmed'].includes(r.status);
  const hasPin = (r) => r.lat !== null && r.lat !== undefined && r.lat !== ''
    && r.lng !== null && r.lng !== undefined && r.lng !== '';
  const mapsUrl = (r) => (hasPin(r) ? `https://maps.google.com/?q=${r.lat},${r.lng}` : '');

  /** رابط واتساب بصيغة دولية: 05xxxxxxxx ← 9665xxxxxxxx */
  function waUrl(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    if (!d) return '';
    const intl = d.startsWith('966') ? d : d.startsWith('0') ? `966${d.slice(1)}` : d.startsWith('5') ? `966${d}` : d;
    return `https://wa.me/${intl}`;
  }

  /** صنف الباريستا البنت (يُسجَّل كإضافة، كما يحفظه الموقع). */
  const FEMALE_ID = 'barista';
  const isFemaleItem = (i) => i && (i.id === FEMALE_ID || i.unit === 'باريستا');
  const femaleOf = (r) => Number(itemsOf(r).find(isFemaleItem)?.qty) || 0;
  const baristaMix = (r) => t('baristaMix', { m: n0(r.included_baristas), f: n0(femaleOf(r)) });

  /** ما ينقص الطلب قبل يوم التنفيذ. يُحسب للطلبات المفتوحة فقط. */
  function missingOf(r) {
    const out = [];
    if (!r.setup_time) out.push('missTime');
    if (!hasPin(r)) out.push('missPin');
    if (!r.city || r.city === 'أخرى') out.push('missCity');
    if (!Number(r.total)) out.push('missPrice');
    return out;
  }

  const missingChips = (r) => {
    const m = missingOf(r);
    return m.length
      ? `<span class="miss"><span class="miss-lbl">${t('missingLbl')}</span>${m.map((k) => `<span class="miss-chip">${t(k)}</span>`).join('')}</span>`
      : '';
  };

  /** «اليوم» · «غداً» · «بعد ٣ أيام» · «قبل ٥ أيام» */
  function relDay(iso) {
    if (!iso) return '';
    const days = Math.round((startOfDay(`${iso}T12:00:00`) - startOfDay(new Date())) / 86400000);
    if (days === 0) return t('today');
    if (days === 1) return t('tomorrow');
    if (days === 2) return t('inTwoDays');
    if (days > 2) return days <= 10 ? t('inDaysFew', { n: days }) : t('inDaysMany', { n: days });
    if (days === -1) return t('yesterday');
    return t('daysAgo', { n: -days });
  }

  const urgencyOf = (iso) => {
    const days = Math.round((startOfDay(`${iso}T12:00:00`) - startOfDay(new Date())) / 86400000);
    return days < 0 ? 'past' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : days <= 3 ? 'soon' : 'later';
  };

  const statusPill = (status) => {
    const c = STATUS_COLOR[status] || STATUS_COLOR.new;
    return `<span class="pill" style="background:color-mix(in srgb, ${c} 14%, transparent);color:${c}"><i style="background:${c}"></i>${statusName(status)}</span>`;
  };

  // ---------- الرئيسية ----------
  /** صف مختصر لطلب، يُفتح بالضغط عليه. */
  function miniRow(r, extra = '', below = '') {
    const day = eventDay(r);
    return `
      <button type="button" class="mini" data-open="${r.id}">
        <span class="mini-main">
          <b>${esc(r.customer_name || '—')}</b>
          <span class="muted">${esc(r.ref)} · ${esc(packageLabel(r))}</span>
          ${below}
        </span>
        <span class="mini-side">
          ${day ? `<span class="mini-day u-${urgencyOf(day)}">${relDay(day)}</span>` : ''}
          ${extra}
        </span>
      </button>`;
  }

  function attnCard(title, hint, rows, filter, extra, below) {
    const shown = rows.slice(0, 5);
    return `
      <section class="attn-card${rows.length ? '' : ' is-clear'}">
        <header>
          <span class="attn-n num">${rows.length}</span>
          <span class="attn-t">${title}<small>${hint}</small></span>
        </header>
        ${rows.length
          ? `<div class="mini-list">${shown.map((r) => miniRow(r, extra ? extra(r) : '', below ? below(r) : '')).join('')}</div>
             ${rows.length > shown.length || filter ? `<a class="attn-more" href="#/orders" data-filter="${filter}">${t('seeAll', { n: rows.length })}</a>` : ''}`
          : `<p class="attn-ok">${t('attnNone')}</p>`}
      </section>`;
  }

  function renderHome() {
    const today = todayIso();
    const in14 = new Date(); in14.setDate(in14.getDate() + 14);
    const lim14 = `${in14.getFullYear()}-${String(in14.getMonth() + 1).padStart(2, '0')}-${String(in14.getDate()).padStart(2, '0')}`;
    const byDayAsc = (a, b) => (eventDay(a) + (a.setup_time || '')).localeCompare(eventDay(b) + (b.setup_time || ''));

    // ما يحتاج متابعة لا يتبع المدى الزمني: طلب قديم بلا اتصال يبقى مهماً
    const fresh = allOrders.filter((r) => r.status === 'new')
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const soon = allOrders.filter((r) => isOpenOrder(r) && eventDay(r) >= today && eventDay(r) <= lim14);
    const missing = soon.filter((r) => needsCheck(r) && missingOf(r).length).sort(byDayAsc);
    const unpaid = soon.filter((r) => r.status === 'confirmed' && !Number(r.deposit)).sort(byDayAsc);

    const line = $('#today-line');
    if (line) {
      line.innerHTML = `${esc(dayLabel(new Date()))}`;
    }

    $('#attn').innerHTML = [
      attnCard(t('attnNew'), t('attnNewHint'), fresh, 'new',
        (r) => `<span class="muted">${t('arrived', { when: dateTime(r.created_at) })}</span>`),
      attnCard(t('attnMissing'), t('attnMissingHint'), missing, 'missing', null, (r) => missingChips(r)),
      attnCard(t('attnDeposit'), t('attnDepositHint'), unpaid, '',
        (r) => `<span class="num muted">${n0(r.total)} ${t('sar')}</span>`),
    ].join('');

    // المناسبات القادمة مجمّعة حسب اليوم
    const upcoming = allOrders
      .filter((r) => r.status !== 'cancelled' && eventDay(r) >= today && eventDay(r) <= lim14)
      .sort(byDayAsc);
    const groups = new Map();
    upcoming.forEach((r) => {
      const k = eventDay(r);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    $('#upcoming').innerHTML = !upcoming.length
      ? `<p class="empty">${t('noUpcoming14')}</p>`
      : [...groups.entries()].map(([day, rows]) => `
        <div class="up-day u-${urgencyOf(day)}">
          <div class="up-date">
            <b>${relDay(day)}</b>
            <span>${esc(dayLabel(`${day}T12:00:00`))}</span>
          </div>
          <div class="up-rows">
            ${rows.map((r) => `
              <button type="button" class="up-row" data-open="${r.id}">
                <span class="up-time tab">${r.setup_time ? esc(r.setup_time) : '—'}</span>
                <span class="up-who"><b>${esc(r.customer_name || '—')}</b>
                  <span class="muted">${esc(packageLabel(r))} · ${esc(cityName(r.city) || '—')}${r.district ? ` — ${esc(r.district)}` : ''}</span></span>
                <span class="up-state">${statusPill(r.status)}${needsCheck(r) ? missingChips(r) : ''}</span>
              </button>`).join('')}
          </div>
        </div>`).join('');

    // أربعة أرقام فقط في الواجهة؛ الباقي في «كل الأرقام»
    const s = summarise(scoped);
    const open = allOrders.filter((r) => r.status !== 'cancelled' && eventDay(r) >= today);
    const left = open.reduce((sum, r) => sum + remainingOf(r), 0);
    const week = new Date(); week.setDate(week.getDate() + 7);
    const lim7 = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, '0')}-${String(week.getDate()).padStart(2, '0')}`;
    const thisWeek = upcoming.filter((r) => eventDay(r) <= lim7).length;

    $('#kpis-main').innerHTML = [
      kpi(t('kRevenue'), n0(s.revenue), t('sar'), t('sFromConfirmed', { n: n0(s.wonCount) }), true),
      kpi(t('kWeekEvents'), n0(thisWeek), '', t('sNext7')),
      kpi(t('kNewOrders'), n0(fresh.length), '', t('sWaitingCall')),
      kpi(t('kToCollect'), n0(left), t('sar'), t('sUpcomingLeft')),
    ].join('');
  }

  // ---------- أزرار الحالات ----------
  function renderChips() {
    const el = $('#status-chips');
    if (!el) return;
    const pool = scoped.filter(inMode);
    const count = (k) => pool.filter((r) => r.status === k).length;
    // كل قائمة تعرض حالاتها فقط: الجارية بلا منجز/ملغي، والسجل بلا «ناقص معلومات»
    const keys = Object.keys(STATUS_KEYS).filter((k) => count(k) > 0
      || (listMode === 'active' ? ['new', 'contacted', 'confirmed'].includes(k) : ['done', 'cancelled'].includes(k)));
    const chips = [
      ['', t('all'), pool.length],
      ...keys.map((k) => [k, statusName(k), count(k)]),
      ...(listMode === 'active'
        ? [['missing', t('needsInfo'), pool.filter((r) => needsCheck(r) && missingOf(r).length).length]] : []),
    ];
    el.innerHTML = chips.map(([k, label, n]) => `
      <button type="button" class="chip${statusFilter === k ? ' on' : ''}${k === 'missing' ? ' chip-warn' : ''}" data-chip="${k}">
        ${esc(label)} <span class="num">${n}</span></button>`).join('');
  }

  function renderTable() {
    renderChips();
    const rows = visibleRows();
    $('#count').textContent = t('ofTotal', { a: rows.length, b: scoped.filter(inMode).length });
    const newCount = allOrders.filter((r) => r.status === 'new').length;
    const badge = $('#nav-new');
    if (badge) { badge.textContent = newCount || ''; badge.hidden = !newCount; }

    $$('#orders-table th.sortable').forEach((th) => {
      th.classList.toggle('sorted', th.dataset.sort === sortKey);
      const arrow = $('.arrow', th);
      if (arrow) arrow.textContent = th.dataset.sort === sortKey ? (sortDir === 1 ? '▲' : '▼') : '⇅';
    });

    if (!rows.length) {
      $('#table-body').innerHTML = `<tr><td colspan="7"><p class="empty">${t('noResults')}</p></td></tr>`;
      return;
    }

    $('#table-body').innerHTML = rows.map((r) => {
      const day = eventDay(r);
      const maps = mapsUrl(r);
      const pay = payStateOf(r);
      return `
      <tr class="row-main${r.status === 'cancelled' ? ' is-cancelled' : ''}" data-open="${r.id}" tabindex="0">
        <td data-label="${t('thRef')}"><span class="ref">${esc(r.ref)}</span><div class="muted">${dateTime(r.created_at)}</div></td>
        <td data-label="${t('thCustomer')}"><b>${esc(r.customer_name || '—')}</b>
            <div class="muted"><span dir="ltr">${esc(r.phone || '')}</span></div>
            <div class="muted">${r.client_type === 'company' ? esc(r.company || t('company')) : t('individual')}</div></td>
        <td data-label="${t('thEvent')}">${day
          ? `<b class="tab">${esc(day)}</b><div class="mini-day u-${urgencyOf(day)}">${relDay(day)}</div>
             <div class="muted tab">${r.setup_time ? `${t('setupAt')} ${esc(r.setup_time)}` : ''}</div>`
          : '—'}</td>
        <td data-label="${t('thPackage')}">${esc(packageLabel(r))}<div class="muted">${esc(r.days)} ${unitName2('يوم')}</div></td>
        <td data-label="${t('thLocation')}">${esc(cityName(r.city) || '—')}<div class="muted">${esc(r.district || '')}${maps ? ` · <a href="${maps}" target="_blank" rel="noopener">${t('openMap')}</a>` : ''}</div></td>
        <td class="tab" data-label="${t('thTotal')}"><b>${n2(r.total)}</b>${discountPill(r)}
            <div><span class="pay-pill pay-${pay.key}">${pay.label}</span></div></td>
        <td data-label="${t('thStatus')}">
          <div class="st-cell">
            <select class="status-select" data-id="${r.id}" aria-label="${t('status')}">
              ${Object.keys(STATUS_KEYS).map((k) =>
                `<option value="${k}" ${r.status === k ? 'selected' : ''}>${statusName(k)}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-ghost btn-sm" data-open="${r.id}">${t('open')}</button>
          </div>
          ${needsCheck(r) ? missingChips(r) : ''}
        </td>
      </tr>`;
    }).join('');
  }

  // ---------- لوحة الطلب الجانبية ----------
  function drawerHtml(r) {
    const items = itemsOf(r);
    const maps = mapsUrl(r);
    const wa = waUrl(r.phone);
    const day = eventDay(r);
    const d = discountOf(r);
    return `
      <form class="fill" data-fill="${r.id}">
        <header class="drawer-head">
          <div class="dh-top">
            <div>
              <span class="ref">${esc(r.ref)}</span>
              <h2 id="drawer-title">${esc(r.customer_name || '—')}</h2>
              <div class="dh-meta">${statusPill(r.status)}
                ${day ? `<span class="mini-day u-${urgencyOf(day)}">${relDay(day)} · <span class="tab">${esc(day)}</span></span>` : ''}
                <span class="muted">${t('arrived', { when: dateTime(r.created_at) })}</span></div>
            </div>
            <button type="button" class="icon-btn" data-drawer-close aria-label="${t('close')}">✕</button>
          </div>
          <div class="dh-actions">
            ${r.phone ? `<a class="btn btn-ghost btn-sm" href="tel:${esc(r.phone)}">${t('call')}</a>` : ''}
            ${wa ? `<a class="btn btn-ghost btn-sm" href="${wa}" target="_blank" rel="noopener">${t('whatsapp')}</a>` : ''}
            ${maps ? `<a class="btn btn-ghost btn-sm" href="${maps}" target="_blank" rel="noopener">${t('openMap')}</a>` : ''}
            ${Number(r.total) > 0 && remainingOf(r) > 0.009
              ? `<button type="button" class="btn btn-paid btn-sm" data-paid="${r.id}">${t('markPaid')}</button>`
              : (Number(r.total) > 0 ? `<span class="pay-pill pay-full">${t('payFull')}</span>` : '')}
          </div>
          ${needsCheck(r) ? missingChips(r) : ''}
        </header>

        <div class="drawer-body">
          <section class="d-sum">
            <div><dt>${t('thPackage')}</dt><dd>${esc(packageLabel(r))} · ${esc(r.days)} ${unitName2('يوم')}</dd></div>
            <div><dt>${t('thTotal')}</dt><dd class="num">${n2(r.total)} ${t('sar')}${d ? ` <span class="disc">−${d.pct}%</span>` : ''}</dd></div>
            <div><dt>${t('thDeposit')}</dt><dd class="num">${r.deposit ? `${n2(r.deposit)} ${t('sar')}` : '—'}</dd></div>
            <div><dt>${t('thRemaining')}</dt><dd class="num">${n2(remainingOf(r))} ${t('sar')}</dd></div>
            <div><dt>${t('thBaristas')}</dt><dd>${baristaMix(r)}</dd></div>
          </section>
          ${items.length ? `<ul class="items-list">${items.map((i) => `
            <li><span>${esc(itemName(i))} — <span class="num">${esc(i.qty)}</span> ${esc(unitName2(i.unit))}${i.total_pieces ? ` · ${n0(i.total_pieces)} ${unitName2('حبة')}` : ''}</span>
                <span class="num">${n2(i.total)} ${t('sar')}</span></li>`).join('')}</ul>` : ''}
          ${r.custom_request ? `<div class="job-note job-note--custom"><b>${t('customReq')}</b> ${esc(r.custom_request)}</div>` : ''}
          ${fillForm(r)}
          <div class="danger-zone">
            ${r.status !== 'cancelled'
              ? `<button type="button" class="btn btn-danger btn-sm" data-cancel="${r.id}" data-ref="${esc(r.ref)}">${t('cancelOrder')}</button>`
              : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-delete="${r.id}" data-ref="${esc(r.ref)}">${t('deleteOrder')}</button>
          </div>
        </div>

        <footer class="drawer-foot">
          <button type="submit" class="btn btn-solid">${t('fSaveDetails')}</button>
          <span class="fill-msg"></span>
        </footer>
      </form>`;
  }

  function openOrder(id, message) {
    const r = allOrders.find((o) => String(o.id) === String(id));
    if (!r) return;
    drawerId = r.id;
    drawerDirty = false;
    const inner = $('#drawer-inner');
    inner.innerHTML = drawerHtml(r);
    const drawer = $('#order-drawer');
    const wasHidden = drawer.hidden;
    drawer.hidden = false;
    document.body.classList.add('drawer-open');
    const box = $('[data-pin]', inner);
    if (box) initPinMap(box);
    if (wasHidden) $('.drawer-panel', drawer).scrollTop = 0;
    if (message) {
      const note = $('.fill-msg', inner);
      note.textContent = message;
      note.className = 'fill-msg ok';
    }
  }

  /** يغلق أي لوحة جانبية؛ يسأل قبل أن تضيع تعديلات لم تُحفظ. */
  function closeDrawer(force = false) {
    const open = $$('.drawer').filter((d) => !d.hidden);
    if (!open.length) return true;
    if (!force && drawerDirty && !confirm(t('unsaved'))) return false;
    open.forEach((d) => { d.hidden = true; });
    document.body.classList.remove('drawer-open');
    drawerId = null;
    drawerDirty = false;
    return true;
  }

  // ---------- تقرير المدفوعات ----------

  /** طلبات التقرير: ضمن المدى الزمني، بلا الملغاة — فالملغي لا يُطالَب به. */
  function payRows() {
    return scoped
      .filter((r) => r.status !== 'cancelled')
      .slice()
      .sort((a, b) => remainingOf(b) - remainingOf(a));
  }

  function renderPayments() {
    const rows = payRows();
    const total = rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
    const paid = rows.reduce((sum, r) => sum + (Number(r.deposit) || 0), 0);
    const left = rows.reduce((sum, r) => sum + remainingOf(r), 0);
    const unpaid = rows.filter((r) => !Number(r.deposit)).length;

    $('#pay-kpis').innerHTML = [
      kpi(t('kCollected'), n2(paid), t('sar'), t('sOfOrdersValue', { n: n2(total) }), true),
      kpi(t('kOutstanding'), n2(left), t('sar'), t('sAcrossOrders', { n: n0(rows.length) })),
      kpi(t('kUnpaid'), n0(unpaid), '', t('sNotYetPaid')),
      kpi(t('kPayOrders'), n0(rows.length), '', ''),
    ].join('');

    $('#pay-body').innerHTML = !rows.length
      ? `<tr><td colspan="8" class="empty">${t('payEmpty')}</td></tr>`
      : rows.map((r) => {
        const st = payStateOf(r);
        return `<tr class="row-main" data-open="${r.id}" tabindex="0">
          <td data-label="${t('thRef')}" class="tab">${esc(r.ref)}</td>
          <td data-label="${t('thCustomer')}">${esc(r.customer_name || '—')}</td>
          <td data-label="${t('fEventDate')}" class="tab">${dateOnly(r.event_date || r.setup_date)}</td>
          <td data-label="${t('thTotal')}" class="num">${n2(r.total)}</td>
          <td data-label="${t('thDeposit')}" class="num">${r.deposit ? n2(r.deposit) : '—'}</td>
          <td data-label="${t('thDepositDate')}" class="tab">${dateOnly(r.deposit_date)}</td>
          <td data-label="${t('thRemaining')}" class="num">${n2(remainingOf(r))}</td>
          <td data-label="${t('thPayState')}"><span class="pay-pill pay-${st.key}">${st.label}</span>
            ${st.key !== 'full' && Number(r.total) > 0 ? `<button type="button" class="btn btn-paid btn-sm" data-paid="${r.id}">${t('markPaid')}</button>` : ''}</td>
        </tr>`;
      }).join('');
  }

  /** تقرير المدفوعات كملف إكسل مستقل. */
  function exportPayments() {
    const rows = payRows();
    const money = '#,##0.00';
    const cols = [
      { h: t('thRef'),         t: 'txt',   w: 12, v: (r) => r.ref },
      { h: t('thCustomer'),    t: 'txt',   w: 22, v: (r) => r.customer_name },
      { h: t('fPhone'),        t: 'txt',   w: 14, v: (r) => r.phone },
      { h: t('fEventDate'),    t: 'date',  w: 12, v: (r) => r.event_date || r.setup_date },
      { h: t('status'),        t: 'txt',   w: 10, v: (r) => statusName(r.status) },
      { h: t('thTotal'),       t: 'money', w: 14, v: (r) => r.total, z: money },
      { h: t('thDeposit'),     t: 'money', w: 14, v: (r) => r.deposit, z: money },
      { h: t('thDepositDate'), t: 'date',  w: 13, v: (r) => r.deposit_date },
      { h: t('thRemaining'),   t: 'money', w: 14, v: (r) => remainingOf(r), z: money },
      { h: t('thPayState'),    t: 'txt',   w: 14, v: (r) => payStateOf(r).label },
    ];
    writeSheet(rows, cols, `wekad-payments-${new Date().toISOString().slice(0, 10)}`, t('shPayments'));
  }

  // ---------- تصدير إلى إكسل ----------

  /**
   * أعمدة التصدير. `t` نوع الخلية، وعليه يتوقف هل يجمع إكسل العمود أم لا:
   *   txt   نص صريح — الجوال ورقم الطلب، حتى لا يبتلع إكسل الصفر البادئ
   *   num   رقم صحيح
   *   money رقم بفاصلة آلاف وخانتين عشريتين
   *   date  تاريخ حقيقي يُفرز زمنياً لا أبجدياً
   *   link  رابط قابل للنقر
   */
  function exportColumns() {
    const money = '#,##0.00';
    return [
      { h: t('thRef'),       t: 'txt',   w: 12, v: (r) => r.ref },
      { h: t('thCreated'),   t: 'date',  w: 17, v: (r) => r.created_at, z: 'yyyy-mm-dd hh:mm' },
      { h: t('status'),      t: 'txt',   w: 10, v: (r) => statusName(r.status) },
      { h: t('thCustomer'),  t: 'txt',   w: 22, v: (r) => r.customer_name },
      { h: t('fClientType'), t: 'txt',   w: 10, v: (r) => (r.client_type === 'company' ? t('company') : t('individual')) },
      { h: t('fCompany'),    t: 'txt',   w: 18, v: (r) => r.company },
      { h: t('fVat'),        t: 'txt',   w: 16, v: (r) => r.vat },
      { h: t('fPhone'),      t: 'txt',   w: 14, v: (r) => r.phone },
      { h: t('fService'),    t: 'txt',   w: 16, v: (r) => (cat() ? cat().name(r.service) : r.service) },
      { h: t('thPackage'),   t: 'txt',   w: 16, v: (r) => r.package_name },
      { h: t('fDays'),       t: 'num',   w: 7,  v: (r) => r.days },
      { h: t('fSetupDate'),  t: 'date',  w: 12, v: (r) => r.setup_date },
      { h: t('fSetupTime'),  t: 'txt',   w: 9,  v: (r) => r.setup_time },
      { h: t('fEventDate'),  t: 'date',  w: 12, v: (r) => r.event_date },
      { h: t('fEventTime'),  t: 'txt',   w: 9,  v: (r) => r.event_time },
      { h: t('fCustomReq'),  t: 'txt',   w: 26, v: (r) => r.custom_request },
      { h: t('fCity'),       t: 'txt',   w: 11, v: (r) => cityName(r.city) },
      { h: t('fDistrict'),   t: 'txt',   w: 14, v: (r) => r.district },
      { h: t('fVenue'),      t: 'txt',   w: 26, v: (r) => r.venue },
      { h: t('thMapLink'),   t: 'link',  w: 14, v: (r) => (r.lat && r.lng ? `https://maps.google.com/?q=${r.lat},${r.lng}` : '') },
      { h: t('dBaristas'),   t: 'num',   w: 9,  v: (r) => r.included_baristas },
      { h: t('fBaristasF'),  t: 'num',   w: 9,  v: (r) => femaleOf(r) || null },
      { h: t('dAddons'),     t: 'money', w: 12, v: (r) => r.addons_total, z: money },
      { h: t('dSweets'),     t: 'money', w: 12, v: (r) => r.desserts_total, z: money },
      { h: t('dBefore'),     t: 'money', w: 14, v: (r) => r.price_before, z: money },
      { h: t('thDiscPct'),   t: 'num',   w: 10, v: (r) => discountOf(r)?.pct ?? null },
      { h: t('thTotal'),     t: 'money', w: 14, v: (r) => r.total, z: money },
      { h: t('thDeposit'),     t: 'money', w: 13, v: (r) => r.deposit, z: money },
      { h: t('thDepositDate'), t: 'date',  w: 13, v: (r) => r.deposit_date },
      { h: t('thRemaining'),   t: 'money', w: 13, v: (r) => remainingOf(r), z: money },
      { h: t('thPayState'),    t: 'txt',   w: 14, v: (r) => payStateOf(r).label },
      { h: t('fItems'),      t: 'txt',   w: 40, v: (r) => itemsOf(r)
          .map((i) => `${itemName(i)} ×${i.qty}${i.unit ? ` ${unitName2(i.unit)}` : ''}`).join(' · ') },
      { h: t('fNotes'),      t: 'txt',   w: 30, v: (r) => r.notes },
    ];
  }

  // إكسل يعدّ الأيام من ١٨٩٩-١٢-٣٠
  const XL_EPOCH = Date.UTC(1899, 11, 30);

  /**
   * رقم إكسل التسلسلي للتاريخ.
   * نحسبه من مكوّنات التاريخ لا من طابعه الزمني: تمرير كائن Date يجعل المكتبة
   * تطرح فرق التوقيت، وتوقيت الرياض التاريخي ‎+03:06:52 يترك كسر ٥٢ ثانية في
   * كل خلية، فتفشل المطابقة والفرز على اليوم.
   */
  function excelSerial(v, withTime) {
    if (!v) return null;
    const dayOnly = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dayOnly) {
      return (Date.UTC(+dayOnly[1], +dayOnly[2] - 1, +dayOnly[3]) - XL_EPOCH) / 86400000;
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    const days = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - XL_EPOCH) / 86400000;
    if (!withTime) return days;
    return days + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
  }

  function exportSheet() {
    const stamp = new Date().toISOString().slice(0, 10);
    writeSheet(visibleRows(), exportColumns(), `wekad-orders-${stamp}`, t('shOrders'));
  }

  /**
   * يكتب أي مجموعة صفوف وأعمدة كملف إكسل واحد.
   * الأنواع هي ما يجعل الملف صالحاً للعمل عليه: الأرقام تُجمع، والتواريخ تُفرز،
   * والجوال يبقى نصاً فلا يبتلع إكسل صفره البادئ.
   */
  function writeSheet(rows, cols, file, sheetName) {
    const XLSX = window.XLSX;
    if (!XLSX) return exportCsvFallback(rows, cols, file);

    const aoa = [cols.map((c) => c.h)];
    rows.forEach((r) => aoa.push(cols.map((c) => {
      const raw = c.v(r);
      if (raw === null || raw === undefined || raw === '') return '';
      if (c.t === 'date')  return excelSerial(raw, /h/.test(c.z || '')) ?? '';
      if (c.t === 'num' || c.t === 'money') {
        const n = Number(raw);
        return Number.isFinite(n) ? n : '';
      }
      return String(raw);
    })));

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols.map((c) => ({ wch: c.w }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 },
    }) };
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };   // صف العناوين يبقى ظاهراً

    cols.forEach((c, ci) => {
      for (let ri = 1; ri <= rows.length; ri += 1) {
        const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
        if (!cell || cell.v === '') continue;
        if (c.t === 'date')  { cell.t = 'n'; cell.z = c.z || 'yyyy-mm-dd'; }
        else if (c.z)        { cell.z = c.z; }
        else if (c.t === 'txt') { cell.t = 's'; }   // الجوال نصاً: يحفظ الصفر البادئ
        else if (c.t === 'link') { cell.l = { Target: String(cell.v) }; }
      }
    });

    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: window.WekadI18n.lang === 'ar' }] };
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${file}.xlsx`, { compression: true });
  }

  /** مخرج احتياطي إن تعذّر تحميل المكتبة. */
  function exportCsvFallback(rows, cols, file) {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = rows.map((r) => cols.map((c) => cell(c.v(r))).join(';'));
    // sep= سطر توجيه يفهمه إكسل مهما كانت لغة النظام، و﻿ للترميز العربي
    const csv = '﻿' + ['sep=;', cols.map((c) => cell(c.h)).join(';'), ...body].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- المدى الزمني ----------
  function applyRange() {
    if (customRange) {
      const { from, to } = customBounds();
      const inside = (x) => { const d = new Date(x.created_at); return d >= from && d <= to; };
      scoped = allOrders.filter(inside);
      scopedVisits = allVisits.filter(inside);
    } else if (!rangeDays) {
      scoped = allOrders.slice();
      scopedVisits = allVisits.slice();
    } else {
      const from = startOfDay(new Date());
      from.setDate(from.getDate() - (rangeDays - 1));
      scoped = allOrders.filter((r) => new Date(r.created_at) >= from);
      scopedVisits = allVisits.filter((v) => new Date(v.created_at) >= from);
    }
    renderKpis();
    renderHome();
    renderPanels();
    renderTable();
    renderPayments();
  }

  /** جدول الموظف: المناسبات القادمة فقط، بما يلزم للتنفيذ. */
  function renderSchedule() {
    const today = startOfDay(new Date());
    const keyOf = (r) => r.setup_date || r.event_date;
    const rows = schedule
      .filter((r) => keyOf(r) && startOfDay(keyOf(r)) >= today)
      .sort((a, b) => (String(keyOf(a)) + (a.setup_time || ''))
        .localeCompare(String(keyOf(b)) + (b.setup_time || '')));

    const q = ($('#sch-q')?.value || '').trim().toLowerCase();
    const shown = q
      ? rows.filter((r) => [r.ref, r.city, r.district, r.venue, r.customer_name]
          .some((v) => String(v ?? '').toLowerCase().includes(q)))
      : rows;

    const next7 = rows.filter((r) => {
      const d = startOfDay(keyOf(r));
      const limit = new Date(today); limit.setDate(limit.getDate() + 7);
      return d <= limit;
    }).length;

    $('#sch-kpis').innerHTML = [
      kpi(t('kSetups'), n0(rows.length), '', t('sFromToday')),
      kpi(t('kWithin7'), n0(next7), '', t('sGetReady')),
      kpi(t('kNextSetup'), rows[0] ? dateOnly(keyOf(rows[0])) : '—', '',
        rows[0] ? `${esc(cityName(rows[0].city))} · ${t('sArrival', { t: esc(rows[0].setup_time || '') })}` : ''),
    ].join('');

    $('#sch-count').textContent = t('eventsCount', { n: shown.length });

    $('#sch-body').innerHTML = !shown.length
      ? `<p class="empty">${t('noUpcoming')}</p>`
      : shown.map((r) => {
          const setup = r.setup_date || r.event_date;
          const days = Math.round((startOfDay(setup) - today) / 86400000);
          const maps = r.lat && r.lng ? `https://maps.google.com/?q=${r.lat},${r.lng}` : '';
          const items = Array.isArray(r.items) ? r.items : [];
          const sweets = items.filter((i) => i.kind === 'dessert');
          const addons = items.filter((i) => i.kind !== 'dessert');

          const urgency = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days <= 3 ? 'soon' : 'later';
          const whenLabel = days === 0 ? t('today')
            : days === 1 ? t('tomorrow')
            : days === 2 ? t('inTwoDays')
            : days <= 10 ? t('inDaysFew', { n: days })
            : t('inDaysMany', { n: days });

          const sameDay = !r.setup_date || r.setup_date === r.event_date;
          const marks = checksByOrder.get(r.id) || new Map();
          const done = checklist.filter((it) => marks.get(it.id)?.checked).length;
          const allDone = checklist.length > 0 && done === checklist.length;

          const jobAt = r.job_status_at
            ? t('jsByAt', {
                who: esc(String(r.job_status_by || '').split('@')[0]),
                when: dateTime(r.job_status_at),
              })
            : '';

          return `
          <article class="job job--${urgency}">
            <header class="job-head">
              <span class="job-when">${whenLabel}</span>
              <span class="job-date tab">${dateOnly(setup)}</span>
              <span class="job-ref tab">${esc(r.ref)}</span>
            </header>

            <div class="job-times">
              <div class="jt jt--main">
                <span class="jt-label">${t('arrivalTime')}</span>
                <span class="jt-date tab">${esc(dayLabel(setup))}</span>
                <span class="jt-value tab">${r.setup_time ? esc(r.setup_time) : `<em class="jt-pending">${t('notSet')}</em>`}</span>
              </div>
              <div class="jt">
                <span class="jt-label">${t('serviceStart')}</span>
                <span class="jt-date tab${sameDay ? ' is-same' : ''}">${sameDay
                  ? t('sameDaySetup')
                  : esc(r.event_date ? dayLabel(r.event_date) : t('noWorkDate'))}</span>
                <span class="jt-value tab">${esc(r.event_time || '—')}</span>
              </div>
              <div class="jt">
                <span class="jt-label">${t('serviceDays')}</span>
                <span class="jt-value tab">${esc(r.days)} <small>${t('day')}</small></span>
              </div>
            </div>

            <!-- حالة المهمة: الخطوة التالية بارزة، والمكتملة مؤشَّرة -->
            <div class="job-flow">
              <span class="flow-label">${t('jobStatus')}</span>
              <div class="flow-steps">
                ${JOB_FLOW.map((step, i) => {
                  const atIndex = JOB_FLOW.findIndex((x) => x.key === (r.job_status || 'pending'));
                  const state = i < atIndex ? 'past' : i === atIndex ? 'now' : 'next';
                  return `<button type="button" class="flow-step is-${state}"
                            data-job="${r.id}" data-status="${step.key}">${t(step.label)}</button>`;
                }).join('')}
              </div>
              ${jobAt ? `<span class="flow-by">${jobAt}</span>` : ''}
            </div>

            ${checklist.length ? `
              <details class="job-check${allDone ? ' is-done' : ''}" ${allDone ? '' : 'open'}>
                <summary>
                  <span>${t('checklist')}</span>
                  <span class="chk-count">${allDone ? t('checkAllDone') : t('checkProgress', { a: done, b: checklist.length })}</span>
                </summary>
                <div class="chk-list">
                  ${checklist.map((it) => {
                    const row = marks.get(it.id);
                    const on = Boolean(row?.checked);
                    const qtyVal = row?.qty ?? it.default_qty ?? '';
                    return `
                    <div class="chk${on ? ' on' : ''}">
                      <label class="chk-tick">
                        <input type="checkbox" data-check-order="${r.id}" data-check-item="${it.id}" ${on ? 'checked' : ''}>
                        <span class="chk-box"></span>
                        <span class="chk-label">${esc(itemLabel(it))}</span>
                      </label>
                      ${it.unit ? `
                        <span class="chk-qty">
                          <input type="number" step="0.5" min="0" dir="ltr" value="${qtyVal}"
                                 data-qty-order="${r.id}" data-qty-item="${it.id}"
                                 aria-label="${t('takenQty')}">
                          <span class="chk-unit">${unitName(it.unit)}</span>
                        </span>` : ''}
                      ${on && row?.checked_by ? `<span class="chk-by">${t('checkedBy', { who: esc(String(row.checked_by).split('@')[0]) })}</span>` : ''}
                    </div>`;
                  }).join('')}
                </div>
              </details>` : ''}

            <div class="job-grid">
              <div class="jf">
                <span class="jf-label">${t('cityDistrict')}</span>
                <span class="jf-value">${esc(cityName(r.city) || '—')}${r.district ? ` — ${esc(r.district)}` : ''}</span>
              </div>
              <div class="jf">
                <span class="jf-label">${t('venue')}</span>
                <span class="jf-value">${esc(r.venue || '—')}</span>
              </div>
              <div class="jf">
                <span class="jf-label">${t('serviceNeeded')}</span>
                <span class="jf-value">${esc(packageLabel(r))}</span>
                <span class="jf-sub">${baristaMix(r)}</span>
              </div>
              <div class="jf">
                <span class="jf-label">${t('customer')}</span>
                <span class="jf-value">${esc(r.customer_name || '—')}</span>
              </div>
            </div>

            ${sweets.length ? `
              <div class="job-items">
                <span class="ji-title">${t('desserts')}</span>
                <ul class="ji-list">
                  ${sweets.map((i) => `<li><span>${esc(itemName(i))}</span>
                    <b class="tab">${esc(i.qty)} ${esc(unitName2(i.unit))}${i.total_pieces ? ` · ${n0(i.total_pieces)} ${unitName2('حبة')}` : ''}</b></li>`).join('')}
                </ul>
              </div>` : ''}

            ${addons.length ? `
              <div class="job-items">
                <span class="ji-title">${t('addonsList')}</span>
                <ul class="ji-list">
                  ${addons.map((i) => `<li><span>${esc(itemName(i))}</span>
                    <b class="tab">${esc(i.qty)} ${esc(unitName2(i.unit))}</b></li>`).join('')}
                </ul>
              </div>` : ''}

            ${r.custom_request ? `<div class="job-note job-note--custom"><b>${t('customReq')}</b> ${esc(r.custom_request)}</div>` : ''}
            ${r.notes ? `<div class="job-note"><b>${t('customerNote')}</b> ${esc(r.notes)}</div>` : ''}

            <footer class="job-actions">
              ${maps ? `<a class="btn btn-solid btn-sm" href="${maps}" target="_blank" rel="noreferrer">${t('openMap')}</a>` : ''}
              ${r.phone ? `<a class="btn btn-ghost btn-sm" href="tel:${esc(r.phone)}" dir="ltr">${esc(r.phone)}</a>` : ''}
            </footer>
          </article>`;
        }).join('');
  }

  // ---------- التنقّل بين الصفحات ----------
  const PAGE_KEYS = {
    overview: 'pOverview', orders: 'pOrders', archive: 'pArchive', analytics: 'pAnalytics',
    payments: 'pPayments',
    checklist: 'pChecklist', closed: 'pClosed', users: 'pUsers',
  };

  function currentPage() {
    const hash = (location.hash || '').replace('#/', '');
    return PAGE_KEYS[hash] ? hash : 'overview';
  }

  function showPage(name) {
    // السجل يستخدم صفحة الطلبات نفسها بقائمة مختلفة
    const section = name === 'archive' ? 'orders' : name;
    $$('.page').forEach((el) => el.classList.toggle('on', el.dataset.page === section));
    if (section === 'orders') {
      const mode = name === 'archive' ? 'archive' : 'active';
      if (pendingFilter !== null) { statusFilter = pendingFilter; pendingFilter = null; }
      else if (mode !== listMode) statusFilter = '';
      listMode = mode;
      $('#new-order-btn').hidden = mode === 'archive';
      const when = $('#filter-when')?.closest('label');
      if (when) when.hidden = mode === 'archive';
      $('#archive-hint').hidden = mode !== 'archive';
      renderTable();
    }
    $$('.nav-item').forEach((el) => el.classList.toggle('on', el.dataset.page === name));
    const title = $('#page-title');
    if (title) title.textContent = t(PAGE_KEYS[name]);
    $('#side')?.classList.remove('open');
    // المدى الزمني لا معنى له في صفحات الإعدادات، فلا نعرضه هناك
    const range = $('#range-wrap');
    if (range) range.hidden = ['checklist', 'closed', 'users'].includes(name);
    if (name === 'payments') renderPayments();
    if (name === 'users') renderStaff();
    if (name === 'closed') renderBlocked();
    if (name === 'checklist') renderItems();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  /** يملأ قائمة تصفية المدن من الطلبات المتاحة. */
  function fillCityFilter() {
    const select = $('#filter-city');
    if (!select) return;
    const current = select.value;
    const cities = [...new Set(allOrders.map((r) => r.city).filter(Boolean))].sort();
    // القيمة تبقى الاسم العربي المحفوظ لأن المقارنة تتم عليه؛ المعروض مترجم
    select.innerHTML = `<option value="">${t('all')}</option>`
      + cities.map((c) => `<option value="${esc(c)}" ${c === current ? 'selected' : ''}>${esc(cityName(c))}</option>`).join('');
  }

  // ---------- الشاشات ----------
  function showLogin(message) {
    $('#login').hidden = false;
    $('#dash').hidden = true;
    const staffView = $('#staff-view');
    if (staffView) staffView.hidden = true;
    $('#login-err').textContent = message || '';
    $('#login-err').hidden = !message;
  }

  let lastSync = null;
  let autoTimer = null;

  function stampSync() {
    lastSync = new Date();
    const text = `${t('lastSync')} ${new Intl.DateTimeFormat(locale(),
      { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(lastSync)}`;
    ['#sync', '#sync-staff'].forEach((sel) => { const el = $(sel); if (el) el.textContent = text; });
  }

  /**
   * التحديث الدوري يعيد رسم الجدول، وإعادة الرسم تستبدل نموذج «تفاصيل»
   * المفتوح فتضيع تعديلات لم تُحفظ بعد — الدبوس والحي والسعر. فنؤجّله ما دام
   * أحد الصفوف مفتوحاً أو المؤشر داخل خانة.
   */
  function editingNow() {
    if ($$('.drawer').some((d) => !d.hidden)) return true;
    const el = document.activeElement;
    return Boolean(el && el.matches('input, textarea, select'));
  }

  /** يُبقي اللوحة حيّة: تحديث دوري، وفوري عند العودة إلى التبويب. */
  function startAutoRefresh() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => {
      const open = !$('#dash').hidden || !$('#staff-view').hidden;
      if (!document.hidden && open && !editingNow()) showDashboard({ quiet: true });
    }, 30000);
  }

  async function showDashboard(opts = {}) {
    $('#login').hidden = true;
    if (!opts.quiet) $$('.refresh').forEach((b) => { b.textContent = t('refreshing'); });

    try {
      if (!role) {
        role = (await claimAccess()) || (await fetchRole());
        const saved = await fetchProfileLang();
        if (saved && saved !== window.WekadI18n.lang) {
          window.WekadI18n.setLang(saved);
          $$('.lang-pick').forEach((sel) => { sel.value = saved; });
        }
      }

      if (!role) {
        $('#dash').hidden = true;
        $('#staff-view').hidden = true;
        showLogin(t('noAccess'));
        clearSession();
        return;
      }

      const admin = role === 'admin';
      $('#dash').hidden = !admin;
      $('#staff-view').hidden = admin;
      $$('.who-email').forEach((el) => { el.textContent = session?.user?.email ?? ''; });
      $$('.role-badge').forEach((el) => { el.textContent = admin ? t('admin') : t('staff'); });

      if (!admin) {
        schedule = await fetchSchedule();
        checklist = await fetchChecklist();
        checksByOrder = await fetchChecks(schedule.map((r) => r.id));
        renderSchedule();
        stampSync();
        startAutoRefresh();
        return;
      }

      const [rows, visits] = await Promise.all([fetchOrders(), fetchVisits()]);
      if (rows === null) return;
      allOrders = rows;
      allVisits = visits || [];
      checklist = await fetchChecklist();
      checksByOrder = await fetchChecks(allOrders.slice(0, 200).map((r) => r.id));
      applyRange();
      fillCityFilter();
      fillOrderForm();
      checkConfirmSetting();
      showPage(currentPage());
      stampSync();
      startAutoRefresh();
    } catch (error) {
      console.error(error);
      $('#table-body').innerHTML = `<tr><td colspan="7"><p class="empty">${t('loadFail')}</p></td></tr>`;
    } finally {
      $$('.refresh').forEach((b) => { b.textContent = t('refresh'); });
    }
  }

  // ---------- الربط ----------
  document.addEventListener('DOMContentLoaded', async () => {
    if (!cfg.SUPABASE_URL) { showLogin('لم تُضبط إعدادات قاعدة البيانات.'); return; }

    /**
     * دخول موحّد: نحاول الدخول أولاً؛ فإن لم يكن للبريد حساب أنشأناه تلقائياً.
     * Supabase يعيد نفس الخطأ لكلمة مرور خاطئة ولحساب غير موجود، فنفرّق بينهما
     * بنتيجة محاولة الإنشاء.
     */
    async function enter(email, password) {
      try {
        return await signIn(email, password);
      } catch (signInError) {
        if (signInError.pending) throw signInError;   // موجود لكن غير مفعّل
        let created;
        try {
          created = await signUp(email, password);
        } catch (signUpError) {
          // التسجيل رُفض لوجود الحساب ⇒ الدخول فشل بسبب كلمة المرور
          if (signUpError.code === 'email_taken') {
            throw new Error(t('wrongPass'));
          }
          throw signUpError;
        }
        if (created.access_token) return created;
        // التأكيد بالبريد مفعّل: نجرّب الدخول، وإلا نوجّهه لبريده
        try {
          return await signIn(email, password);
        } catch (second) {
          if (second.pending) throw second;
          const wait = new Error(t('createdPending'));
          wait.pending = true;
          throw wait;
        }
      }
    }

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = $('#login-btn');
      const email = $('#email').value.trim();
      const password = $('#password').value;

      button.disabled = true;
      button.textContent = t('working');
      $('#login-err').hidden = true;
      $('#login-ok').hidden = true;

      try {
        saveSession(await enter(email, password));
        role = null;
        await showDashboard();
      } catch (error) {
        if (error.pending) {
          $('#login-ok').textContent = error.message;
          $('#login-ok').hidden = false;
        } else {
          showLogin(error.message);
        }
      } finally {
        button.disabled = false;
        button.textContent = t('signIn');
      }
    });

    $$('.logout').forEach((b) => b.addEventListener('click', () => { clearSession(); role = null; showLogin(); }));
    $$('.refresh').forEach((b) => b.addEventListener('click', () => showDashboard()));
    $('#export').addEventListener('click', exportSheet);
    $('#pay-export')?.addEventListener('click', exportPayments);
    $('#q').addEventListener('input', renderTable);
    $('#filter-when')?.addEventListener('change', renderTable);
    $('#status-chips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-chip]');
      if (!chip) return;
      statusFilter = chip.dataset.chip;
      renderTable();
    });

    // مبدّل اللغة: كل النسخ متزامنة، والاختيار يُحفظ في الحساب
    $$('.lang-pick').forEach((sel) => {
      sel.value = window.WekadI18n.lang;
      sel.addEventListener('change', () => {
        const code = sel.value;
        window.WekadI18n.setLang(code);
        $$('.lang-pick').forEach((other) => { other.value = code; });
        if (session?.access_token) saveLang(code);
      });
    });

    // إعادة رسم كل شيء عند تبدّل اللغة
    document.addEventListener('wekad:lang', () => {
      if ($('#dash') && !$('#dash').hidden) {
        renderKpis(); renderHome(); renderPanels(); renderTable(); renderPayments();
        fillCityFilter();
        if (drawerId) openOrder(drawerId);                 // أسماء المدن و"الكل" تتبع اللغة
        fillOrderForm();
        if (currentPage() === 'users') renderStaff();
        if (currentPage() === 'closed') renderBlocked();
        showPage(currentPage());
      }
      if ($('#staff-view') && !$('#staff-view').hidden) renderSchedule();
      stampSync();
    });

    window.addEventListener('hashchange', () => { closeDrawer(); showPage(currentPage()); });
    $('#side-toggle')?.addEventListener('click', () => $('#side').classList.toggle('open'));
    $('#filter-city')?.addEventListener('change', renderTable);

    $$('.range-btn').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.days === 'custom') {
        // «من – إلى» يفتح خانتي التاريخ؛ المدى يُطبَّق عند «عرض»
        const box = $('#range-custom');
        box.hidden = !box.hidden;
        if (!box.hidden && !$('#range-from').value) {
          const d = new Date(); d.setDate(d.getDate() - 29);
          $('#range-from').value = d.toISOString().slice(0, 10);
          $('#range-to').value = todayIso();
        }
        return;
      }
      $$('.range-btn').forEach((x) => x.classList.toggle('on', x === b));
      $('#range-custom').hidden = true;
      customRange = null;
      rangeDays = Number(b.dataset.days);
      applyRange();
    }));

    $('#range-apply')?.addEventListener('click', () => {
      let from = $('#range-from').value;
      let to = $('#range-to').value || todayIso();
      if (!from) return;
      if (to < from) [from, to] = [to, from];
      customRange = { from, to };
      $$('.range-btn').forEach((x) => x.classList.toggle('on', x.dataset.days === 'custom'));
      $('#range-custom').hidden = true;
      applyRange();
    });

    $$('#orders-table th.sortable').forEach((th) => th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = -1; }
      renderTable();
    }));

    $('#table-body').addEventListener('change', async (e) => {
      if (!e.target.classList.contains('status-select')) return;
      const id = e.target.dataset.id;
      const value = e.target.value;
      if (!(await updateStatus(id, value))) { alert(t('failStatus')); return; }
      [allOrders, scoped].forEach((list) => {
        const row = list.find((r) => String(r.id) === String(id));
        if (row) row.status = value;
      });
      renderKpis();
      renderHome();
      renderPanels();
      renderTable();
    });

    // إضافة موظف
    $('#block-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = $('#block-ok');
      const err = $('#block-err');
      ok.hidden = true; err.hidden = true;

      const from = $('#block-from').value;
      const to = $('#block-to').value;
      if (!from) { err.textContent = t('pickDate'); err.hidden = false; return; }

      if (!(await blockRange(from, to, $('#block-reason').value.trim()))) {
        err.textContent = t('badRange');
        err.hidden = false;
        return;
      }
      ok.textContent = to && to !== from ? t('closedRange', { a: from, b: to }) : t('closedOne', { d: from });
      ok.hidden = false;
      $('#block-reason').value = '';
      renderBlocked();
    });

    $('#block-list').addEventListener('click', async (e) => {
      const day = e.target.dataset?.unblock;
      if (!day) return;
      if (!confirm(t('confirmOpen', { d: day }))) return;
      await unblockDay(day);
      renderBlocked();
    });

    $('#gen-pass').addEventListener('click', () => {
      const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const bytes = crypto.getRandomValues(new Uint8Array(10));
      $('#staff-pass').value = [...bytes].map((b) => chars[b % chars.length]).join('');
    });

    $('#staff-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('#staff-email').value.trim().toLowerCase();
      const password = $('#staff-pass').value;
      const staffRole = $('#staff-role').value;
      const ok = $('#staff-ok');
      const err = $('#staff-err');
      ok.hidden = true; err.hidden = true;

      if (!email || password.length < 6) {
        err.textContent = t('badCreds');
        err.hidden = false;
        return;
      }

      // الصلاحية أولاً، حتى يلتقطها المشغّل لحظة إنشاء الحساب
      if (!(await allowEmail(email, staffRole, $('#staff-lang').value))) {
        err.textContent = t('failAdd');
        err.hidden = false;
        return;
      }

      const result = await createStaffAccount(email, password);
      if (!result.ok) {
        err.textContent = result.error;
        err.hidden = false;
        renderStaff();
        return;
      }

      if (result.existed) {
        // تسجيل البريد الموجود يُرفض من المصدر، فكلمة المرور الجديدة لم تُحفظ.
        // عرضها كنجاح يجعل المدير يسلّم الموظف كلمة مرور لا تعمل.
        err.innerHTML = `${t('acctExists', { email: esc(email) })}
          <button type="button" class="btn btn-ghost btn-sm" data-reset="${esc(email)}"
                  style="margin-block-start:.6rem">${t('sendReset')}</button>`;
        err.hidden = false;
      } else {
        ok.innerHTML = `${t('acctCreated')}
           <span class="cred-box"><code>${esc(email)}</code><code>${esc(password)}</code></span>
           ${result.confirmed ? '' : `<br><b>${t('note')}:</b> ${t('pendingConfirm')}`}`;
        ok.hidden = false;
      }

      $('#staff-email').value = '';
      $('#staff-pass').value = '';
      renderStaff();
    });

    $('#staff-list').addEventListener('change', async (e) => {
      if (!e.target.classList.contains('role-select')) return;
      const email = e.target.dataset.email;
      const newRole = e.target.value;
      if (!confirm(t('confirmRole', { email, role: newRole === 'admin' ? t('admin') : t('staff') }))) {
        renderStaff();
        return;
      }
      if (!(await changeRole(email, newRole))) alert(t('failRole'));
      renderStaff();
    });

    // زر إعادة التعيين يظهر في مكانين: قائمة المستخدمين وتحذير الحساب الموجود
    document.addEventListener('click', async (e) => {
      const email = e.target.dataset?.reset;
      if (!email) return;
      const button = e.target;
      button.disabled = true;
      const sent = await sendReset(email);
      button.textContent = sent ? t('resetSent') : t('resetFail');
      if (!sent) button.disabled = false;
    });

    // ---------- حجز يدوي ----------
    $('#o-service')?.addEventListener('change', syncPackageOptions);
    $('#o-package')?.addEventListener('change', syncCupsField);

    $('#order-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('#o-msg');
      const button = $('button[type="submit"]', e.target);
      const v = (sel) => $(sel).value.trim();
      const num = (sel) => ($(sel).value === '' ? null : Number($(sel).value));

      const phone = v('#o-phone').replace(/[\s-]/g, '');
      if (v('#o-name').length < 3 || !/^(?:\+?9665|05|5)\d{8}$/.test(phone) || !v('#o-date')) {
        msg.textContent = t('badOrder');
        msg.className = 'fill-msg bad';
        return;
      }

      const c = cat();
      const service = v('#o-service');
      const pkg = v('#o-package');
      const isCustom = pkg === 'custom';
      const cups = isCustom ? num('#o-cups') : Number(String(pkg).replace('p', ''));
      const day = v('#o-date');

      const row = {
        ref: newRef(),
        service,
        package_id: pkg,
        package_name: service === 'counter'
          ? (isCustom ? `${c.NAMES.custom.ar} — ${cups || 0} كوب` : `${cups} كوب`)
          : c.NAMES[pkg].ar,
        custom_cups: isCustom ? cups : null,
        custom_request: null,
        package_price: 0,
        days: num('#o-days') || 1,
        setup_date: day,
        setup_time: null,
        event_date: day,
        event_time: null,
        city: v('#o-city'),
        district: null,
        venue: null,
        lat: null,
        lng: null,
        client_type: v('#o-client'),
        customer_name: v('#o-name'),
        phone,
        company: v('#o-client') === 'company' ? (v('#o-company') || null) : null,
        vat: null,
        notes: v('#o-notes') || null,
        included_baristas: num('#o-male') ?? (service === 'flask' ? 0 : 1),
        items: (num('#o-female') || 0) > 0 ? [{
          id: FEMALE_ID, name: 'باريستا إضافية (امرأة)', kind: 'addon', unit: 'باريستا',
          qty: num('#o-female'), price: 300, total: 300 * num('#o-female') * (num('#o-days') || 1),
        }] : [],
        desserts_total: 0,
        addons_total: 0,
        total: num('#o-total') ?? 0,
        price_before: num('#o-before'),
        status: v('#o-status'),
      };

      button.disabled = true;
      msg.textContent = t('working');
      msg.className = 'fill-msg';
      let result;
      try {
        result = await saveManualOrder(row);
      } finally {
        button.disabled = false;
      }

      if (!result.ok) {
        msg.textContent = `${t('failSave')} — ${result.error}`;
        msg.className = 'fill-msg bad';
        return;
      }
      msg.textContent = t('orderSaved', { ref: row.ref });
      msg.className = 'fill-msg ok';
      e.target.reset();
      syncPackageOptions();
      drawerDirty = false;
      if (result.saved) {
        allOrders.unshift(result.saved);   // يظهر فوراً بلا إعادة تحميل
        applyRange();
        fillCityFilter();
        closeDrawer(true);
        openOrder(result.saved.id, t('orderSaved', { ref: row.ref }));
      } else {
        showDashboard({ quiet: true });
      }
    });

    $('#new-order-btn')?.addEventListener('click', () => {
      if (!closeDrawer()) return;
      $('#o-msg').textContent = '';
      $('#new-drawer').hidden = false;
      document.body.classList.add('drawer-open');
      setTimeout(() => $('#o-name')?.focus(), 30);
    });

    $('#staff-list').addEventListener('click', async (e) => {
      const email = e.target.dataset?.remove;
      if (!email) return;
      if (!confirm(t('confirmRemove', { email }))) return;
      await removeStaff(email);
      renderStaff();
    });

    // إلغاء أو حذف طلب — من داخل اللوحة الجانبية
    $('#order-drawer').addEventListener('click', async (e) => {
      const cancelId = e.target.dataset?.cancel;
      const deleteId = e.target.dataset?.delete;
      const ref = e.target.dataset?.ref;

      if (cancelId) {
        if (!confirm(t('confirmCancel', { ref }))) return;
        if (!(await updateStatus(cancelId, 'cancelled'))) { alert(t('failCancel')); return; }
        const row = allOrders.find((r) => String(r.id) === String(cancelId));
        if (row) row.status = 'cancelled';
        applyRange();
        openOrder(cancelId, t('cancelledMsg'));
        return;
      }

      if (deleteId) {
        if (!confirm(t('confirmDelete', { ref }))) return;
        const response = await api(`/rest/v1/orders?id=eq.${deleteId}`, { method: 'DELETE' });
        if (!response.ok) { alert(t('failDelete')); return; }
        allOrders = allOrders.filter((r) => String(r.id) !== String(deleteId));
        closeDrawer(true);
        applyRange();
      }
    });

    $('#sch-q').addEventListener('input', renderSchedule);

    // الطاقم يحدّد أين وصلت المهمة
    $('#sch-body').addEventListener('click', async (e) => {
      const orderId = e.target.dataset?.job;
      if (!orderId) return;
      const status = e.target.dataset.status;
      if (!(await setJobStatus(orderId, status))) { alert(t('failSave')); return; }

      const row = schedule.find((x) => String(x.id) === String(orderId));
      if (row) {
        row.job_status = status;
        row.job_status_at = new Date().toISOString();
        row.job_status_by = session?.user?.email || '';
      }
      renderSchedule();
    });

    // تعليم البنود وإدخال الكميات
    $('#sch-body').addEventListener('change', async (e) => {
      const tick = e.target.dataset?.checkOrder;
      const qtyOrder = e.target.dataset?.qtyOrder;

      if (qtyOrder) {
        const value = e.target.value === '' ? null : Number(e.target.value);
        await saveCheck(qtyOrder, e.target.dataset.qtyItem, { qty: value });
        return;
      }
      if (!tick) return;

      const itemId = e.target.dataset.checkItem;
      const checked = e.target.checked;

      // لو للبند وحدة ولم تُدخَل كمية، احفظ الكمية الظاهرة معه
      const row = e.target.closest('.chk');
      const qtyInput = $('input[data-qty-item]', row);
      const patch = { checked };
      if (checked && qtyInput && qtyInput.value !== '') patch.qty = Number(qtyInput.value);

      if (!(await saveCheck(tick, itemId, patch))) {
        e.target.checked = !checked;
        alert(t('failSave'));
        return;
      }

      const card = e.target.closest('.job-check');
      const marks = checksByOrder.get(Number(tick));
      const done = checklist.filter((it) => marks.get(it.id)?.checked).length;
      const all = done === checklist.length;
      card.classList.toggle('is-done', all);
      $('.chk-count', card).textContent = all
        ? t('checkAllDone') : t('checkProgress', { a: done, b: checklist.length });
      row.classList.toggle('on', checked);
    });

    // إدارة البنود
    $('#item-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#item-err');
      err.hidden = true;
      const ar = $('#item-ar').value.trim();
      if (!ar) { err.textContent = t('badCreds'); err.hidden = false; return; }
      const qty = $('#item-qty').value;
      const ok = await addItem({
        label_ar: ar,
        label_en: $('#item-en').value.trim(),
        label_tl: $('#item-tl').value.trim(),
        unit: $('#item-unit').value,
        default_qty: qty === '' ? null : Number(qty),
      });
      if (!ok) { err.textContent = t('failSave'); err.hidden = false; return; }
      ['#item-ar', '#item-en', '#item-tl', '#item-qty'].forEach((sel) => { $(sel).value = ''; });
      renderItems();
    });

    $('#item-list').addEventListener('click', async (e) => {
      const move = e.target.dataset?.move;
      const del = e.target.dataset?.delitem;
      const edit = e.target.dataset?.edititem;
      if (e.target.dataset?.canceledit) { editingItem = null; renderItems(); return; }
      if (edit) { editingItem = edit; renderItems(); return; }
      if (move) { await moveItem(move, Number(e.target.dataset.dir)); renderItems(); return; }
      if (del) {
        if (!confirm(t('confirmDelItem', { label: e.target.dataset.label }))) return;
        await deleteItem(del);
        renderItems();
      }
    });

    $('#item-list').addEventListener('submit', async (e) => {
      const id = e.target.dataset?.save;
      if (!id) return;
      e.preventDefault();
      const f = new FormData(e.target);
      const qty = f.get('qty');
      const ok = await updateItem(id, {
        label_ar: String(f.get('ar')).trim(),
        label_en: String(f.get('en')).trim(),
        label_tl: String(f.get('tl')).trim(),
        unit: f.get('unit'),
        default_qty: qty === '' ? null : Number(qty),
      });
      if (!ok) { alert(t('failSave')); return; }
      editingItem = null;
      renderItems();
    });

    const drawerEl = $('#order-drawer');
    drawerEl.addEventListener('submit', (e) => {
      if (!e.target.matches('form.fill')) return;
      e.preventDefault();
      submitFill(e.target);
    });

    drawerEl.addEventListener('click', (e) => {
      // أزرار الدبوس ومحرّر الأصناف داخل التفاصيل
      if (e.target.closest('[data-pin]')) { pinClick(e); drawerDirty = true; return; }
      if (e.target.matches('[data-item-del]')) { e.target.closest('.item-row').remove(); drawerDirty = true; return; }
      if (e.target.matches('[data-item-add]')) {
        $('[data-items]', e.target.closest('form.fill')).insertAdjacentHTML('beforeend', itemRow());
        drawerDirty = true;
      }
    });

    // أي تعديل داخل لوحة جانبية يُعلَّم، فلا تُغلق بلا تنبيه
    $$('.drawer').forEach((d) => d.addEventListener('input', (e) => {
      drawerDirty = true;
      refreshReq(e.target.closest('form.fill'));
    }));
    $('#order-drawer').addEventListener('change', (e) => refreshReq(e.target.closest('form.fill')));

    document.addEventListener('click', async (e) => {
      if (e.target.closest('[data-drawer-close]')) { closeDrawer(); return; }

      // «تم الدفع كاملاً»: العربون = الإجمالي، بتاريخ اليوم
      const paidBtn = e.target.closest('[data-paid]');
      if (paidBtn) {
        const id = paidBtn.dataset.paid;
        const row = allOrders.find((o) => String(o.id) === String(id));
        if (!row) return;
        const inDrawer = String(drawerId) === String(id);
        if (inDrawer && drawerDirty && !confirm(t('unsaved'))) return;
        paidBtn.disabled = true;
        const fields = { deposit: Number(row.total) || 0, deposit_date: todayIso() };
        const result = await patchOrder(id, fields);
        paidBtn.disabled = false;
        if (!result.ok) { alert(t('failSave')); return; }
        Object.assign(row, fields);
        applyRange();
        if (inDrawer) openOrder(id, t('paidMsg'));
        return;
      }

      // أي عنصر يحمل data-open يفتح الطلب — إلا الروابط والقوائم داخله
      const opener = e.target.closest('[data-open]');
      if (opener && !e.target.closest('a, select, input')) {
        if (!closeDrawer()) return;
        openOrder(opener.dataset.open);
        return;
      }

      // «عرض الكل» في الرئيسية يفتح الطلبات بالتصفية المناسبة
      const more = e.target.closest('[data-filter]');
      if (more) {
        pendingFilter = more.dataset.filter;
        const when = $('#filter-when');
        if (when) when.value = '';
        if (currentPage() === 'orders') showPage('orders');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeDrawer(); return; }
      if (e.key === 'Enter' && e.target.matches('tr[data-open]')) openOrder(e.target.dataset.open);
    });

    document.addEventListener('visibilitychange', () => {
      const open = !$('#dash').hidden || !$('#staff-view').hidden;
      if (!document.hidden && open && session?.access_token && !editingNow()) {
        showDashboard({ quiet: true });
      }
    });

    loadSession();
    if (session?.access_token) await showDashboard();
    else showLogin();
  });
})();
