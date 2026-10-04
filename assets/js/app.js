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
  const CITIES = [
    'الدمام', 'الخبر', 'الظهران', 'القطيف', 'سيهات', 'صفوى', 'تاروت',
    'الجبيل', 'رأس تنورة', 'بقيق', 'الأحساء — الهفوف', 'الأحساء — المبرز',
    'النعيرية', 'الخفجي', 'حفر الباطن', 'قرية العليا',
  ];

  const MAP_CENTER = [26.4207, 50.0888];   // Dammam / Khobar
  const MAP_ZOOM = 11;

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
    flaskId: 'f1',
    qty: Object.fromEntries(ITEMS.map((i) => [i.id, 0])),
    days: 1,
    setupDate: '',
    setupTime: '16:00',
    date: '',
    time: '19:00',
    city: CITIES[0],
    district: '',
    venue: '',
    lat: null,
    lng: null,
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
      renderBlockedHint();
    } catch { /* الموقع يعمل بدونها */ }
  }

  function renderBlockedHint() {
    const box = $('#blocked-note');
    if (!box) return;
    const days = [...blockedDays.keys()].sort().slice(0, 12);
    if (!days.length) { box.hidden = true; return; }
    box.innerHTML = `<b>أيام غير متاحة:</b> ${days.join(' · ')}`
      + (blockedDays.size > days.length ? ` وأكثر` : '');
    box.hidden = false;
  }

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const sarIcon = () => $('#sar-symbol').innerHTML;
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  // Cake prices have decimals, package prices do not — show only what is there.
  const fmt = (n) => round2(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- pricing ----------
  function chosenBase() {
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

  function mapsLink() {
    if (state.lat == null || state.lng == null) return '';
    return `https://maps.google.com/?q=${state.lat.toFixed(6)},${state.lng.toFixed(6)}`;
  }

  // ---------- quantity rows ----------
  function qtyRow(item) {
    const perLabel = item.per === 'day' ? '/ لليوم' : `/ لل${item.unitAr}`;
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
      const qty = state.qty[item.id] || 0;
      const total = round2(item.per === 'day' ? item.price * qty * state.days : item.price * qty);
      row.classList.toggle('on', qty > 0);
    });
  }

  // ---------- static rendering ----------
  function renderStatic() {
    $('#chips').innerHTML = DRINKS.map((d) => `<span class="chip">${d}</span>`).join('');

    $('#pkg-grid').innerHTML = PACKAGES.map((p, i) => `
      <article class="pkg reveal" style="--d:${i * 70}ms">
        <div class="pkg-label">عــدد الأكـواب<span class="en">Total of cups</span></div>
        <div class="pkg-cups num">${p.cups}</div>
        <div class="pkg-cups-unit">كوب</div>

      </article>`).join('');

    $('#flask-rows').innerHTML = FLASKS.map((f) => `
      <div class="row reveal">
        <div>
          <div class="row-name">${f.ar}<span class="en">${f.en}</span></div>
          <div class="row-note">تكفي من ${f.cupsFrom} إلى ${f.cupsTo} كوب · سعة ٦ لتر</div>
        </div>

      </div>`).join('');

    $('#extra-rows').innerHTML = EXTRAS.map((e) => `
      <div class="row reveal">
        <div>
          <div class="row-name">${e.ar}<span class="en">${e.en}</span></div>
          <div class="row-note">${e.per === 'day' ? 'لكل باريستا في اليوم' : 'لكل كوب'}</div>
        </div>

      </div>`).join('');

    // dessert menu on the landing page, one block per group
    $('#dessert-grid').innerHTML = DESSERT_GROUPS.map((g) => `
      <section class="sweet-group reveal">
        <header class="sweet-group-head">
          <h3>${g.ar}<span class="en">${g.en}</span></h3>
          <span class="sweet-group-note">${g.note}</span>
        </header>
        <div class="sweets">
          ${g.items.map((d) => `
            <article class="sweet">
              <span class="sweet-name">${d.ar}<span class="en">${d.en}</span></span>

            </article>`).join('')}
        </div>
      </section>`).join('');

    // wizard options
    $('#opt-packages').innerHTML = PACKAGES.map((p) => `
      <label class="opt">
        <input type="radio" name="pkg" value="${p.id}" ${p.id === state.packageId ? 'checked' : ''}>
        <span class="opt-check"></span>
        <span class="opt-big num">${p.cups}</span>
        <span class="opt-meta">كوب / cups</span>

      </label>`).join('');

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

    // لا تُقبل التواريخ الماضية؛ أقرب موعد هو الغد
    const earliest = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    $('#f-date').min = earliest;
    $('#f-setup-date').min = earliest;
  }

  function syncSizePane() {
    const counter = state.service === 'counter';
    $('#size-counter').hidden = !counter;
    $('#size-flask').hidden = counter;
    $('#size-title-ar').textContent = counter ? 'عدد الأكواب' : 'عدد الحافظات';
    $('#size-title-en').textContent = counter ? 'Total of cups' : 'Number of flasks';
  }

  function renderReview() {
    const t = totals();
    const sizeText = state.service === 'counter'
      ? `${t.base.cups} كوب`
      : `${t.base.ar} (${t.base.cupsFrom}–${t.base.cupsTo} كوب)`;

    const link = mapsLink();
    const rows = [
      ['الخدمة', SERVICES[state.service].ar],
      ['باريستا مشمولة مجاناً', `${includedBaristas()}`],
      [state.service === 'counter' ? 'الباقة' : 'الحافظات', sizeText],
      ['عدد الأيام', String(state.days)],
      ['تاريخ التركيب', state.setupDate || '—'],
      ['وقت التركيب', state.setupTime || '—'],
      ['تاريخ بدء العمل', state.date || '—'],
      ['وقت بدء العمل', state.time || '—'],
      ['المدينة', state.city],
      ['الحي', state.district || '—'],
      ['وصف الموقع', state.venue || '—'],
      ...(link ? [['الموقع على الخريطة', 'تم تحديده على الخريطة ✓']] : []),
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
    const n = includedBaristas();
    const box = $('#included-note');
    if (!box) return;
    box.innerHTML = `
      <span class="inc-badge">مشمول مجاناً</span>
      <span class="inc-text">
        <strong class="num">${n}</strong> ${n === 1 ? 'باريستا' : 'باريستا'} مع طلبك بدون أي رسوم.
        ${n === 1
          ? `<em>تصير ٢ تلقائياً مع باقة ${BARISTA_RULE.bonusFromCups} كوب فأكثر وطلب حلى كبير.</em>`
          : '<em>ترقّت إلى باريستين لأن الباقة كبيرة وطلب الحلى كبير.</em>'}
      </span>`;
  }

  function renderTotal() {
    refreshQtyTotals();
    renderIncluded();
  }

  // ---------- steps ----------
  const PANES = ['service', 'size', 'items', 'when', 'client', 'review'];

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

    if (state.step === 1) syncSizePane();
    if (PANES[state.step] === 'when') initMap();

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
      const top = $('#book').getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  function validate() {
    if (PANES[state.step] === 'when') {
      const today = new Date().toISOString().slice(0, 10);
      if (!state.setupDate) return 'اختر تاريخ التركيب.';
      if (!state.setupTime) return 'اختر وقت التركيب.';
      if (state.setupDate <= today) return 'تاريخ التركيب لازم يكون بعد اليوم.';
      if (!state.date) return 'اختر تاريخ بدء العمل.';
      if (!state.time) return 'اختر وقت بدء العمل.';
      if (state.date < state.setupDate) return 'تاريخ بدء العمل لا يسبق تاريخ التركيب.';
      if (state.date === state.setupDate && state.time < state.setupTime) {
        return 'وقت بدء العمل لازم يكون بعد وقت التركيب.';
      }
      for (const [label, day] of [['التركيب', state.setupDate], ['بدء العمل', state.date]]) {
        if (blockedDays.has(day)) {
          const why = blockedDays.get(day);
          return `يوم ${label} (${day}) غير متاح${why ? ` — ${why}` : ''}. اختر يوماً آخر.`;
        }
      }
      if (!state.district.trim()) return 'اكتب اسم الحي.';
      if (state.lat == null) return 'حدّد موقع المناسبة على الخريطة.';
      if (state.days < 1) return 'عدد الأيام يجب أن يكون يوماً واحداً على الأقل.';
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

  // ---------- map ----------
  let map = null;
  let marker = null;

  function setPoint(lat, lng, recentre = false) {
    state.lat = lat;
    state.lng = lng;
    if (marker) marker.setLatLng([lat, lng]);
    if (recentre && map) map.setView([lat, lng], Math.max(map.getZoom(), 15));
    track('set_location', { city: state.city });
    $('#map-readout').innerHTML =
      `<span class="ok">✓ تم تحديد الموقع</span> <a href="${mapsLink()}" target="_blank" rel="noopener">فتح في خرائط Google</a>`;
  }

  function initMap() {
    if (map || typeof L === 'undefined') {
      if (typeof L === 'undefined') $('#map-fallback').hidden = false;
      return;
    }
    map = L.map('map', { scrollWheelZoom: false }).setView(MAP_CENTER, MAP_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    marker = L.marker(MAP_CENTER, { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng();
      setPoint(lat, lng);
    });
    map.on('click', (e) => setPoint(e.latlng.lat, e.latlng.lng));

    // Leaflet measures the container on creation; it is hidden until this step.
    setTimeout(() => map.invalidateSize(), 60);
  }

  function locateMe() {
    if (!navigator.geolocation) {
      $('#map-readout').textContent = 'المتصفح لا يدعم تحديد الموقع.';
      return;
    }
    $('#map-readout').textContent = 'جارٍ تحديد موقعك…';
    navigator.geolocation.getCurrentPosition(
      (pos) => setPoint(pos.coords.latitude, pos.coords.longitude, true),
      () => { $('#map-readout').textContent = 'تعذّر تحديد الموقع — حرّك الدبوس على الخريطة يدوياً.'; },
      { enableHighAccuracy: true, timeout: 10000 },
    );
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

  function time12(hhmm) {
    const [h, m] = (hhmm || '').split(':').map(Number);
    if (Number.isNaN(h)) return hhmm;
    const period = h < 12 ? 'صباحاً' : 'مساءً';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
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
    if (state.service === 'counter') {
      out.push(`▪︎ الباقة: ${t.base.cups} كوب`);
    } else {
      out.push(`▪︎ الحافظات: ${t.base.ar}`);
      out.push(`▪︎ تكفي: ${t.base.cupsFrom}–${t.base.cupsTo} كوب`);
    }
    out.push(`▪︎ عدد الأيام: ${state.days} ${state.days === 1 ? 'يوم' : 'أيام'}`);
    out.push('');

    // ---- 2. when ----
    out.push(HR);
    out.push('*٢ · الموعد*');
    out.push(HR);
    out.push('*التركيب*');
    out.push(`▪︎ اليوم: ${arabicDay(state.setupDate)}`);
    out.push(`▪︎ التاريخ: ${prettyDate(state.setupDate)}  (${state.setupDate})`);
    out.push(`▪︎ الوقت: ${time12(state.setupTime)}`);
    out.push('');
    out.push('*بدء العمل*');
    out.push(`▪︎ اليوم: ${arabicDay(state.date)}`);
    out.push(`▪︎ التاريخ: ${prettyDate(state.date)}  (${state.date})`);
    out.push(`▪︎ الوقت: ${time12(state.time)}`);
    out.push('');

    // ---- 3. where ----
    out.push(HR);
    out.push('*٣ · الموقع*');
    out.push(HR);
    out.push(`▪︎ المدينة: ${state.city}`);
    out.push(`▪︎ الحي: ${state.district}`);
    if (state.venue.trim()) out.push(`▪︎ الوصف: ${state.venue}`);
    const link = mapsLink();
    if (link) {
      out.push('▪︎ الموقع على الخريطة:');
      out.push(link);
    }
    out.push('');

    // ---- 4. add-ons ----
    out.push(HR);
    out.push('*٤ · الإضافات*');
    out.push(HR);
    out.push(`▪︎ باريستا مشمولة مجاناً: ${includedBaristas()}`);
    if (addons.length) {
      addons.forEach((l) => {
        out.push(`▪︎ ${l.ar}`);
        out.push(l.per === 'day'
          ? `   العدد: ${fmt(l.qty)} ${l.unitAr} × ${state.days} ${state.days === 1 ? 'يوم' : 'أيام'}`
          : `   العدد: ${fmt(l.qty)} ${l.unitAr}`);
      });
    } else {
      out.push('▪︎ لا توجد إضافات');
    }
    out.push('');

    // ---- 5. desserts ----
    out.push(HR);
    out.push('*٥ · الحلى*');
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
    out.push('*٦ · بيانات العميل*');
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
      out.push('*٧ · ملاحظات العميل*');
      out.push(HR);
      out.push(state.notes.trim());
      out.push('');
    }

    out.push(HR);
    out.push('_سنتواصل معك لتأكيد التفاصيل وعرض السعر._');

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
      package_name: state.service === 'counter' ? `${t.base.cups} كوب` : t.base.ar,
      package_price: t.base.price,
      days: state.days,
      setup_date: state.setupDate || null,
      setup_time: state.setupTime,
      event_date: state.date || null,
      event_time: state.time,
      city: state.city,
      district: state.district,
      venue: state.venue,
      lat: state.lat,
      lng: state.lng,
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
    $('#book').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        renderTotal();
        const pkg = PACKAGES.find((p) => p.id === e.target.value);
        track('select_item', { item_id: pkg.id, item_name: `${pkg.cups} كوب`, price: pkg.price, item_category: 'package' });
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

    // days
    const days = $('#f-days');
    const setDays = (v) => {
      state.days = Math.max(1, Math.min(30, v || 1));
      days.value = state.days;
      renderTotal();
    };
    $('#days-minus').addEventListener('click', () => setDays(state.days - 1));
    $('#days-plus').addEventListener('click', () => setDays(state.days + 1));
    days.addEventListener('input', () => setDays(parseInt(days.value, 10)));

    const bind = (sel, key) => $(sel).addEventListener('input', (e) => { state[key] = e.target.value; });
    bind('#f-setup-date', 'setupDate');
    bind('#f-setup-time', 'setupTime');
    bind('#f-date', 'date');
    bind('#f-time', 'time');
    bind('#f-district', 'district');
    bind('#f-venue', 'venue');
    bind('#f-name', 'name');
    bind('#f-phone', 'phone');
    bind('#f-company', 'company');
    bind('#f-vat', 'vat');
    bind('#f-notes', 'notes');
    $('#f-city').addEventListener('change', (e) => { state.city = e.target.value; });

    // رفض الأيام المقفلة فور اختيارها، بدل تركها حتى الإرسال
    const guardBlocked = (input, key) => input.addEventListener('change', () => {
      const day = input.value;
      if (!day || !blockedDays.has(day)) return;
      const why = blockedDays.get(day);
      $('#err').textContent = `يوم ${day} غير متاح${why ? ` (${why})` : ''} — اختر يوماً آخر.`;
      input.value = '';
      state[key] = '';
      input.focus();
    });
    guardBlocked($('#f-setup-date'), 'setupDate');
    guardBlocked($('#f-date'), 'date');

    // اختيار يوم التركيب يقترح نفس اليوم لبدء العمل، ويمنع اختيار يوم أسبق منه
    $('#f-setup-date').addEventListener('change', () => {
      const serviceInput = $('#f-date');
      serviceInput.min = state.setupDate || serviceInput.min;
      if (!state.date || state.date < state.setupDate) {
        serviceInput.value = state.setupDate;
        state.date = state.setupDate;
      }
    });

    $('#btn-locate').addEventListener('click', locateMe);

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
    loadBlockedDays();
    wire();
    chrome();
    syncSizePane();
    goto(0, false);
    $('#year').textContent = new Date().getFullYear();
  });
})();
