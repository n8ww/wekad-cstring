/* ==========================================================================
   وِكاد — لوحة الطلبات
   تسجيل الدخول وقراءة الطلبات يتمّان مباشرة مع Supabase؛ قواعد الصلاحيات
   في قاعدة البيانات هي ما يمنع أي زائر من رؤية بيانات العملاء.
   ========================================================================== */
(() => {
  'use strict';

  const cfg = window.WEKAD_CONFIG || {};
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const STATUSES = {
    new:       'جديد',
    contacted: 'تواصلنا',
    confirmed: 'مؤكّد',
    done:      'منجز',
    cancelled: 'ملغي',
  };

  let session = null;
  let orders = [];

  // ---------- helpers ----------
  const money = (n) =>
    Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

  const dateOnly = (iso) => (iso ? String(iso).slice(0, 10) : '—');

  function dateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(d);
  }

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(path, options = {}) {
    const response = await fetch(`${cfg.SUPABASE_URL}${path}`, {
      ...options,
      headers: {
        apikey: cfg.SUPABASE_KEY,
        Authorization: `Bearer ${session?.access_token ?? cfg.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    return response;
  }

  // ---------- auth ----------
  const STORE_KEY = 'wekad_session';

  function saveSession(data) {
    session = data;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) session = JSON.parse(raw);
    } catch { /* ignore */ }
  }

  function clearSession() {
    session = null;
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  }

  async function signIn(email, password) {
    const response = await fetch(
      `${cfg.SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: { apikey: cfg.SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error_description || data.msg || 'تعذّر تسجيل الدخول');
    return data;
  }

  // ---------- data ----------
  async function fetchOrders() {
    const response = await api('/rest/v1/orders?select=*&order=created_at.desc&limit=1000');
    if (response.status === 401) { clearSession(); showLogin('انتهت الجلسة، سجّل دخولك مرة ثانية.'); return []; }
    if (!response.ok) throw new Error('تعذّر تحميل الطلبات');
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

  // ---------- stats ----------
  function computeStats(rows) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const won = rows.filter((r) => ['confirmed', 'done'].includes(r.status));

    const thisMonth = rows.filter((r) => new Date(r.created_at) >= monthStart);
    const revenue = won.reduce((sum, r) => sum + Number(r.total || 0), 0);

    return {
      total: rows.length,
      newCount: rows.filter((r) => r.status === 'new').length,
      thisMonth: thisMonth.length,
      revenue,
      avg: won.length ? revenue / won.length : 0,
      wonCount: won.length,
      conversion: rows.length ? Math.round((won.length / rows.length) * 100) : 0,
    };
  }

  function topList(rows, pick) {
    const counts = new Map();
    rows.forEach((row) => pick(row).forEach(({ key, qty }) => {
      counts.set(key, (counts.get(key) || 0) + qty);
    }));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }

  function lastDays(rows, days = 14) {
    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets.push({ date: d, count: 0 });
    }
    rows.forEach((row) => {
      const created = new Date(row.created_at);
      created.setHours(0, 0, 0, 0);
      const hit = buckets.find((b) => b.date.getTime() === created.getTime());
      if (hit) hit.count += 1;
    });
    return buckets;
  }

  // ---------- rendering ----------
  function renderStats(rows) {
    const s = computeStats(rows);
    $('#stats').innerHTML = [
      { label: 'إجمالي الطلبات', value: s.total, sub: `${s.thisMonth} هذا الشهر` },
      { label: 'طلبات جديدة', value: s.newCount, sub: 'تحتاج تواصل' },
      { label: 'إيرادات مؤكّدة', value: money(s.revenue), sub: 'ر.س' },
      { label: 'متوسط الطلب', value: money(Math.round(s.avg)), sub: `${s.wonCount} طلب مؤكّد` },
      { label: 'نسبة التحويل', value: `${s.conversion}%`, sub: 'من الطلبات للمؤكّد' },
    ].map((c) => `
      <div class="stat">
        <div class="label">${c.label}</div>
        <div class="value num">${esc(c.value)}</div>
        <div class="sub">${esc(c.sub)}</div>
      </div>`).join('');
  }

  function renderBars(el, entries, unit) {
    if (!entries.length) { el.innerHTML = '<p class="empty">لا توجد بيانات بعد</p>'; return; }
    const max = entries[0][1] || 1;
    el.innerHTML = entries.map(([name, qty]) => `
      <div class="bar-row">
        <span class="name">${esc(name)}</span>
        <span class="qty num">${qty} ${unit}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(qty / max) * 100}%"></span></span>
      </div>`).join('');
  }

  function renderSpark(rows) {
    const buckets = lastDays(rows, 14);
    const max = Math.max(1, ...buckets.map((b) => b.count));
    $('#spark').innerHTML = buckets.map((b) => `
      <div class="spark-col" title="${b.date.toISOString().slice(0, 10)} — ${b.count} طلب">
        <span class="spark-bar" style="height:${(b.count / max) * 88}px"></span>
        <span class="spark-lbl">${b.date.getDate()}</span>
      </div>`).join('');
  }

  function renderTable(rows) {
    if (!rows.length) {
      $('#table-body').innerHTML = '<tr><td colspan="8"><p class="empty">لا توجد طلبات مطابقة</p></td></tr>';
      return;
    }

    $('#table-body').innerHTML = rows.map((r) => {
      const items = Array.isArray(r.items) ? r.items : [];
      const maps = r.lat && r.lng ? `https://maps.google.com/?q=${r.lat},${r.lng}` : '';
      return `
      <tr class="row-main" data-id="${r.id}">
        <td><span class="ref">${esc(r.ref)}</span><div class="muted">${dateTime(r.created_at)}</div></td>
        <td>${esc(r.customer_name || '—')}
            <div class="muted">${r.client_type === 'company' ? esc(r.company || 'شركة') : 'أفراد'}</div></td>
        <td><a href="tel:${esc(r.phone)}" dir="ltr">${esc(r.phone || '—')}</a></td>
        <td>${esc(r.package_name || '—')}<div class="muted">${esc(r.days)} يوم</div></td>
        <td>${dateOnly(r.event_date)}<div class="muted">${esc(r.event_time || '')}</div></td>
        <td>${esc(r.city || '—')}<div class="muted">${esc(r.district || '')}
            ${maps ? `· <a href="${maps}" target="_blank" rel="noopener">خريطة</a>` : ''}</div></td>
        <td class="num">${money(r.total)}</td>
        <td>
          <select class="status-select" data-id="${r.id}">
            ${Object.entries(STATUSES).map(([k, v]) =>
              `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <div style="margin-block-start:.4rem">
            <button class="detail-toggle" data-toggle="${r.id}">التفاصيل ▾</button>
          </div>
        </td>
      </tr>
      <tr class="row-detail" data-detail="${r.id}" hidden>
        <td colspan="8">
          <dl class="detail-grid">
            <div><dt>الموقع</dt><dd>${esc(r.venue || '—')}</dd></div>
            <div><dt>باريستا مشمولة</dt><dd class="num">${esc(r.included_baristas)}</dd></div>
            <div><dt>الإضافات</dt><dd class="num">${money(r.addons_total)} ر.س</dd></div>
            <div><dt>الحلى</dt><dd class="num">${money(r.desserts_total)} ر.س</dd></div>
            ${r.vat ? `<div><dt>الرقم الضريبي</dt><dd class="num">${esc(r.vat)}</dd></div>` : ''}
            ${r.notes ? `<div style="grid-column:1/-1"><dt>ملاحظات</dt><dd>${esc(r.notes)}</dd></div>` : ''}
          </dl>
          ${items.length ? `<ul class="items-list">${items.map((i) => `
            <li><span>${esc(i.name)} — ${esc(i.qty)} ${esc(i.unit)}</span>
                <span class="num">${money(i.total)} ر.س</span></li>`).join('')}</ul>` : ''}
        </td>
      </tr>`;
    }).join('');
  }

  // ---------- filtering ----------
  function applyFilters() {
    const q = $('#q').value.trim().toLowerCase();
    const status = $('#filter-status').value;

    const filtered = orders.filter((r) => {
      if (status && r.status !== status) return false;
      if (!q) return true;
      return [r.ref, r.customer_name, r.phone, r.company, r.city, r.district]
        .some((v) => String(v ?? '').toLowerCase().includes(q));
    });

    $('#count').textContent = `${filtered.length} من ${orders.length}`;
    renderTable(filtered);
  }

  function renderAll() {
    renderStats(orders);
    renderSpark(orders);
    renderBars($('#top-packages'),
      topList(orders, (r) => (r.package_name ? [{ key: r.package_name, qty: 1 }] : [])), 'طلب');
    renderBars($('#top-desserts'),
      topList(orders, (r) => (Array.isArray(r.items) ? r.items : [])
        .filter((i) => i.kind === 'dessert')
        .map((i) => ({ key: i.name, qty: i.qty }))), '');
    renderBars($('#top-cities'),
      topList(orders, (r) => (r.city ? [{ key: r.city, qty: 1 }] : [])), 'طلب');
    applyFilters();
  }

  // ---------- screens ----------
  function showLogin(message) {
    $('#login').hidden = false;
    $('#dash').hidden = true;
    $('#login-err').textContent = message || '';
    $('#login-err').hidden = !message;
  }

  async function showDashboard() {
    $('#login').hidden = true;
    $('#dash').hidden = false;
    $('#who').textContent = session?.user?.email ?? '';
    try {
      orders = await fetchOrders();
      renderAll();
    } catch (error) {
      console.error(error);
      $('#table-body').innerHTML =
        '<tr><td colspan="8"><p class="empty">تعذّر تحميل الطلبات</p></td></tr>';
    }
  }

  // ---------- wiring ----------
  document.addEventListener('DOMContentLoaded', async () => {
    if (!cfg.SUPABASE_URL) { showLogin('لم تُضبط إعدادات قاعدة البيانات.'); return; }

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = $('#login-btn');
      button.disabled = true;
      button.textContent = 'جارٍ الدخول…';
      try {
        saveSession(await signIn($('#email').value.trim(), $('#password').value));
        await showDashboard();
      } catch (error) {
        showLogin(error.message);
      } finally {
        button.disabled = false;
        button.textContent = 'دخول';
      }
    });

    $('#logout').addEventListener('click', () => { clearSession(); showLogin(); });
    $('#refresh').addEventListener('click', showDashboard);
    $('#q').addEventListener('input', applyFilters);
    $('#filter-status').addEventListener('change', applyFilters);

    $('#table-body').addEventListener('change', async (e) => {
      if (!e.target.classList.contains('status-select')) return;
      const id = e.target.dataset.id;
      const ok = await updateStatus(id, e.target.value);
      if (ok) {
        const row = orders.find((r) => String(r.id) === String(id));
        if (row) row.status = e.target.value;
        renderStats(orders);
      } else {
        alert('تعذّر تحديث الحالة');
      }
    });

    $('#table-body').addEventListener('click', (e) => {
      const id = e.target.dataset?.toggle;
      if (!id) return;
      const row = $(`tr[data-detail="${id}"]`);
      row.hidden = !row.hidden;
      e.target.textContent = row.hidden ? 'التفاصيل ▾' : 'إخفاء ▴';
    });

    loadSession();
    if (session?.access_token) await showDashboard();
    else showLogin();
  });
})();
