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

  const STATUSES = {
    new:       { ar: 'جديد',    color: 'var(--st-new)' },
    contacted: { ar: 'تواصلنا', color: 'var(--st-contacted)' },
    confirmed: { ar: 'مؤكّد',   color: 'var(--st-confirmed)' },
    done:      { ar: 'منجز',    color: 'var(--st-done)' },
    cancelled: { ar: 'ملغي',    color: 'var(--st-cancelled)' },
  };
  const STATUS_FILL = {
    new:       'var(--ramp-1)',
    contacted: 'var(--ramp-2)',
    confirmed: 'var(--ramp-4)',
    done:      'var(--st-done)',
    cancelled: 'var(--st-cancelled)',
  };
  const WON = ['confirmed', 'done'];
  const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

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
    if (!response.ok) throw new Error(data.error_description || data.msg || 'تعذّر تسجيل الدخول');
    return data;
  }

  async function fetchOrders() {
    const response = await api('/rest/v1/orders?select=*&order=created_at.desc&limit=5000');
    if (response.status === 401) { clearSession(); showLogin('انتهت الجلسة، سجّل دخولك مرة ثانية.'); return null; }
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
      if (/already/i.test(msg)) throw new Error('هذا البريد له حساب بالفعل — استخدم تسجيل الدخول.');
      if (/password/i.test(msg)) throw new Error('كلمة المرور قصيرة — ٦ أحرف على الأقل.');
      throw new Error(msg || 'تعذّر إنشاء الحساب');
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
      ? '<p class="empty">لا يوجد مستخدمون بعد</p>'
      : rows.map((r) => {
        const isMe = String(r.email).toLowerCase() === String(session?.user?.email || '').toLowerCase();
        return `
        <div class="staff-row">
          <span class="staff-mail" dir="ltr">${esc(r.email)}${isMe ? ' <span class="me">(أنت)</span>' : ''}</span>
          <select class="status-select role-select" data-email="${esc(r.email)}" ${isMe ? 'disabled title="لا يمكنك تغيير صلاحيتك بنفسك"' : ''}>
            <option value="staff" ${r.role === 'staff' ? 'selected' : ''}>موظف</option>
            <option value="admin" ${r.role === 'admin' ? 'selected' : ''}>مدير</option>
          </select>
          <span class="staff-state ${r.registered ? 'ok' : ''}">
            ${r.registered ? 'سجّل دخوله' : 'لم يسجّل بعد'}</span>
          <button class="btn btn-ghost btn-sm" data-remove="${esc(r.email)}" ${isMe ? 'disabled' : ''}>حذف</button>
        </div>`;
      }).join('');
  }

  async function addStaff(email, staffRole) {
    const response = await api('/rest/v1/allowed_staff', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), role: staffRole }),
    });
    return response.ok;
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
      ['الزوار',            (v) => v.event === 'page_view'],
      ['بدأ الحجز',         (v) => v.event === 'begin_checkout'],
      ['اختار الحجم',       (v) => v.event === 'booking_step' && v.step === 'size'],
      ['الحلى والإضافات',   (v) => v.event === 'booking_step' && v.step === 'items'],
      ['الموعد والموقع',    (v) => v.event === 'booking_step' && v.step === 'when'],
      ['بياناته',           (v) => v.event === 'booking_step' && v.step === 'client'],
      ['المراجعة',          (v) => v.event === 'booking_step' && v.step === 'review'],
      ['أتمّ الطلب',        (v) => v.event === 'purchase'],
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
      kpi('الإيرادات المؤكّدة', n0(s.revenue), 'ر.س',
        deltaHtml(s.revenue, prev.revenue) || `من ${n0(s.wonCount)} طلب مؤكّد`, true),
      kpi('إجمالي الطلبات', n0(s.count), '',
        deltaHtml(s.count, prev.count) || 'في هذه الفترة'),
      kpi('متوسط قيمة الطلب', n0(s.avg), 'ر.س', 'للطلبات المؤكّدة'),
      kpi('نسبة التحويل', `${s.conversion.toFixed(0)}%`, '', 'من طلب إلى مؤكّد'),
      kpi('قيمة قيد الانتظار', n0(s.pipeline), 'ر.س', `${n0(s.newCount)} طلب جديد`),
      kpi('أكبر طلب', n0(s.biggest), 'ر.س', 'أعلى قيمة مسجّلة'),
    ].join('');

    const t = summariseTraffic(scopedVisits);
    $('#kpis-traffic').innerHTML = [
      kpi('الزوار', n0(t.visitors), '', `${n0(t.sessions)} جلسة`),
      kpi('مشاهدات الصفحة', n0(t.views), '', `${t.perSession.toFixed(1)} صفحة لكل جلسة`),
      kpi('بدأوا الحجز', n0(t.started), '', `${t.startRate.toFixed(0)}% من الجلسات`),
      kpi('أتمّوا الطلب', n0(t.finished), '', `${t.finishRate.toFixed(0)}% ممن بدأ`),
      kpi('زائر ← طلب', `${t.overall.toFixed(1)}%`, '', 'معدل التحويل الكلي'),
      kpi('متوسط الزوار يومياً', n0(dailyAvgVisitors()), '', 'في هذه الفترة'),
    ].join('');

    $('#kpis-ops').innerHTML = [
      kpi('أكواب مباعة', n0(s.cups), 'كوب', 'إجمالي الباقات × الأيام'),
      kpi('مبيعات الحلى', n0(s.sweets), 'ر.س', `${s.sweetRate.toFixed(0)}% من الطلبات فيها حلى`),
      kpi('مبيعات الإضافات', n0(s.addons), 'ر.س', 'باريستا إضافية وطباعة'),
      kpi('باريستا مشمولة', n0(s.baristas), '', 'مجاناً ضمن الطلبات'),
      kpi('متوسط مدة الخدمة', s.avgDays.toFixed(1), 'يوم', 'لكل طلب'),
      kpi('متوسط المهلة', Math.round(s.avgLead), 'يوم', 'بين الطلب والمناسبة'),
      kpi('مناسبات قادمة', n0(s.upcoming), '', `خلال ٣٠ يوم · ${n0(s.upcomingValue)} ر.س`),
      kpi('عملاء الشركات', `${s.companyRate.toFixed(0)}%`, '', 'من إجمالي الطلبات'),
    ].join('');
  }

  function dailyAvgVisitors() {
    const views = scopedVisits.filter((v) => v.event === 'page_view');
    if (!views.length) return 0;
    const days = new Set(views.map((v) => startOfDay(v.created_at).getTime())).size || 1;
    return new Set(views.map((v) => v.visitor)).size / days;
  }

  function renderBars(el, entries, unit, fmt = n0) {
    if (!entries.length) { el.innerHTML = '<p class="empty">لا توجد بيانات بعد</p>'; return; }
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
      `<span class="lg"><i style="background:var(--ramp-1)"></i>زوار <b class="num">${n0(totalVisitors)}</b></span>
       <span class="lg"><i style="background:var(--ramp-4)"></i>طلبات <b class="num">${n0(totalOrders)}</b></span>`;
  }

  function renderMonthly() {
    const months = byMonth(scoped);
    if (!months.length) { $('#chart-monthly').innerHTML = '<p class="empty">لا توجد بيانات بعد</p>'; return; }
    const max = Math.max(1, ...months.map(([, v]) => v.revenue));
    $('#chart-monthly').innerHTML = months.map(([key, v]) => `
      <div class="col" title="${key} · ${n0(v.revenue)} ر.س · ${v.count} طلب">
        <span class="col-bar" style="height:${(v.revenue / max) * 120}px"></span>
        <span class="col-lbl">${key.slice(5)}</span>
      </div>`).join('');
  }

  function renderStatusBars() {
    const counts = Object.entries(STATUSES)
      .map(([k, v]) => ({ key: k, ar: v.ar, n: scoped.filter((r) => r.status === k).length }))
      .filter((c) => c.n > 0)
      .sort((a, b) => b.n - a.n);

    const el = $('#status-bars');
    if (!counts.length) { el.innerHTML = '<p class="empty">لا توجد بيانات</p>'; return; }
    const max = counts[0].n;
    const total = counts.reduce((sum, c) => sum + c.n, 0);

    el.innerHTML = counts.map((c, i) => `
      <div class="bar-row" title="${c.ar}: ${c.n} طلب">
        <span class="name">${c.ar}</span>
        <span class="val num">${c.n} · ${Math.round((c.n / total) * 100)}%</span>
        <span class="bar-track"><span class="bar-fill"
          style="width:${(c.n / max) * 100}%;background:${STATUS_FILL[c.key] || 'var(--ramp-3)'}"></span></span>
      </div>`).join('');
  }

  function renderPanels() {
    renderDaily();
    renderMonthly();
    renderStatusBars();

    renderBars($('#top-packages'),
      tally(scoped, (r) => (r.package_name ? [{ key: r.package_name, qty: 1 }] : [])), 'طلب');

    renderBars($('#top-desserts'),
      tally(scoped, (r) => itemsOf(r).filter((i) => i.kind === 'dessert')
        .map((i) => ({ key: i.name, qty: i.qty }))), '');

    renderBars($('#top-cities'),
      tally(scoped, (r) => (r.city ? [{ key: r.city, qty: 1 }] : [])), 'طلب');

    renderBars($('#rev-cities'),
      tally(scoped.filter((r) => WON.includes(r.status)),
        (r) => (r.city ? [{ key: r.city, qty: Number(r.total || 0) }] : [])), 'ر.س');

    renderBars($('#top-weekdays'),
      tally(scoped, (r) => (r.event_date
        ? [{ key: WEEKDAYS[new Date(`${r.event_date}T12:00:00`).getDay()], qty: 1 }] : []), 7), 'مناسبة');

    // قمع الحجز — كل خطوة بنسبتها من الزوار
    const funnel = funnelCounts(scopedVisits);
    const top = funnel[0]?.[1] || 0;
    $('#funnel').innerHTML = !top
      ? '<p class="empty">لا توجد بيانات زوار بعد</p>'
      : funnel.map(([label, n], i) => `
          <div class="bar-row" title="${label}: ${n} جلسة">
            <span class="name">${label}</span>
            <span class="val num">${n0(n)} · ${Math.round((n / top) * 100)}%</span>
            <span class="bar-track"><span class="bar-fill"
              style="width:${(n / top) * 100}%;background:var(--ramp-${Math.min(5, 1 + Math.floor(i / 2))})"></span></span>
          </div>`).join('');

    const views = scopedVisits.filter((v) => v.event === 'page_view');
    renderBars($('#sources'),
      tally(views, (v) => (v.source ? [{ key: v.source, qty: 1 }] : [])), 'زيارة');
    renderBars($('#devices'),
      tally(views, (v) => (v.device ? [{ key: v.device === 'mobile' ? 'جوال' : 'كمبيوتر', qty: 1 }] : [])), 'زيارة');

    renderBars($('#top-addons'),
      tally(scoped, (r) => itemsOf(r).filter((i) => i.kind === 'addon')
        .map((i) => ({ key: i.name, qty: i.qty }))), '');
  }

  // ---------- الجدول ----------
  function visibleRows() {
    const q = $('#q').value.trim().toLowerCase();
    const status = $('#filter-status').value;

    const rows = scoped.filter((r) => {
      if (status && r.status !== status) return false;
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

  function renderTable() {
    const rows = visibleRows();
    $('#count').textContent = `${rows.length} من ${scoped.length}`;

    $$('#orders-table th.sortable').forEach((th) => {
      th.classList.toggle('sorted', th.dataset.sort === sortKey);
      const arrow = $('.arrow', th);
      if (arrow) arrow.textContent = th.dataset.sort === sortKey ? (sortDir === 1 ? '▲' : '▼') : '⇅';
    });

    if (!rows.length) {
      $('#table-body').innerHTML = '<tr><td colspan="8"><p class="empty">لا توجد طلبات مطابقة</p></td></tr>';
      return;
    }

    $('#table-body').innerHTML = rows.map((r) => {
      const st = STATUSES[r.status] || STATUSES.new;
      const maps = r.lat && r.lng ? `https://maps.google.com/?q=${r.lat},${r.lng}` : '';
      const items = itemsOf(r);
      return `
      <tr class="row-main">
        <td><span class="ref">${esc(r.ref)}</span><div class="muted">${dateTime(r.created_at)}</div></td>
        <td>${esc(r.customer_name || '—')}
            <div class="muted">${r.client_type === 'company' ? esc(r.company || 'شركة') : 'أفراد'}</div></td>
        <td><a href="tel:${esc(r.phone)}" dir="ltr">${esc(r.phone || '—')}</a></td>
        <td>${esc(r.package_name || '—')}<div class="muted">${esc(r.days)} يوم</div></td>
        <td class="tab">${dateOnly(r.event_date)}<div class="muted">${esc(r.event_time || '')}</div></td>
        <td>${esc(r.city || '—')}<div class="muted">${esc(r.district || '')}${maps ? ` · <a href="${maps}" target="_blank" rel="noopener">خريطة</a>` : ''}</div></td>
        <td class="tab"><b>${n2(r.total)}</b></td>
        <td>
          <span class="pill" style="background:color-mix(in srgb, ${st.color} 14%, transparent);color:${st.color}">
            <i style="background:${st.color}"></i>${st.ar}</span>
          <div style="margin-block-start:.4rem;display:flex;gap:.4rem;align-items:center">
            <select class="status-select" data-id="${r.id}">
              ${Object.entries(STATUSES).map(([k, v]) =>
                `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v.ar}</option>`).join('')}
            </select>
            <button class="detail-toggle" data-toggle="${r.id}">تفاصيل</button>
          </div>
          <div class="row-actions">
            ${r.status !== 'cancelled'
              ? `<button class="btn btn-danger btn-sm" data-cancel="${r.id}" data-ref="${esc(r.ref)}">إلغاء الطلب</button>`
              : ''}
            <button class="btn btn-ghost btn-sm" data-delete="${r.id}" data-ref="${esc(r.ref)}">حذف نهائي</button>
          </div>
        </td>
      </tr>
      <tr class="row-detail" data-detail="${r.id}" hidden>
        <td colspan="8">
          <dl class="detail-grid">
            <div><dt>الموقع</dt><dd>${esc(r.venue || '—')}</dd></div>
            <div><dt>الحي</dt><dd>${esc(r.district || '—')}</dd></div>
            <div><dt>باريستا مشمولة</dt><dd class="num">${esc(r.included_baristas)}</dd></div>
            <div><dt>الإضافات</dt><dd class="num">${n2(r.addons_total)} ر.س</dd></div>
            <div><dt>الحلى</dt><dd class="num">${n2(r.desserts_total)} ر.س</dd></div>
            ${r.vat ? `<div><dt>الرقم الضريبي</dt><dd class="num">${esc(r.vat)}</dd></div>` : ''}
            ${r.notes ? `<div style="grid-column:1/-1"><dt>ملاحظات العميل</dt><dd>${esc(r.notes)}</dd></div>` : ''}
          </dl>
          ${items.length ? `<ul class="items-list">${items.map((i) => `
            <li><span>${esc(i.name)} — <span class="num">${esc(i.qty)}</span> ${esc(i.unit)}</span>
                <span class="num">${n2(i.total)} ر.س</span></li>`).join('')}</ul>` : ''}
        </td>
      </tr>`;
    }).join('');
  }

  // ---------- تصدير إلى إكسل ----------
  function exportCsv() {
    const rows = visibleRows();
    const headers = [
      'رقم الطلب', 'تاريخ الطلب', 'الحالة', 'العميل', 'نوع العميل', 'الشركة',
      'الرقم الضريبي', 'الجوال', 'الخدمة', 'الباقة', 'الأيام', 'تاريخ المناسبة',
      'الوقت', 'المدينة', 'الحي', 'الموقع', 'رابط الخريطة', 'باريستا مشمولة',
      'الإضافات', 'الحلى', 'الإجمالي', 'الأصناف', 'ملاحظات',
    ];

    const cell = (v) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };

    const lines = rows.map((r) => [
      r.ref,
      String(r.created_at || '').slice(0, 19).replace('T', ' '),
      (STATUSES[r.status] || {}).ar || r.status,
      r.customer_name,
      r.client_type === 'company' ? 'شركة' : 'أفراد',
      r.company, r.vat, r.phone,
      r.service === 'counter' ? 'ركن ضيافة القهوة' : 'خدمة الحافظات',
      r.package_name, r.days, r.event_date, r.event_time,
      r.city, r.district, r.venue,
      r.lat && r.lng ? `https://maps.google.com/?q=${r.lat},${r.lng}` : '',
      r.included_baristas, r.addons_total, r.desserts_total, r.total,
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
    const rows = schedule
      .filter((r) => r.event_date && startOfDay(r.event_date) >= today)
      .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));

    const q = ($('#sch-q')?.value || '').trim().toLowerCase();
    const shown = q
      ? rows.filter((r) => [r.ref, r.city, r.district, r.venue, r.customer_name]
          .some((v) => String(v ?? '').toLowerCase().includes(q)))
      : rows;

    const next7 = rows.filter((r) => {
      const d = startOfDay(r.event_date);
      const limit = new Date(today); limit.setDate(limit.getDate() + 7);
      return d <= limit;
    }).length;

    $('#sch-kpis').innerHTML = [
      kpi('مناسبات قادمة', n0(rows.length), '', 'من اليوم فما بعد'),
      kpi('خلال ٧ أيام', n0(next7), '', 'استعد لها'),
      kpi('أقرب مناسبة', rows[0] ? dateOnly(rows[0].event_date) : '—', '',
        rows[0] ? `${esc(rows[0].city)} · ${esc(rows[0].event_time || '')}` : ''),
    ].join('');

    $('#sch-count').textContent = `${shown.length} مناسبة`;

    $('#sch-body').innerHTML = !shown.length
      ? '<tr><td colspan="6"><p class="empty">لا توجد مناسبات قادمة</p></td></tr>'
      : shown.map((r) => {
          const maps = r.lat && r.lng ? `https://maps.google.com/?q=${r.lat},${r.lng}` : '';
          const days = Math.round((startOfDay(r.event_date) - today) / 86400000);
          const items = Array.isArray(r.items) ? r.items : [];
          return `
          <tr class="row-main">
            <td class="tab"><b>${dateOnly(r.event_date)}</b>
                <div class="muted">${days === 0 ? 'اليوم' : days === 1 ? 'غداً' : `بعد ${days} يوم`}</div></td>
            <td class="tab"><b>${esc(r.event_time || '—')}</b>
                <div class="muted">${esc(r.days)} يوم</div></td>
            <td>${esc(r.city || '—')}
                <div class="muted">${esc(r.district || '')}${maps ? ` · <a href="${maps}" target="_blank" rel="noopener">خريطة</a>` : ''}</div></td>
            <td>${esc(r.venue || '—')}</td>
            <td>${esc(r.package_name || '—')}
                <div class="muted">${esc(r.included_baristas)} باريستا${items.length ? ` · ${items.length} صنف إضافي` : ''}</div></td>
            <td>${esc(r.customer_name || '—')}
                <div class="muted"><a href="tel:${esc(r.phone)}" dir="ltr">${esc(r.phone || '')}</a></div>
                ${r.notes ? `<div class="muted note-line">${esc(r.notes)}</div>` : ''}</td>
          </tr>`;
        }).join('');
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
    const text = `آخر تحديث ${new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',
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
    if (!opts.quiet) $$('.refresh').forEach((b) => { b.textContent = 'جارٍ التحديث…'; });

    try {
      if (!role) role = (await claimAccess()) || (await fetchRole());

      if (!role) {
        $('#dash').hidden = true;
        $('#staff-view').hidden = true;
        showLogin('حسابك غير مُصرَّح له. تواصل مع المدير لإضافة بريدك.');
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
        renderSchedule();
        stampSync();
        startAutoRefresh();
        return;
      }

      const [rows, visits] = await Promise.all([fetchOrders(), fetchVisits()]);
      if (rows === null) return;
      allOrders = rows;
      allVisits = visits || [];
      applyRange();
      renderStaff();
      stampSync();
      startAutoRefresh();
    } catch (error) {
      console.error(error);
      $('#table-body').innerHTML = '<tr><td colspan="8"><p class="empty">تعذّر تحميل الطلبات</p></td></tr>';
    } finally {
      $$('.refresh').forEach((b) => { b.textContent = 'تحديث'; });
    }
  }

  // ---------- الربط ----------
  document.addEventListener('DOMContentLoaded', async () => {
    if (!cfg.SUPABASE_URL) { showLogin('لم تُضبط إعدادات قاعدة البيانات.'); return; }

    let authMode = 'signin';

    function setAuthMode(mode) {
      authMode = mode;
      const up = mode === 'signup';
      $$('.tab-btn').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
      $('#auth-title').textContent = up ? 'إنشاء كلمة المرور' : 'تسجيل الدخول';
      $('#auth-sub').textContent = up
        ? 'اكتب بريدك الذي أضافه المدير، واختر كلمة مرورك'
        : 'ادخل إلى لوحة وِكاد';
      $('#pass-label').textContent = up ? 'كلمة المرور الجديدة' : 'كلمة المرور';
      $('#password').setAttribute('autocomplete', up ? 'new-password' : 'current-password');
      $('#login-btn').textContent = up ? 'إنشاء الحساب' : 'دخول';
      $('#pass-hint').hidden = !up;
      $('#signup-note').hidden = !up;
      $('#login-err').hidden = true;
      $('#login-ok').hidden = true;
    }

    $$('.tab-btn').forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.mode)));

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = $('#login-btn');
      const email = $('#email').value.trim();
      const password = $('#password').value;
      const label = button.textContent;

      button.disabled = true;
      button.textContent = 'لحظة…';
      $('#login-err').hidden = true;
      $('#login-ok').hidden = true;

      try {
        if (authMode === 'signup') {
          const data = await signUp(email, password);
          if (data.access_token) {
            saveSession(data);
          } else {
            // التأكيد بالبريد مفعّل: نحاول الدخول مباشرة، وإلا نوجّهه للبريد
            try {
              saveSession(await signIn(email, password));
            } catch {
              $('#login-ok').textContent =
                'أُنشئ حسابك. افتح بريدك واضغط رابط التفعيل، ثم ارجع وسجّل دخولك.';
              $('#login-ok').hidden = false;
              setAuthMode('signin');
              return;
            }
          }
        } else {
          saveSession(await signIn(email, password));
        }
        role = null;
        await showDashboard();
      } catch (error) {
        showLogin(error.message);
      } finally {
        button.disabled = false;
        button.textContent = label;
      }
    });

    $$('.logout').forEach((b) => b.addEventListener('click', () => { clearSession(); role = null; showLogin(); }));
    $$('.refresh').forEach((b) => b.addEventListener('click', () => showDashboard()));
    $('#export').addEventListener('click', exportCsv);
    $('#q').addEventListener('input', renderTable);
    $('#filter-status').addEventListener('change', renderTable);

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
      if (!(await updateStatus(id, value))) { alert('تعذّر تحديث الحالة'); return; }
      [allOrders, scoped].forEach((list) => {
        const row = list.find((r) => String(r.id) === String(id));
        if (row) row.status = value;
      });
      renderKpis();
      renderPanels();
      renderTable();
    });

    // إضافة موظف
    $('#staff-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('#staff-email').value.trim();
      if (!email) return;
      if (!(await addStaff(email, $('#staff-role').value))) { alert('تعذّرت الإضافة'); return; }
      $('#staff-email').value = '';
      renderStaff();
    });

    $('#staff-list').addEventListener('change', async (e) => {
      if (!e.target.classList.contains('role-select')) return;
      const email = e.target.dataset.email;
      const newRole = e.target.value;
      if (!confirm(`تغيير صلاحية ${email} إلى ${newRole === 'admin' ? 'مدير' : 'موظف'}؟`)) {
        renderStaff();
        return;
      }
      if (!(await changeRole(email, newRole))) alert('تعذّر التغيير');
      renderStaff();
    });

    $('#staff-list').addEventListener('click', async (e) => {
      const email = e.target.dataset?.remove;
      if (!email) return;
      if (!confirm(`إزالة صلاحية ${email}؟ لن يقدر يدخل اللوحة بعدها.`)) return;
      await removeStaff(email);
      renderStaff();
    });

    // إلغاء أو حذف طلب
    $('#table-body').addEventListener('click', async (e) => {
      const cancelId = e.target.dataset?.cancel;
      const deleteId = e.target.dataset?.delete;
      const ref = e.target.dataset?.ref;

      if (cancelId) {
        if (!confirm(`إلغاء الطلب ${ref}؟`)) return;
        if (!(await updateStatus(cancelId, 'cancelled'))) { alert('تعذّر الإلغاء'); return; }
        [allOrders, scoped].forEach((list) => {
          const row = list.find((r) => String(r.id) === String(cancelId));
          if (row) row.status = 'cancelled';
        });
        renderKpis(); renderPanels(); renderTable();
        return;
      }

      if (deleteId) {
        if (!confirm(`حذف الطلب ${ref} نهائياً؟ لا يمكن التراجع.`)) return;
        const response = await api(`/rest/v1/orders?id=eq.${deleteId}`, { method: 'DELETE' });
        if (!response.ok) { alert('تعذّر الحذف'); return; }
        allOrders = allOrders.filter((r) => String(r.id) !== String(deleteId));
        applyRange();
      }
    });

    $('#sch-q').addEventListener('input', renderSchedule);

    $('#table-body').addEventListener('click', (e) => {
      const id = e.target.dataset?.toggle;
      if (!id) return;
      const row = $(`tr[data-detail="${id}"]`);
      row.hidden = !row.hidden;
      e.target.textContent = row.hidden ? 'تفاصيل' : 'إخفاء';
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
