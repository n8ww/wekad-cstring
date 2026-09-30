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
    { id: 'barista', ar: 'باريستا (امرأة)', en: 'Barista (Female)', price: 300, per: 'day',   step: 1,  max: 10,   unitAr: 'باريستا' },
    { id: 'print',   ar: 'طباعة أكواب',      en: 'Cup Print',        price: 5,   per: 'piece', step: 25, max: 3000, unitAr: 'كوب' },
  ];

  // ⚠ Placeholder prices per piece — replace with the real menu prices.
  const DESSERTS = [
    { id: 'd01', ar: 'معمول التمر',    en: 'Date Maamoul',     price: 6  },
    { id: 'd02', ar: 'معمول الفستق',   en: 'Pistachio Maamoul', price: 8  },
    { id: 'd03', ar: 'سان سباستيان',   en: 'San Sebastian',    price: 15 },
    { id: 'd04', ar: 'تشيز كيك',       en: 'Cheesecake',       price: 14 },
    { id: 'd05', ar: 'براونيز',        en: 'Brownies',         price: 10 },
    { id: 'd06', ar: 'كوكيز',          en: 'Cookies',          price: 7  },
    { id: 'd07', ar: 'كنافة',          en: 'Kunafa',           price: 12 },
    { id: 'd08', ar: 'بسبوسة',         en: 'Basbousa',         price: 8  },
    { id: 'd09', ar: 'لقيمات',         en: 'Luqaimat',         price: 6  },
    { id: 'd10', ar: 'عش البلبل',      en: 'Osh El Bulbul',    price: 9  },
    { id: 'd11', ar: 'ماكرون',         en: 'Macarons',         price: 9  },
    { id: 'd12', ar: 'ميني دونات',     en: 'Mini Donuts',      price: 7  },
    { id: 'd13', ar: 'تارت الفواكه',   en: 'Fruit Tart',       price: 13 },
  ];

  const DESSERT_STEP = 10;   // desserts are ordered in batches of ten

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

  const ITEMS = [...EXTRAS, ...DESSERTS.map((d) => ({ ...d, per: 'piece', step: DESSERT_STEP, max: 2000, unitAr: 'قطعة', dessert: true }))];

  const state = {
    step: 0,
    service: 'counter',
    packageId: 'p100',
    flaskId: 'f1',
    qty: Object.fromEntries(ITEMS.map((i) => [i.id, 0])),
    days: 1,
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

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const sarIcon = () => $('#sar-symbol').innerHTML;
  const fmt = (n) => n.toLocaleString('en-US');
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
        const total = item.per === 'day' ? item.price * qty * state.days : item.price * qty;
        return { ...item, qty, total };
      })
      .filter(Boolean);
  }

  function totals() {
    const base = chosenBase();
    const baseTotal = base ? base.price * state.days : 0;
    const lines = lineItems();
    const linesTotal = lines.reduce((sum, l) => sum + l.total, 0);
    return { base, baseTotal, lines, linesTotal, grand: baseTotal + linesTotal };
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
          <span class="qrow-price"><span class="num">${fmt(item.price)}</span>${sarIcon()}
            <span class="qrow-per">${perLabel}</span></span>
        </div>
        <div class="stepper stepper--sm">
          <button type="button" data-q="-" aria-label="إنقاص ${item.ar}">−</button>
          <input type="number" value="0" min="0" max="${item.max}" step="${item.step}" inputmode="numeric" aria-label="كمية ${item.ar}">
          <button type="button" data-q="+" aria-label="زيادة ${item.ar}">+</button>
        </div>
        <div class="qrow-total"><span class="num">0</span></div>
      </div>`;
  }

  function refreshQtyTotals() {
    $$('.qrow').forEach((row) => {
      const item = ITEMS.find((i) => i.id === row.dataset.id);
      const qty = state.qty[item.id] || 0;
      const total = item.per === 'day' ? item.price * qty * state.days : item.price * qty;
      row.classList.toggle('on', qty > 0);
      $('.qrow-total', row).innerHTML = qty
        ? `<span class="num">${fmt(total)}</span>${sarIcon()}`
        : '<span class="num" style="opacity:.3">—</span>';
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
        <div class="pkg-rule"></div>
        <div class="pkg-label">السعر<span class="en">Price</span></div>
        <div class="pkg-price"><span class="amount num">${fmt(p.price)}</span>${sarIcon()}</div>
      </article>`).join('');

    $('#flask-rows').innerHTML = FLASKS.map((f) => `
      <div class="row reveal">
        <div>
          <div class="row-name">${f.ar}<span class="en">${f.en}</span></div>
          <div class="row-note">تكفي من ${f.cupsFrom} إلى ${f.cupsTo} كوب · سعة ٦ لتر</div>
        </div>
        <div class="row-price"><span class="num">${fmt(f.price)}</span>${sarIcon()}</div>
      </div>`).join('');

    $('#extra-rows').innerHTML = EXTRAS.map((e) => `
      <div class="row reveal">
        <div>
          <div class="row-name">${e.ar}<span class="en">${e.en}</span></div>
          <div class="row-note">${e.per === 'day' ? 'لكل باريستا في اليوم' : 'لكل كوب'}</div>
        </div>
        <div class="row-price"><span class="num">${fmt(e.price)}</span>${sarIcon()}</div>
      </div>`).join('');

    // dessert menu on the landing page
    $('#dessert-grid').innerHTML = DESSERTS.map((d, i) => `
      <article class="sweet reveal" style="--d:${i * 40}ms">
        <span class="sweet-name">${d.ar}<span class="en">${d.en}</span></span>
        <span class="sweet-price"><span class="num">${fmt(d.price)}</span>${sarIcon()}</span>
      </article>`).join('');

    // wizard options
    $('#opt-packages').innerHTML = PACKAGES.map((p) => `
      <label class="opt">
        <input type="radio" name="pkg" value="${p.id}" ${p.id === state.packageId ? 'checked' : ''}>
        <span class="opt-check"></span>
        <span class="opt-big num">${p.cups}</span>
        <span class="opt-meta">كوب / cups</span>
        <span class="opt-price"><span class="num">${fmt(p.price)}</span>${sarIcon()}</span>
      </label>`).join('');

    $('#opt-flasks').innerHTML = FLASKS.map((f) => `
      <label class="opt">
        <input type="radio" name="flask" value="${f.id}" ${f.id === state.flaskId ? 'checked' : ''}>
        <span class="opt-check"></span>
        <span class="opt-big num">${f.count}</span>
        <span class="opt-name">${f.ar}<span class="en">${f.en}</span></span>
        <span class="opt-meta">${f.cupsFrom}–${f.cupsTo} كوب</span>
        <span class="opt-price"><span class="num">${fmt(f.price)}</span>${sarIcon()}</span>
      </label>`).join('');

    $('#qty-extras').innerHTML = EXTRAS.map(qtyRow).join('');
    $('#qty-desserts').innerHTML = ITEMS.filter((i) => i.dessert).map(qtyRow).join('');

    $('#f-city').innerHTML = CITIES.map((c) =>
      `<option ${c === state.city ? 'selected' : ''}>${c}</option>`).join('');

    $('#f-date').min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
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
      [state.service === 'counter' ? 'الباقة' : 'الحافظات', sizeText],
      ['عدد الأيام', String(state.days)],
      ['التاريخ', state.date || '—'],
      ['الوقت', state.time || '—'],
      ['المدينة', state.city],
      ['الحي', state.district || '—'],
      ['وصف الموقع', state.venue || '—'],
      ...(link ? [['الموقع على الخريطة', 'تم تحديده على الخريطة ✓']] : []),
      ...t.lines.map((l) => [l.ar, `${fmt(l.qty)} ${l.unitAr} × ${fmt(l.price)} = ${fmt(l.total)}`]),
      ['نوع العميل', state.clientType === 'company' ? 'شركة' : 'أفراد'],
      ...(state.clientType === 'company'
        ? [['اسم الشركة', state.company || '—'], ['الرقم الضريبي', state.vat || '—']]
        : []),
      ['الاسم', state.name || '—'],
      ['الجوال', state.phone || '—'],
      ...(state.notes ? [['ملاحظات', state.notes]] : []),
    ];

    $('#review').innerHTML =
      rows.map(([k, v]) => `<div class="review-row"><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('') +
      `<div class="review-row review-row--sum"><dt>الإجمالي التقديري</dt>
         <dd><span class="num">${fmt(t.grand)}</span>${sarIcon()}</dd></div>`;
  }

  function renderTotal() {
    $('#total-value').innerHTML = `<span class="num">${fmt(totals().grand)}</span>${sarIcon()}`;
    refreshQtyTotals();
  }

  // ---------- steps ----------
  const PANES = ['service', 'size', 'items', 'when', 'client', 'review'];

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
      if (!state.date) return 'اختر تاريخ المناسبة.';
      if (!state.time) return 'اختر وقت الحضور.';
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
    out.push(`▪︎ السعر: ${fmt(t.base.price)} × ${state.days} = *${fmt(t.baseTotal)} ر.س*`);
    out.push('');

    // ---- 2. when ----
    out.push(HR);
    out.push('*٢ · الموعد*');
    out.push(HR);
    out.push(`▪︎ اليوم: ${arabicDay(state.date)}`);
    out.push(`▪︎ التاريخ: ${prettyDate(state.date)}  (${state.date})`);
    out.push(`▪︎ وقت الحضور: ${time12(state.time)}`);
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
    if (addons.length) {
      addons.forEach((l) => {
        out.push(`▪︎ ${l.ar}`);
        out.push(l.per === 'day'
          ? `   العدد: ${fmt(l.qty)} ${l.unitAr} × ${state.days} ${state.days === 1 ? 'يوم' : 'أيام'}`
          : `   العدد: ${fmt(l.qty)} ${l.unitAr}`);
        out.push(`   السعر: ${fmt(l.total)} ر.س`);
      });
      out.push(`▪︎ *مجموع الإضافات: ${fmt(addonsTotal)} ر.س*`);
    } else {
      out.push('▪︎ لا توجد إضافات');
    }
    out.push('');

    // ---- 5. desserts ----
    out.push(HR);
    out.push('*٥ · الحلى*');
    out.push(HR);
    if (sweets.length) {
      sweets.forEach((l) => {
        out.push(`▪︎ ${l.ar} — ${fmt(l.qty)} قطعة × ${fmt(l.price)} = ${fmt(l.total)} ر.س`);
      });
      out.push(`▪︎ *مجموع الحلى: ${fmt(sweetsTotal)} ر.س*`);
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

    // ---- summary ----
    out.push(HR);
    out.push('*الملخّص المالي*');
    out.push(HR);
    out.push(`▪︎ ${state.service === 'counter' ? 'الباقة' : 'الحافظات'}: ${fmt(t.baseTotal)} ر.س`);
    out.push(`▪︎ الإضافات: ${fmt(addonsTotal)} ر.س`);
    out.push(`▪︎ الحلى: ${fmt(sweetsTotal)} ر.س`);
    out.push('');
    out.push(`*الإجمالي التقديري: ${fmt(t.grand)} ر.س*`);
    out.push('_غير شامل ضريبة القيمة المضافة_');

    return out.join('\n');
  }

  function orderUrl() {
    return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(buildMessage())}`;
  }

  function confirmOrder() {
    const problem = validate();
    if (problem) { $('#err').textContent = problem; return; }

    currentRef = orderRef();
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
    }));

    $('#opt-packages').addEventListener('change', (e) => {
      if (e.target.name === 'pkg') { state.packageId = e.target.value; renderTotal(); }
    });
    $('#opt-flasks').addEventListener('change', (e) => {
      if (e.target.name === 'flask') { state.flaskId = e.target.value; renderTotal(); }
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
      input.value = value;
      state.qty[item.id] = value;
      renderTotal();
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

    $('#btn-locate').addEventListener('click', locateMe);

    $$('input[name="client"]').forEach((el) => el.addEventListener('change', () => {
      state.clientType = el.value;
      $('#company-fields').hidden = el.value !== 'company';
    }));

    $('#btn-next').addEventListener('click', () => {
      const problem = validate();
      if (problem) { $('#err').textContent = problem; return; }
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
    wire();
    chrome();
    syncSizePane();
    goto(0, false);
    $('#year').textContent = new Date().getFullYear();
  });
})();
