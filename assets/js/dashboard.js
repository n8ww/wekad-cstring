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
  const weekdayName = (index) => new Intl.DateTimeFormat(
    { ar: 'ar-SA-u-ca-gregory', en: 'en-GB', tl: 'fil-PH' }[window.WekadI18n.lang] || 'ar-SA-u-ca-gregory',
    { weekday: 'long' },
  ).format(new Date(Date.UTC(2024, 0, 7 + index)));

  let session = null;
  let role = null;          // admin | staff
  let schedule = [];       // ما يراه الموظف
  let allOrders = [];   // كل ما حُمّل
  let allVisits = [];
  let scopedVisits = [];
  let scoped = [];      // بعد تطبيق المدى الزمني
  let rangeDays = 0;    // 0 = كل الفترات
  let sortKey = 'created_at';
  let sortDir = -1;

  // ---------- تنسيق ----------
  const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
  const n2 = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : '—');
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

  function dateTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(d);
  }

  // ---------- الشبكة ----------
  async function api(path, options = {}) {
    return fetch(`${cfg.SUPABASE_URL}${path}`, {
      ...options,
      headers: {
        apikey: cfg.SUPABASE_KEY,
        Authorization: `Bearer ${session?.access_token ?? cfg.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
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
      if (/already/i.test(msg)) throw new Error(t('emailTaken'));
      if (/password/i.test(msg)) throw new Error(t('shortPass'));
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
    return response.ok;
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
          return `
          <div class="staff-row${past ? ' is-past' : ''}">
            <span class="staff-mail tab">${esc(r.day)}</span>
            <span class="staff-state">${esc(r.reason || '—')}</span>
            ${past ? `<span class="pill pill-staff">${t('pastPill')}</span>` : `<span class="pill pill-closed">${t('closedPill')}</span>`}
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
    const stepOrder = [
      [t('fVisitors'), (v) => v.event === 'page_view'],
      [t('fStarted'),  (v) => v.event === 'begin_checkout'],
      [t('fSize'),     (v) => v.event === 'booking_step' && v.step === 'size'],
      [t('fItems'),    (v) => v.event === 'booking_step' && v.step === 'items'],
      [t('fWhen'),     (v) => v.event === 'booking_step' && v.step === 'when'],
      [t('fClient'),   (v) => v.event === 'booking_step' && v.step === 'client'],
      [t('fReview'),   (v) => v.event === 'booking_step' && v.step === 'review'],
      [t('fDone'),     (v) => v.event === 'purchase'],
    ];
    return stepOrder.map(([label, test]) => [
      label,
      new Set(rows.filter(test).map((v) => v.session_id).filter(Boolean)).size,
    ]);
  }

  /** المدى السابق بنفس الطول، للمقارنة. */
  function previousWindow(days) {
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

  function byDay(rows, days) {
    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = startOfDay(new Date());
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
      <span>عن الفترة السابقة</span>`;
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
    const days = rangeDays && rangeDays <= 30 ? rangeDays : 30;
    const orderBuckets = byDay(scoped, days);

    const views = scopedVisits.filter((v) => v.event === 'page_view');
    const visitorBuckets = orderBuckets.map((b) => {
      const same = views.filter((v) => startOfDay(v.created_at).getTime() === b.date.getTime());
      return new Set(same.map((v) => v.visitor)).size;
    });

    // الزوار والطلبات كلاهما "عدد في اليوم" — نفس الوحدة، فمحور واحد يكفي
    const max = Math.max(1, ...visitorBuckets, ...orderBuckets.map((b) => b.count));
    const step = orderBuckets.length > 20 ? 5 : 2;

    $('#chart-daily').innerHTML = orderBuckets.map((b, i) => `
      <div class="col" title="${b.date.toISOString().slice(0, 10)} · ${visitorBuckets[i]} زائر · ${b.count} طلب · ${n0(b.revenue)} ر.س">
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
      <div class="col" title="${key} · ${n0(v.revenue)} ر.س · ${v.count} طلب">
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
    const status = $('#filter-status').value;
    const city = $('#filter-city')?.value || '';

    const rows = scoped.filter((r) => {
      if (status && r.status !== status) return false;
      if (city && r.city !== city) return false;
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
  function fillForm(r) {
    const v = (x) => esc(x ?? '');
    return `
      <form class="fill" data-fill="${r.id}">
        <h4>${t('fillTitle')}</h4>
        <p class="fill-hint">${t('fillHint')}</p>
        <div class="fill-grid">
          <label><span>${t('fSetupDate')}</span><input type="date" name="setup_date" value="${v(r.setup_date)}"></label>
          <label><span>${t('fSetupTime')}</span><input type="time" name="setup_time" value="${v(r.setup_time)}"></label>
          <label><span>${t('fEventDate')}</span><input type="date" name="event_date" value="${v(r.event_date)}"></label>
          <label><span>${t('fEventTime')}</span><input type="time" name="event_time" value="${v(r.event_time)}"></label>
          <label><span>${t('fDays')}</span><input type="number" name="days" min="1" max="30" value="${v(r.days)}"></label>
          <label><span>${t('fDistrict')}</span><input type="text" name="district" value="${v(r.district)}"></label>
          <label><span>${t('fBefore')}</span><input type="number" name="price_before" min="0" step="0.01" value="${v(r.price_before)}"></label>
          <label><span>${t('fTotal')}</span><input type="number" name="total" min="0" step="0.01" value="${v(r.total)}"></label>
          <label class="wide"><span>${t('fVenue')}</span><input type="text" name="venue" value="${v(r.venue)}"></label>
        </div>
        <div class="fill-actions">
          <button type="submit" class="btn btn-solid btn-sm">${t('fSaveDetails')}</button>
          <span class="fill-msg"></span>
        </div>
      </form>`;
  }

  /** حفظ نموذج التفاصيل اليدوية وتحديث الصف في الذاكرة بلا إعادة تحميل كاملة. */
  async function submitFill(form) {
    const id = form.dataset.fill;
    const data = new FormData(form);
    const fields = {
      setup_date: data.get('setup_date'),
      setup_time: data.get('setup_time'),
      event_date: data.get('event_date'),
      event_time: data.get('event_time'),
      days: data.get('days') ? Number(data.get('days')) : null,
      district: String(data.get('district') || '').trim(),
      venue: String(data.get('venue') || '').trim(),
      total: data.get('total') === '' ? null : Number(data.get('total')),
      price_before: data.get('price_before') === '' ? null : Number(data.get('price_before')),
    };
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    const ok = await patchOrder(id, fields);
    button.disabled = false;

    if (!ok) {
      const note = $('.fill-msg', form);
      note.textContent = t('failSave');
      note.className = 'fill-msg bad';
      return;
    }

    const row = allOrders.find((o) => String(o.id) === String(id));
    if (row) Object.assign(row, fields);
    applyRange();                       // الصف الرئيسي يعرض الموعد الجديد فوراً

    // إعادة الرسم تستبدل النموذج، فنعيد فتح التفاصيل ونضع الرسالة في النسخة الجديدة
    const detail = $(`tr[data-detail="${id}"]`);
    if (detail) detail.hidden = false;
    const toggle = $(`[data-toggle="${id}"]`);
    if (toggle) toggle.textContent = t('hide');
    const note = $(`form[data-fill="${id}"] .fill-msg`);
    if (note) { note.textContent = t('saved'); note.className = 'fill-msg ok'; }
  }

  function renderTable() {
    const rows = visibleRows();
    $('#count').textContent = t('ofTotal', { a: rows.length, b: scoped.length });
    const newCount = scoped.filter((r) => r.status === 'new').length;
    const badge = $('#nav-new');
    if (badge) { badge.textContent = newCount || ''; badge.hidden = !newCount; }

    $$('#orders-table th.sortable').forEach((th) => {
      th.classList.toggle('sorted', th.dataset.sort === sortKey);
      const arrow = $('.arrow', th);
      if (arrow) arrow.textContent = th.dataset.sort === sortKey ? (sortDir === 1 ? '▲' : '▼') : '⇅';
    });

    if (!rows.length) {
      $('#table-body').innerHTML = `<tr><td colspan="8"><p class="empty">${t('noResults')}</p></td></tr>`;
      return;
    }

    $('#table-body').innerHTML = rows.map((r) => {
      const stColor = STATUS_COLOR[r.status] || STATUS_COLOR.new;
      const stName = statusName(r.status);
      const maps = r.lat && r.lng ? `https://maps.google.com/?q=${r.lat},${r.lng}` : '';
      const items = itemsOf(r);
      return `
      <tr class="row-main">
        <td><span class="ref">${esc(r.ref)}</span><div class="muted">${dateTime(r.created_at)}</div></td>
        <td>${esc(r.customer_name || '—')}
            <div class="muted">${r.client_type === 'company' ? esc(r.company || t('company')) : t('individual')}</div></td>
        <td><a href="tel:${esc(r.phone)}" dir="ltr">${esc(r.phone || '—')}</a></td>
        <td>${esc(r.package_name || '—')}<div class="muted">${esc(r.days)} يوم</div></td>
        <td class="tab"><b>${dateOnly(r.setup_date || r.event_date)}</b> · ${esc(r.setup_time || '—')}
            <div class="muted">${t('work')} ${dateOnly(r.event_date)} · ${esc(r.event_time || '')}</div></td>
        <td>${esc(r.city || '—')}<div class="muted">${esc(r.district || '')}${maps ? ` · <a href="${maps}" target="_blank" rel="noopener">خريطة</a>` : ''}</div></td>
        <td class="tab"><b>${n2(r.total)}</b>${discountPill(r)}
            ${discountOf(r) ? `<div class="muted was">${n2(r.price_before)}</div>` : ''}</td>
        <td>
          <span class="pill" style="background:color-mix(in srgb, ${stColor} 14%, transparent);color:${stColor}">
            <i style="background:${stColor}"></i>${stName}</span>
          <div style="margin-block-start:.4rem;display:flex;gap:.4rem;align-items:center">
            <select class="status-select" data-id="${r.id}">
              ${Object.entries(STATUS_KEYS).map(([k]) =>
                `<option value="${k}" ${r.status === k ? 'selected' : ''}>${statusName(k)}</option>`).join('')}
            </select>
            <button class="detail-toggle" data-toggle="${r.id}">${t('details')}</button>
          </div>
          <div class="row-actions">
            ${r.status !== 'cancelled'
              ? `<button class="btn btn-danger btn-sm" data-cancel="${r.id}" data-ref="${esc(r.ref)}">${t('cancelOrder')}</button>`
              : ''}
            <button class="btn btn-ghost btn-sm" data-delete="${r.id}" data-ref="${esc(r.ref)}">${t('deleteOrder')}</button>
          </div>
        </td>
      </tr>
      <tr class="row-detail" data-detail="${r.id}" hidden>
        <td colspan="8">
          <dl class="detail-grid">
            <div><dt>${t('dSetup')}</dt><dd class="tab">${dateOnly(r.setup_date)} · ${esc(r.setup_time || '—')}</dd></div>
            <div><dt>${t('dWork')}</dt><dd class="tab">${dateOnly(r.event_date)} · ${esc(r.event_time || '—')}</dd></div>
            <div><dt>${t('dVenue')}</dt><dd>${esc(r.venue || '—')}</dd></div>
            <div><dt>${t('dDistrict')}</dt><dd>${esc(r.district || '—')}</dd></div>
            <div><dt>${t('dBaristas')}</dt><dd class="num">${esc(r.included_baristas)}</dd></div>
            ${discountOf(r) ? `
              <div><dt>${t('dBefore')}</dt><dd class="num">${n2(r.price_before)} ر.س</dd></div>
              <div><dt>${t('discount')}</dt><dd class="num">${discountOf(r).pct}%</dd></div>
              <div><dt>${t('dSaved')}</dt><dd class="num">${n2(discountOf(r).saved)} ر.س</dd></div>` : ''}
            <div><dt>${t('dAddons')}</dt><dd class="num">${n2(r.addons_total)} ر.س</dd></div>
            <div><dt>${t('dSweets')}</dt><dd class="num">${n2(r.desserts_total)} ر.س</dd></div>
            ${r.vat ? `<div><dt>${t('dVat')}</dt><dd class="num">${esc(r.vat)}</dd></div>` : ''}
            ${r.custom_request ? `<div style="grid-column:1/-1"><dt>${t('customReq')}</dt><dd>${esc(r.custom_request)}</dd></div>` : ''}
            ${r.notes ? `<div style="grid-column:1/-1"><dt>${t('dNotes')}</dt><dd>${esc(r.notes)}</dd></div>` : ''}
          </dl>
          ${items.length ? `<ul class="items-list">${items.map((i) => `
            <li><span>${esc(i.name)} — <span class="num">${esc(i.qty)}</span> ${esc(i.unit)}</span>
                <span class="num">${n2(i.total)} ر.س</span></li>`).join('')}</ul>` : ''}
          ${fillForm(r)}
        </td>
      </tr>`;
    }).join('');
  }

  // ---------- تصدير إلى إكسل ----------
  function exportCsv() {
    const rows = visibleRows();
    const headers = [
      'رقم الطلب', 'تاريخ الطلب', 'الحالة', 'العميل', 'نوع العميل', 'الشركة',
      'الرقم الضريبي', 'الجوال', 'الخدمة', 'الباقة', 'الأيام',
      'تاريخ التركيب', 'وقت التركيب', 'تاريخ بدء العمل', 'وقت بدء العمل', 'طلب خاص', 'المدينة', 'الحي', 'الموقع', 'رابط الخريطة', 'باريستا مشمولة',
      'الإضافات', 'الحلى', 'السعر قبل الخصم', 'نسبة الخصم %', 'الإجمالي', 'الأصناف', 'ملاحظات',
    ];

    const cell = (v) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };

    const lines = rows.map((r) => [
      r.ref,
      String(r.created_at || '').slice(0, 19).replace('T', ' '),
      statusName(r.status),
      r.customer_name,
      r.client_type === 'company' ? 'شركة' : 'أفراد',
      r.company, r.vat, r.phone,
      r.service === 'counter' ? 'ركن ضيافة القهوة' : 'خدمة الحافظات',
      r.package_name, r.days, r.setup_date, r.setup_time, r.event_date, r.event_time,
      r.custom_request, r.city, r.district, r.venue,
      r.lat && r.lng ? `https://maps.google.com/?q=${r.lat},${r.lng}` : '',
      r.included_baristas, r.addons_total, r.desserts_total,
      r.price_before ?? '', discountOf(r)?.pct ?? '', r.total,
      itemsOf(r).map((i) => `${i.name} ×${i.qty}`).join(' | '),
      r.notes,
    ].map(cell).join(','));

    // BOM حتى يفتح إكسل النص العربي بترميز صحيح
    const csv = '﻿' + [headers.map(cell).join(','), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wekad-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- المدى الزمني ----------
  function applyRange() {
    if (!rangeDays) {
      scoped = allOrders.slice();
      scopedVisits = allVisits.slice();
    } else {
      const from = startOfDay(new Date());
      from.setDate(from.getDate() - (rangeDays - 1));
      scoped = allOrders.filter((r) => new Date(r.created_at) >= from);
      scopedVisits = allVisits.filter((v) => new Date(v.created_at) >= from);
    }
    renderKpis();
    renderPanels();
    renderTable();
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
        rows[0] ? `${esc(rows[0].city)} · ${t('sArrival', { t: esc(rows[0].setup_time || '') })}` : ''),
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
                <span class="jt-value tab">${r.setup_time ? esc(r.setup_time) : `<em class="jt-pending">${t('notSet')}</em>`}</span>
              </div>
              <div class="jt">
                <span class="jt-label">${t('serviceStart')}</span>
                <span class="jt-value tab">${esc(r.event_time || '—')}</span>
                ${sameDay ? '' : `<span class="jt-sub tab">${dateOnly(r.event_date)}</span>`}
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
                <span class="jf-value">${esc(r.city || '—')}${r.district ? ` — ${esc(r.district)}` : ''}</span>
              </div>
              <div class="jf">
                <span class="jf-label">${t('venue')}</span>
                <span class="jf-value">${esc(r.venue || '—')}</span>
              </div>
              <div class="jf">
                <span class="jf-label">${t('serviceNeeded')}</span>
                <span class="jf-value">${esc(r.package_name || '—')}</span>
                <span class="jf-sub">${esc(r.included_baristas)} ${t('baristas')}</span>
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
                  ${sweets.map((i) => `<li><span>${esc(i.name)}</span>
                    <b class="tab">${esc(i.qty)} ${esc(i.unit || '')}</b></li>`).join('')}
                </ul>
              </div>` : ''}

            ${addons.length ? `
              <div class="job-items">
                <span class="ji-title">${t('addonsList')}</span>
                <ul class="ji-list">
                  ${addons.map((i) => `<li><span>${esc(i.name)}</span>
                    <b class="tab">${esc(i.qty)} ${esc(i.unit || '')}</b></li>`).join('')}
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
    overview: 'pOverview', orders: 'pOrders', analytics: 'pAnalytics',
    checklist: 'pChecklist', closed: 'pClosed', users: 'pUsers',
  };

  function currentPage() {
    const hash = (location.hash || '').replace('#/', '');
    return PAGE_KEYS[hash] ? hash : 'overview';
  }

  function showPage(name) {
    $$('.page').forEach((el) => el.classList.toggle('on', el.dataset.page === name));
    $$('.nav-item').forEach((el) => el.classList.toggle('on', el.dataset.page === name));
    const title = $('#page-title');
    if (title) title.textContent = t(PAGE_KEYS[name]);
    $('#side')?.classList.remove('open');
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
    select.innerHTML = '<option value="">الكل</option>'
      + cities.map((c) => `<option ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('');
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
    const text = `${t('lastSync')} ${new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',
      { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(lastSync)}`;
    ['#sync', '#sync-staff'].forEach((sel) => { const el = $(sel); if (el) el.textContent = text; });
  }

  /** يُبقي اللوحة حيّة: تحديث دوري، وفوري عند العودة إلى التبويب. */
  function startAutoRefresh() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => {
      const open = !$('#dash').hidden || !$('#staff-view').hidden;
      if (!document.hidden && open) showDashboard({ quiet: true });
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
      $$('.role-badge').forEach((el) => { el.textContent = admin ? 'مدير' : 'موظف'; });

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
      checkConfirmSetting();
      showPage(currentPage());
      stampSync();
      startAutoRefresh();
    } catch (error) {
      console.error(error);
      $('#table-body').innerHTML = `<tr><td colspan="8"><p class="empty">${t('loadFail')}</p></td></tr>`;
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
          // الحساب موجود ⇒ إذن كلمة المرور هي الخاطئة
          if (/بالفعل/.test(signUpError.message)) {
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
    $('#export').addEventListener('click', exportCsv);
    $('#q').addEventListener('input', renderTable);
    $('#filter-status').addEventListener('change', renderTable);

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
        renderKpis(); renderPanels(); renderTable();
        if (currentPage() === 'users') renderStaff();
        if (currentPage() === 'closed') renderBlocked();
        showPage(currentPage());
      }
      if ($('#staff-view') && !$('#staff-view').hidden) renderSchedule();
      stampSync();
    });

    window.addEventListener('hashchange', () => showPage(currentPage()));
    $('#side-toggle')?.addEventListener('click', () => $('#side').classList.toggle('open'));
    $('#filter-city')?.addEventListener('change', renderTable);

    $$('.range-btn').forEach((b) => b.addEventListener('click', () => {
      $$('.range-btn').forEach((x) => x.classList.toggle('on', x === b));
      rangeDays = Number(b.dataset.days);
      applyRange();
    }));

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

      ok.innerHTML = result.existed
        ? `أُضيفت الصلاحية لـ <b dir="ltr">${esc(email)}</b>. الحساب موجود مسبقاً، فكلمة مروره القديمة هي المعتمدة.`
        : `تم إنشاء الحساب ✓ أعطِ الموظف هذي البيانات:
           <span class="cred-box"><code>${esc(email)}</code><code>${esc(password)}</code></span>
           ${result.confirmed ? '' : '<br><b>ملاحظة:</b> الحساب ينتظر تفعيل البريد — عطّل Confirm email من Supabase ليدخل مباشرة.'}`;
      ok.hidden = false;

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

    $('#staff-list').addEventListener('click', async (e) => {
      const email = e.target.dataset?.remove;
      if (!email) return;
      if (!confirm(t('confirmRemove', { email }))) return;
      await removeStaff(email);
      renderStaff();
    });

    // إلغاء أو حذف طلب
    $('#table-body').addEventListener('click', async (e) => {
      const cancelId = e.target.dataset?.cancel;
      const deleteId = e.target.dataset?.delete;
      const ref = e.target.dataset?.ref;

      if (cancelId) {
        if (!confirm(t('confirmCancel', { ref }))) return;
        if (!(await updateStatus(cancelId, 'cancelled'))) { alert(t('failCancel')); return; }
        [allOrders, scoped].forEach((list) => {
          const row = list.find((r) => String(r.id) === String(cancelId));
          if (row) row.status = 'cancelled';
        });
        renderKpis(); renderPanels(); renderTable();
        return;
      }

      if (deleteId) {
        if (!confirm(t('confirmDelete', { ref }))) return;
        const response = await api(`/rest/v1/orders?id=eq.${deleteId}`, { method: 'DELETE' });
        if (!response.ok) { alert(t('failDelete')); return; }
        allOrders = allOrders.filter((r) => String(r.id) !== String(deleteId));
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

    $('#table-body').addEventListener('submit', (e) => {
      if (!e.target.matches('form.fill')) return;
      e.preventDefault();
      submitFill(e.target);
    });

    $('#table-body').addEventListener('click', (e) => {
      const id = e.target.dataset?.toggle;
      if (!id) return;
      const row = $(`tr[data-detail="${id}"]`);
      row.hidden = !row.hidden;
      e.target.textContent = row.hidden ? t('details') : t('hide');
    });

    document.addEventListener('visibilitychange', () => {
      const open = !$('#dash').hidden || !$('#staff-view').hidden;
      if (!document.hidden && open && session?.access_token) showDashboard({ quiet: true });
    });

    loadSession();
    if (session?.access_token) await showDashboard();
    else showLogin();
  });
})();
