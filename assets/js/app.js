/* ==========================================================================
   وِكاد — booking flow
   Service -> size -> desserts & add-ons -> date & location -> details -> confirm.
   Runs entirely in the browser; nothing is stored anywhere.
   ========================================================================== */
(() => {
  'use strict';

  /* --------------------------------------------------------------------
     EDIT HERE: numbers, names and prices all live in this block.
     -------------------------------------------------------------------- */

  const WHATSAPP = '966552487363';          // where confirmed orders are delivered

  const DRINKS = [
    'اسبريسو', 'أمريكانو', 'كابتشينو', 'فلات وايت',
    'لاتيه', 'سبانش لاتيه', 'V60', 'ايس ماتشا', 'ايس كركديه',
  ];

  const PACKAGES = [
    { id: 'p25',  cups: 25,  price: 1399 },
    { id: 'p50',  cups: 50,  price: 1750 },
    { id: 'p100', cups: 100, price: 2800 },
    { id: 'p200', cups: 200, price: 3900 },
    { id: 'p300', cups: 300, price: 5500 },
  ];

  const FLASKS = [
    { id: 'f1', count: 1, price: 450, cupsFrom: 30, cupsTo: 35, ar: 'حافظة واحدة', en: 'One flask' },
    { id: 'f2', count: 2, price: 790, cupsFrom: 60, cupsTo: 70, ar: 'حافظتان',      en: 'Two flasks' },
  ];

  // per: 'day'   -> price × quantity × number of days
  // per: 'piece' -> price × quantity (one-off)
  const EXTRAS = [
    { id: 'barista', ar: 'باريستا إضافية (امرأة)', en: 'Extra Barista (Female)', price: 300, per: 'day',   step: 1,  max: 10,   unitAr: 'باريستا' },
    { id: 'print',   ar: 'طباعة أكواب',            en: 'Cup Print',              price: 5,   per: 'piece', step: 25, max: 3000, unitAr: 'كوب' },
  ];

  // Baristas that come with the order at no charge. A second one is included
  // once the package is large *and* the dessert order is substantial.
  const BARISTA_RULE = {
    base: 1,                 // باريستا واحدة مجاناً مع كل طلب
    bonusFromCups: 200,      // الباقة تُعتبر كبيرة من هذا العدد فأكثر
    bonusFromDesserts: 1000, // قيمة الحلى (ر.س) التي تُعتبر "كثيرة"
  };

  // The dessert menu, grouped by the unit each group is sold in.
  const DESSERT_GROUPS = [
    {
      id: 'tart',
      ar: 'التارت',
      en: 'Tarts',
      note: 'الطبق ٥٠ حبة',
      unitAr: 'طبق',
      max: 40,
      items: [
        { id: 't-custard',   ar: 'تارت كاسترد',  en: 'Custard Tart',   price: 305 },
        { id: 't-pecan',     ar: 'تارت بيكان',   en: 'Pecan Tart',     price: 305 },
        { id: 't-chocolate', ar: 'تارت تشوكلت',  en: 'Chocolate Tart', price: 305 },
      ],
    },
    {
      id: 'cake',
      ar: 'الكيك الطبيعي الكبير',
      en: 'Large Fresh Cakes',
      note: 'يُطلب بالحبة',
      unitAr: 'كيكة',
      max: 100,
      items: [
        { id: 'c-pecan',      ar: 'بيكان',           en: 'Pecan',            price: 35.1 },
        { id: 'c-graham',     ar: 'قراهم',           en: 'Graham',           price: 37.7 },
        { id: 'c-carrot',     ar: 'جزر',             en: 'Carrot',           price: 37.7 },
        { id: 'c-cheesecake', ar: 'وِكاد تشيزكيك',   en: 'Wekad Cheesecake', price: 37.7 },
        { id: 'c-chocolate',  ar: 'وِكاد تشوكلت',    en: 'Wekad Chocolate',  price: 37.7 },
        { id: 'c-london',     ar: 'لندن',            en: 'London',           price: 41.6 },
        { id: 'c-classic',    ar: 'كلاسيك تشوكلت',   en: 'Classic Chocolate', price: 35.1 },
        { id: 'c-matilda',    ar: 'ماتلدا',          en: 'Matilda',          price: 41.6 },
      ],
    },
  ];

  // Eastern Province only.
  // "أخرى" تبقى مفتوحة: نأخذ المدينة بالمكالمة بدل أن نرفض الطلب
  const CITIES = ['الدمام', 'الخبر', 'الظهران', 'القطيف', 'سيهات', 'أخرى'];

  /* -------------------------------------------------------------------- */

  const SERVICES = {
    counter: { ar: 'ركن ضيافة القهوة', en: 'Coffee Catering Counter' },
    flask:   { ar: 'خدمة الحافظات',     en: 'Flask Service' },
  };

  const DESSERTS = DESSERT_GROUPS.flatMap((g) =>
    g.items.map((d) => ({
      ...d, per: 'piece', step: 1, max: g.max, unitAr: g.unitAr, dessert: true, group: g.id,
    })));

  const ITEMS = [...EXTRAS, ...DESSERTS];

  const state = {
    step: 0,
    service: 'counter',
    packageId: 'p100',
    customCups: '',
    customRequest: '',
    flaskId: 'f1',
    qty: Object.fromEntries(ITEMS.map((i) => [i.id, 0])),
    days: 1,
    date: '',
    city: CITIES[0],
    clientType: 'individual',
    name: '',
    phone: '',
    company: '',
    vat: '',
    notes: '',
  };

  // Analytics is optional: the app must behave identically when it is absent.
  const track = (name, params) => { try { window.wekadTrack?.(name, params); } catch { /* never break the form */ } };

  const blockedDays = new Map();   // 'YYYY-MM-DD' -> سبب الإقفال

  /** الأيام التي أقفلها المدير من اللوحة. فشل التحميل لا يمنع الحجز. */
  async function loadBlockedDays() {
    const cfg = window.WEKAD_CONFIG || {};
    if (!cfg.SUPABASE_URL) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const response = await fetch(
        `${cfg.SUPABASE_URL}/rest/v1/blocked_dates?select=day,reason&day=gte.${today}`,
        { headers: { apikey: cfg.SUPABASE_KEY, Authorization: `Bearer ${cfg.SUPABASE_KEY}` } },
      );
      if (!response.ok) return;
      (await response.json()).forEach((row) => blockedDays.set(row.day, row.reason || ''));
      renderCalendar();
    } catch { /* الموقع يعمل بدونها */ }
  }

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  // Cake prices have decimals, package prices do not — show only what is there.
  const fmt = (n) => round2(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- pricing ----------
  const CUSTOM = { id: 'custom', ar: 'باقة مخصصة', en: 'Custom package', price: 0 };

  function isCustom() {
    return state.service === 'counter' && state.packageId === 'custom';
  }

  function chosenBase() {
    if (isCustom()) return { ...CUSTOM, cups: Number(state.customCups) || 0 };
    return state.service === 'counter'
      ? PACKAGES.find((p) => p.id === state.packageId)
      : FLASKS.find((f) => f.id === state.flaskId);
  }

  function lineItems() {
    return ITEMS
      .map((item) => {
        const qty = state.qty[item.id] || 0;
        if (!qty) return null;
        const total = round2(item.per === 'day' ? item.price * qty * state.days : item.price * qty);
        return { ...item, qty, total };
      })
      .filter(Boolean);
  }

  function dessertsTotal() {
    return round2(lineItems().filter((l) => l.dessert).reduce((sum, l) => sum + l.total, 0));
  }

  function includedBaristas() {
    if (state.service === 'flask') return 0;      // الحافظات بلا باريستا
    const base = chosenBase();
    const cups = state.service === 'counter' && base ? base.cups : 0;
    const bigPackage = cups >= BARISTA_RULE.bonusFromCups;
    const manyDesserts = dessertsTotal() >= BARISTA_RULE.bonusFromDesserts;
    return bigPackage && manyDesserts ? BARISTA_RULE.base + 1 : BARISTA_RULE.base;
  }

  function totals() {
    const base = chosenBase();
    const baseTotal = base ? base.price * state.days : 0;
    const lines = lineItems();
    const linesTotal = round2(lines.reduce((sum, l) => sum + l.total, 0));
    return { base, baseTotal, lines, linesTotal, grand: round2(baseTotal + linesTotal) };
  }

  // ---------- quantity rows ----------
  function qtyRow(item) {
    return `
      <div class="qrow" data-id="${item.id}">
        <div class="qrow-main">
          <span class="qrow-name">${item.ar}<span class="en">${item.en}</span></span>
        </div>
        <div class="stepper stepper--sm">
          <button type="button" data-q="-" aria-label="إنقاص ${item.ar}">−</button>
          <input type="number" value="0" min="0" max="${item.max}" step="${item.step}" inputmode="numeric" aria-label="كمية ${item.ar}">
          <button type="button" data-q="+" aria-label="زيادة ${item.ar}">+</button>
        </div>

      </div>`;
  }

  function refreshQtyTotals() {
    $$('.qrow').forEach((row) => {
      const item = ITEMS.find((i) => i.id === row.dataset.id);
      row.classList.toggle('on', (state.qty[item.id] || 0) > 0);
    });
  }

  // ---------- static rendering ----------
  function renderStatic() {
    if ($('#chips')) $('#chips').innerHTML = DRINKS.map((d) => `<span class="chip">${d}</span>`).join('');

    if ($('#pkg-grid')) $('#pkg-grid').innerHTML = PACKAGES.map((p, i) => `
      <article class="pkg reveal" style="--d:${i * 70}ms">
        <div class="pkg-label">عــدد الأكـواب<span class="en">Total of cups</span></div>
        <div class="pkg-cups num">${p.cups}</div>
        <div class="pkg-cups-unit">كوب</div>

      </article>`).join('');

    // wizard options
    $('#opt-packages').innerHTML = PACKAGES.map((p) => `
      <label class="opt">
        <input type="radio" name="pkg" value="${p.id}" ${p.id === state.packageId ? 'checked' : ''}>
        <span class="opt-check"></span>
        <span class="opt-big num">${p.cups}</span>
        <span class="opt-meta">كوب / cups</span>
      </label>`).join('') + `
      <label class="opt opt--custom">
        <input type="radio" name="pkg" value="custom" ${state.packageId === 'custom' ? 'checked' : ''}>
        <span class="opt-check"></span>
        <span class="opt-big">✎</span>
        <span class="opt-name">باقة مخصصة<span class="en">Custom package</span></span>
        <span class="opt-meta">نفصّلها على مقاسك</span>
      </label>`;

    $('#opt-flasks').innerHTML = FLASKS.map((f) => `
      <label class="opt">
        <input type="radio" name="flask" value="${f.id}" ${f.id === state.flaskId ? 'checked' : ''}>
        <span class="opt-check"></span>
        <span class="opt-big num">${f.count}</span>
        <span class="opt-name">${f.ar}<span class="en">${f.en}</span></span>
        <span class="opt-meta">${f.cupsFrom}–${f.cupsTo} كوب</span>

      </label>`).join('');

    $('#qty-extras').innerHTML = EXTRAS.map(qtyRow).join('');
    renderIncluded();
    $('#qty-desserts').innerHTML = DESSERT_GROUPS.map((g) => `
      <h4 class="sub-head sub-head--inner">${g.ar}<span class="en">${g.en}</span>
        <span class="sub-note">${g.note}</span></h4>
      <div class="qlist">
        ${DESSERTS.filter((d) => d.group === g.id).map(qtyRow).join('')}
      </div>`).join('');

    $('#f-city').innerHTML = CITIES.map((c) =>
      `<option ${c === state.city ? 'selected' : ''}>${c}</option>`).join('');
  }

  /** تظهر حقول التخصيص فقط عند اختيار "باقة مخصصة". */
  function syncCustomPanel() {
    const box = $('#custom-panel');
    if (!box) return;
    const on = state.service === 'counter' && state.packageId === 'custom';
    box.hidden = !on;
    if (on) $('#f-custom-cups').focus({ preventScroll: true });
  }

  function syncSizePane() {
    const counter = state.service === 'counter';
    $('#size-counter').hidden = !counter;
    $('#size-flask').hidden = counter;
    syncCustomPanel();
    $('#size-title-ar').textContent = counter ? 'عدد الأكواب' : 'عدد الحافظات';
    $('#size-title-en').textContent = counter ? 'Total of cups' : 'Number of flasks';
  }

  function renderReview() {
    const t = totals();
    const sizeText = isCustom()
      ? `باقة مخصصة — ${t.base.cups} كوب`
      : state.service === 'counter'
        ? `${t.base.cups} كوب`
        : `${t.base.ar} (${t.base.cupsFrom}–${t.base.cupsTo} كوب)`;

    const rows = [
      ['الخدمة', SERVICES[state.service].ar],
      ['باريستا مشمولة مجاناً', `${includedBaristas()}`],
      [state.service === 'counter' ? 'الباقة' : 'الحافظات', sizeText],
      ...(isCustom() ? [['طلبك الخاص', state.customRequest]] : []),
      ['يوم المناسبة', state.date ? prettyPicked(state.date) : '—'],
      ['المدينة', state.city],
      ...t.lines.map((l) => [l.ar, `${fmt(l.qty)} ${l.unitAr}`]),
      ['نوع العميل', state.clientType === 'company' ? 'شركة' : 'أفراد'],
      ...(state.clientType === 'company'
        ? [['اسم الشركة', state.company || '—'], ['الرقم الضريبي', state.vat || '—']]
        : []),
      ['الاسم', state.name || '—'],
      ['الجوال', state.phone || '—'],
      ...(state.notes ? [['ملاحظات', state.notes]] : []),
    ];

    $('#review').innerHTML =
      rows.map(([k, v]) => `<div class="review-row"><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
  }

  function renderIncluded() {
    const box = $('#included-note');
    if (!box) return;

    // الحافظات تُسلَّم جاهزة بلا طاقم، فلا معنى لحديث الباريستا معها
    if (state.service === 'flask') {
      box.innerHTML = `
        <span class="inc-badge">خدمة الحافظات</span>
        <span class="inc-text">تُسلَّم جاهزة ومحفوظة على حرارتها — <strong>بدون باريستا</strong>.</span>`;
      return;
    }

    const n = includedBaristas();
    box.innerHTML = `
      <span class="inc-badge">مشمول مجاناً</span>
      <span class="inc-text">
        <strong class="num">${n}</strong> باريستا مع طلبك بدون أي رسوم.
        ${n === 1
          ? `<em>تصير ٢ تلقائياً مع باقة ${BARISTA_RULE.bonusFromCups} كوب فأكثر وطلب حلى كبير.</em>`
          : '<em>ترقّت إلى باريستين لأن الباقة كبيرة وطلب الحلى كبير.</em>'}
      </span>`;
  }

  function renderTotal() {
    refreshQtyTotals();
    renderIncluded();
  }

  // ---------- calendar ----------
  const WEEKDAYS_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const monthLabel = (d) =>
    new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' }).format(d);

  function prettyPicked(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('ar', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(y, m - 1, d));
  }

  let calMonth = null;

  /** تقويم شهري: اليوم الوحيد الذي يختاره العميل. الأيام الماضية والمقفلة معطّلة. */
  function renderCalendar() {
    const grid = $('#cal-grid');
    if (!grid) return;
    if (!calMonth) calMonth = new Date();

    $('#cal-title').textContent = monthLabel(calMonth);
    $('#cal-week').innerHTML = WEEKDAYS_SHORT
      .map((w) => `<span class="cal-wd">${w}</span>`).join('');

    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const first = new Date(year, month, 1).getDay();          // 0 = الأحد
    const count = new Date(year, month + 1, 0).getDate();
    const today = ymd(new Date());

    const cells = [];
    for (let i = 0; i < first; i += 1) cells.push('<span class="cal-blank"></span>');
    for (let day = 1; day <= count; day += 1) {
      const iso = ymd(new Date(year, month, day));
      const past = iso <= today;
      const blocked = blockedDays.has(iso);
      const picked = iso === state.date;
      const why = blocked ? blockedDays.get(iso) : '';
      const cls = ['cal-day'];
      if (past) cls.push('is-past');
      if (blocked) cls.push('is-blocked');
      if (picked) cls.push('is-picked');
      cells.push(
        `<button type="button" class="${cls.join(' ')}" data-day="${iso}"`
        + `${past || blocked ? ' disabled' : ''}`
        + `${blocked ? ` title="غير متاح${why ? ` — ${escapeHtml(why)}` : ''}"` : ''}`
        + `${picked ? ' aria-current="date"' : ''}>${day}</button>`,
      );
    }
    grid.innerHTML = cells.join('');

    // لا يرجع قبل الشهر الحالي
    const now = new Date();
    $('#cal-prev').disabled = year === now.getFullYear() && month === now.getMonth();

    $('#cal-picked').textContent = state.date ? prettyPicked(state.date) : '';
    $('#cal-picked').hidden = !state.date;
  }

  // ---------- steps ----------
  const PANES = ['client', 'service', 'when', 'review'];

  const STEP_LABELS = {
    service: 'الخدمة', size: 'الحجم', items: 'الحلى والإضافات',
    when: 'الموعد والموقع', client: 'بياناتك', review: 'المراجعة',
  };
  let reachedCheckout = false;

  function goto(index, scroll = true) {
    state.step = Math.max(0, Math.min(PANES.length - 1, index));

    $$('.pane').forEach((p, i) => p.classList.toggle('on', i === state.step));
    $$('.step').forEach((s, i) => {
      s.classList.toggle('active', i === state.step);
      s.classList.toggle('done', i < state.step);
    });

    $('#btn-back').disabled = state.step === 0;
    const last = state.step === PANES.length - 1;
    $('#btn-next').hidden = last;
    $('#btn-send').hidden = !last;

    if (PANES[state.step] === 'service') syncSizePane();

    const paneName = PANES[state.step];
    if (state.step > 0 && !reachedCheckout) {
      reachedCheckout = true;
      track('begin_checkout', { currency: 'SAR', value: totals().grand });
    }
    track('booking_step', {
      step_number: state.step + 1,
      step_name: paneName,
      step_label: STEP_LABELS[paneName],
    });
    if (last) renderReview();
    renderTotal();
    $('#err').textContent = '';

    if (scroll) {
      if (window.wekadScrollTo) {
        window.wekadScrollTo($('#book'));
      } else {
        const top = $('#book').getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
  }

  function validate() {
    if (PANES[state.step] === 'service' && isCustom()) {
      const cups = Number(state.customCups);
      if (!cups || cups < 10) return 'اكتب عدد الأكواب التقريبي (١٠ على الأقل).';
      if (cups > 5000) return 'عدد الأكواب كبير جداً — تواصل معنا مباشرة.';
      if (state.customRequest.trim().length < 10) return 'اكتب وصفاً قصيراً لما تحتاجه.';
    }

    if (PANES[state.step] === 'when') {
      const today = ymd(new Date());
      if (!state.date) return 'اختر يوم المناسبة من التقويم.';
      if (state.date <= today) return 'اختر يوماً بعد اليوم.';
      if (blockedDays.has(state.date)) {
        const why = blockedDays.get(state.date);
        return `هذا اليوم غير متاح${why ? ` — ${why}` : ''}. اختر يوماً آخر.`;
      }
    }
    if (PANES[state.step] === 'client') {
      if (state.name.trim().length < 3) return 'اكتب اسمك الكامل.';
      if (!/^(?:\+?9665|05|5)\d{8}$/.test(state.phone.replace(/[\s-]/g, ''))) {
        return 'اكتب رقم جوال صحيح (مثال: 0551234567).';
      }
      if (state.clientType === 'company' && state.company.trim().length < 2) return 'اكتب اسم الشركة.';
    }
    return '';
  }

  // ---------- order handoff ----------

  /** Short human reference so the team can quote an order back to the customer. */
  function orderRef() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let tail = '';
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    bytes.forEach((b) => { tail += alphabet[b % alphabet.length]; });
    return `WK-${tail}`;
  }

  function arabicDay(iso) {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { weekday: 'long' }).format(d);
  }

  function prettyDate(iso) {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(d);
  }

  let currentRef = '';

  /**
   * The message is read on a phone by whoever is on shift, so it is laid out in
   * labelled blocks with one fact per line rather than a dense paragraph.
   */
  function buildMessage() {
    const t = totals();
    const sweets = t.lines.filter((l) => l.dessert);
    const addons = t.lines.filter((l) => !l.dessert);
    const sweetsTotal = sweets.reduce((sum, l) => sum + l.total, 0);
    const addonsTotal = addons.reduce((sum, l) => sum + l.total, 0);
    const out = [];

    const HR = '━━━━━━━━━━━━━━━';

    out.push('*☕ طلب حجز جديد — وِكاد*');
    out.push(`*رقم الطلب:* ${currentRef}`);
    out.push('');

    // ---- 1. service ----
    out.push(HR);
    out.push('*١ · الخدمة المطلوبة*');
    out.push(HR);
    out.push(`▪︎ النوع: ${SERVICES[state.service].ar}`);
    if (isCustom()) {
      out.push('▪︎ *باقة مخصصة*');
      out.push(`▪︎ عدد الأكواب التقريبي: ${t.base.cups}`);
      out.push('▪︎ طلب العميل:');
      out.push(state.customRequest.trim());
    } else if (state.service === 'counter') {
      out.push(`▪︎ الباقة: ${t.base.cups} كوب`);
    } else {
      out.push(`▪︎ الحافظات: ${t.base.ar}`);
      out.push(`▪︎ تكفي: ${t.base.cupsFrom}–${t.base.cupsTo} كوب`);
    }
    out.push('');

    // ---- 2. when ----
    out.push(HR);
    out.push('*٢ · يوم المناسبة*');
    out.push(HR);
    out.push(`▪︎ اليوم: ${arabicDay(state.date)}`);
    out.push(`▪︎ التاريخ: ${prettyDate(state.date)}  (${state.date})`);
    out.push(`▪︎ المدينة: ${state.city}`);
    out.push('');

    // ---- 4. add-ons ----
    out.push(HR);
    out.push('*٣ · الإضافات*');
    out.push(HR);
    out.push(`▪︎ باريستا مشمولة مجاناً: ${includedBaristas()}`);
    if (addons.length) {
      addons.forEach((l) => {
        out.push(`▪︎ ${l.ar}`);
        out.push(l.per === 'day'
          ? `   العدد: ${fmt(l.qty)} ${l.unitAr}`
          : `   العدد: ${fmt(l.qty)} ${l.unitAr}`);
      });
    } else {
      out.push('▪︎ لا توجد إضافات');
    }
    out.push('');

    // ---- 5. desserts ----
    out.push(HR);
    out.push('*٤ · الحلى*');
    out.push(HR);
    if (sweets.length) {
      DESSERT_GROUPS.forEach((g) => {
        const picked = sweets.filter((l) => l.group === g.id);
        if (!picked.length) return;
        out.push(`*${g.ar}*`);
        picked.forEach((l) => {
          out.push(`▪︎ ${l.ar} — ${fmt(l.qty)} ${l.unitAr}`);
        });
      });
    } else {
      out.push('▪︎ لا توجد حلى');
    }
    out.push('');

    // ---- 6. customer ----
    out.push(HR);
    out.push('*٥ · بيانات العميل*');
    out.push(HR);
    out.push(`▪︎ الاسم: ${state.name}`);
    out.push(`▪︎ الجوال: ${state.phone}`);
    out.push(`▪︎ نوع العميل: ${state.clientType === 'company' ? 'شركة' : 'أفراد'}`);
    if (state.clientType === 'company') {
      out.push(`▪︎ اسم الشركة: ${state.company}`);
      out.push(`▪︎ الرقم الضريبي: ${state.vat.trim() || 'لم يُذكر'}`);
    }
    out.push('');

    // ---- 7. notes ----
    if (state.notes.trim()) {
      out.push(HR);
      out.push('*٦ · ملاحظات العميل*');
      out.push(HR);
      out.push(state.notes.trim());
      out.push('');
    }

    out.push(HR);
    out.push('_سنتواصل معك هاتفياً لتحديد وقت التركيب وبقية التفاصيل وعرض السعر._');

    return out.join('\n');
  }

  function orderUrl() {
    return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(buildMessage())}`;
  }

  /** Shapes the current booking into the row the database expects. */
  function orderRow(t) {
    const sweets = t.lines.filter((l) => l.dessert);
    const addons = t.lines.filter((l) => !l.dessert);
    return {
      ref: currentRef,
      service: state.service,
      package_id: t.base.id,
      package_name: isCustom()
        ? `باقة مخصصة — ${t.base.cups} كوب`
        : (state.service === 'counter' ? `${t.base.cups} كوب` : t.base.ar),
      custom_cups: isCustom() ? Number(state.customCups) : null,
      custom_request: isCustom() ? state.customRequest.trim() : null,
      package_price: t.base.price,
      days: state.days,
      setup_date: state.date || null,
      setup_time: null,
      event_date: state.date || null,
      event_time: null,
      city: state.city,
      district: null,
      venue: null,
      lat: null,
      lng: null,
      client_type: state.clientType,
      customer_name: state.name,
      phone: state.phone,
      company: state.clientType === 'company' ? state.company : null,
      vat: state.clientType === 'company' ? state.vat : null,
      notes: state.notes,
      included_baristas: includedBaristas(),
      items: t.lines.map((l) => ({
        id: l.id, name: l.ar, kind: l.dessert ? 'dessert' : 'addon',
        unit: l.unitAr, qty: l.qty, price: l.price, total: l.total,
      })),
      desserts_total: round2(sweets.reduce((sum, l) => sum + l.total, 0)),
      addons_total: round2(addons.reduce((sum, l) => sum + l.total, 0)),
      total: t.grand,
    };
  }

  async function confirmOrder() {
    const problem = validate();
    if (problem) { $('#err').textContent = problem; return; }

    currentRef = orderRef();
    const t = totals();

    // Save first: if the customer never sends the WhatsApp message we still
    // have their details and can follow up.
    const button = $('#btn-send');
    button.disabled = true;
    button.textContent = 'جارٍ الحفظ…';
    await window.wekadSaveOrder?.(orderRow(t));
    button.disabled = false;
    button.textContent = 'تأكيد الطلب';
    track('purchase', {
      transaction_id: currentRef,
      currency: 'SAR',
      value: t.grand,
      service: state.service,
      days: state.days,
      client_type: state.clientType,
      city: state.city,
      items: [
        { item_id: t.base.id, item_name: state.service === 'counter' ? `${t.base.cups} كوب` : t.base.ar,
          item_category: state.service, price: t.base.price, quantity: state.days },
        ...t.lines.map((l) => ({
          item_id: l.id, item_name: l.ar,
          item_category: l.dessert ? 'dessert' : 'addon',
          price: l.price, quantity: l.qty,
        })),
      ],
    });

    const url = orderUrl();
    window.open(url, '_blank', 'noopener');

    $('#done-ref').textContent = currentRef;
    $('#done-link').href = url;
    $('#wizard-body').hidden = true;
    $('#done').hidden = false;
    if (window.wekadScrollTo) window.wekadScrollTo($('#book'));
    else $('#book').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- wiring ----------
  function wire() {
    $$('input[name="service"]').forEach((el) => el.addEventListener('change', () => {
      state.service = el.value;
      syncSizePane();
      renderTotal();
      track('select_service', { service: el.value });
    }));

    $('#opt-packages').addEventListener('change', (e) => {
      if (e.target.name === 'pkg') {
        state.packageId = e.target.value;
        syncCustomPanel();
        renderTotal();
        // قيمة "custom" ليست ضمن PACKAGES، فلا تتبّع لها بيانات باقة
        const pkg = PACKAGES.find((p) => p.id === e.target.value);
        if (pkg) {
          track('select_item', { item_id: pkg.id, item_name: `${pkg.cups} كوب`, price: pkg.price, item_category: 'package' });
        } else {
          track('select_item', { item_id: 'custom', item_name: 'باقة مخصصة', item_category: 'package' });
        }
      }
    });
    $('#opt-flasks').addEventListener('change', (e) => {
      if (e.target.name === 'flask') {
        state.flaskId = e.target.value;
        renderTotal();
        const f = FLASKS.find((x) => x.id === e.target.value);
        track('select_item', { item_id: f.id, item_name: f.ar, price: f.price, item_category: 'flask' });
      }
    });

    // quantity steppers for add-ons and desserts
    const onQty = (event) => {
      const row = event.target.closest('.qrow');
      if (!row) return;
      const item = ITEMS.find((i) => i.id === row.dataset.id);
      const input = $('input', row);
      const dir = event.target.dataset ? event.target.dataset.q : undefined;

      let value = parseInt(input.value, 10) || 0;
      if (dir === '+') value += item.step;
      else if (dir === '-') value -= item.step;

      value = Math.max(0, Math.min(item.max, value));
      const wasZero = (state.qty[item.id] || 0) === 0;
      input.value = value;
      state.qty[item.id] = value;
      renderTotal();

      if (wasZero && value > 0) {
        track('add_to_cart', {
          currency: 'SAR',
          value: item.price * value,
          item_id: item.id,
          item_name: item.ar,
          item_category: item.dessert ? 'dessert' : 'addon',
          quantity: value,
        });
      }
    };
    ['#qty-extras', '#qty-desserts'].forEach((sel) => {
      const host = $(sel);
      host.addEventListener('click', (e) => { if (e.target.dataset.q) onQty(e); });
      host.addEventListener('input', (e) => { if (e.target.tagName === 'INPUT') onQty(e); });
    });

    const bind = (sel, key) => $(sel).addEventListener('input', (e) => { state[key] = e.target.value; });
    bind('#f-custom-cups', 'customCups');
    bind('#f-custom-request', 'customRequest');
    bind('#f-name', 'name');
    bind('#f-phone', 'phone');
    bind('#f-company', 'company');
    bind('#f-vat', 'vat');
    bind('#f-notes', 'notes');
    $('#f-city').addEventListener('change', (e) => { state.city = e.target.value; });

    // التقويم
    $('#cal-prev').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(); });
    $('#cal-next').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(); });
    $('#cal-grid').addEventListener('click', (e) => {
      const cell = e.target.closest('button.cal-day');
      if (!cell || cell.disabled) return;
      state.date = cell.dataset.day;
      $('#err').textContent = '';
      renderCalendar();
      track('select_date', { day: state.date });
    });

    $$('input[name="client"]').forEach((el) => el.addEventListener('change', () => {
      state.clientType = el.value;
      $('#company-fields').hidden = el.value !== 'company';
    }));

    $('#btn-next').addEventListener('click', () => {
      const problem = validate();
      if (problem) {
        $('#err').textContent = problem;
        track('booking_error', { step_name: PANES[state.step], message: problem });
        return;
      }
      goto(state.step + 1);
    });
    $('#btn-back').addEventListener('click', () => goto(state.step - 1));
    $('#btn-send').addEventListener('click', confirmOrder);
    $('#btn-restart').addEventListener('click', () => {
      $('#done').hidden = true;
      $('#wizard-body').hidden = false;
      goto(0);
    });

    $$('.step').forEach((s, i) => s.addEventListener('click', () => {
      if (i < state.step) goto(i);
    }));
  }

  // ---------- chrome ----------
  function chrome() {
    const nav = $('#nav');
    const fab = $('#fab');
    const onScroll = () => {
      nav.classList.toggle('stuck', window.scrollY > 40);
      fab.classList.toggle('show', window.scrollY > 500);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const sheet = $('#sheet');
    $('#burger').addEventListener('click', () => sheet.classList.toggle('open'));
    $$('#sheet a').forEach((a) => a.addEventListener('click', () => sheet.classList.remove('open')));

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach((el) => io.observe(el));
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderStatic();
    renderCalendar();
    loadBlockedDays();
    wire();
    chrome();
    syncSizePane();
    goto(0, false);
    $('#year').textContent = new Date().getFullYear();
  });
})();
