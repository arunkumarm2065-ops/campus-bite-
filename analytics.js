/* ==========================================================================
   CampusBite Analytics Studio — analytics.js
   Sales report + financial analysis for Shop Owners and Admins, with Excel export.
   Load LAST (after role-access.js):  <script src="analytics.js"></script>
   - Owner  : "Sales & analytics" tab inside the owner portal (own shop only)
   - Admin  : "Sales & Analytics" button in the admin portal (all shops + shop filter)
   Reads the app's existing `orders` / `orderHistory` arrays, so it stays live with Firestore.
   Excel export uses SheetJS (loaded from cdnjs on first click). No other dependencies.
   ========================================================================== */
(function () {
  'use strict';
  if (window.CBAnalytics) return;

  /* ------------------------------ helpers ------------------------------ */
  const DAY = 86400000;
  const NF = new Intl.NumberFormat('en-IN');
  const trim = n => String(+(+n).toFixed(1));
  const money = n => '₹' + NF.format(Math.round(n || 0));
  const moneyShort = n => {
    n = n || 0; const a = Math.abs(n);
    if (a >= 1e5) return '₹' + trim(n / 1e5) + 'L';
    if (a >= 1e3) return '₹' + trim(n / 1e3) + 'k';
    return '₹' + trim(n);
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const eod = d => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fmtD = (d, o) => d.toLocaleDateString('en-IN', o || { day: 'numeric', month: 'short' });
  const fmtDY = d => fmtD(d, { day: 'numeric', month: 'short', year: 'numeric' });
  const hourLabel = h => (h % 12 || 12) + (h < 12 ? 'a' : 'p');
  const hourFull = h => (h % 12 || 12) + ' ' + (h < 12 ? 'AM' : 'PM');
  const role = () => (typeof currentRole === 'string' ? currentRole : '');

  /* ------------------------------ data layer ------------------------------ */
  function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    if (typeof v === 'number' || typeof v === 'string') { const d = new Date(v); return isNaN(d) ? null : d; }
    return null;
  }

  function parseItems(s) {
    if (typeof s !== 'string') return [];
    const m = (typeof menu !== 'undefined' && Array.isArray(menu)) ? menu : [];
    return s.split(' + ').map(p => {
      const x = p.match(/^(\d+)\s*[×x]\s*(.+)$/i);
      const name = x ? x[2].trim() : p.trim();
      const f = m.find(i => i.name === name);
      return { name, qty: x ? +x[1] : 1, price: f ? Number(f.price || 0) : 0 };
    });
  }

  function normalize(o) {
    const items = Array.isArray(o.itemDetails) && o.itemDetails.length
      ? o.itemDetails.map(i => ({ name: i.name || 'Item', qty: Number(i.quantity || i.qty || 1), price: Number(i.price || 0) }))
      : parseItems(o.items);
    const total = Number(o.total) || 0;
    const sum = items.reduce((a, i) => a + i.qty * i.price, 0);
    const status = String(o.status || 'Completed');
    const pickRaw = String(o.pickupType || '');
    return {
      raw: o,
      key: String(o.token || o.id || ''),
      token: o.token || '',
      date: toDate(o.createdAt),
      status,
      valid: !/cancel|refund/i.test(status),
      items,
      itemCount: items.reduce((a, i) => a + i.qty, 0),
      subtotal: Number(o.subtotal) || sum || total,
      parcel: Number(o.parcelFee) || 0,
      express: Number(o.expressFee) || 0,
      discount: Number(o.discount) || 0,
      coupon: o.couponCode || '',
      total,
      pay: String(o.paymentMethod || o.payment || 'Not recorded'),
      pick: /parcel|take/i.test(pickRaw) ? 'Parcel' : /dine/i.test(pickRaw) ? 'Dine-in' : (pickRaw || 'Not recorded'),
      shopId: String(o.shopId || 'main-canteen'),
      shopName: String(o.shopName || 'Main Canteen'),
      student: o.studentName || o.studentId || ''
    };
  }

  // Merge `orders` + `orderHistory` (de-duplicated), then limit to what this role may see.
  function scopedOrders() {
    const r = role();
    if (r !== 'owner' && r !== 'admin') return [];
    const map = new Map();
    const src = [].concat(
      typeof orders !== 'undefined' && Array.isArray(orders) ? orders : [],
      typeof orderHistory !== 'undefined' && Array.isArray(orderHistory) ? orderHistory : []
    );
    src.forEach((o, i) => {
      if (!o) return;
      const k = String(o.token || o.id || 'x' + i);
      if (!map.has(k)) map.set(k, o);
    });
    let list = Array.from(map.values());
    if (r === 'owner' && typeof isCurrentOwnersOrder === 'function') list = list.filter(isCurrentOwnersOrder);
    return list.map(normalize);
  }

  /* ------------------------------ aggregation ------------------------------ */
  function bucketsFor(from, to, forceGran) {
    const days = Math.round((sod(to) - sod(from)) / DAY) + 1;
    const gran = forceGran || (days <= 92 ? 'day' : days <= 400 ? 'week' : 'month');
    const out = [];
    if (gran === 'day') {
      for (let i = 0; i < days; i++) { const s = addDays(sod(from), i); out.push({ s, e: eod(s) }); }
    } else if (gran === 'week') {
      let s = sod(from); s = addDays(s, -((s.getDay() + 6) % 7));
      while (s <= to) { out.push({ s, e: eod(addDays(s, 6)) }); s = addDays(s, 7); }
    } else {
      let s = new Date(from.getFullYear(), from.getMonth(), 1);
      while (s <= to) {
        out.push({ s, e: eod(new Date(s.getFullYear(), s.getMonth() + 1, 0)) });
        s = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      }
    }
    return { gran, out };
  }

  function bucketIndex(d, b0, gran) {
    if (gran === 'month') return (d.getFullYear() - b0.s.getFullYear()) * 12 + d.getMonth() - b0.s.getMonth();
    const diff = Math.round((sod(d) - b0.s) / DAY);
    return gran === 'week' ? Math.floor(diff / 7) : diff;
  }

  function aggregate(list, from, to, gran, undatedOk) {
    const bk = bucketsFor(from, to, gran);
    const B = bk.out.map(b => ({ s: b.s, e: b.e, rev: 0, ord: 0, itm: 0 }));
    const A = {
      rev: 0, ord: 0, itm: 0, gross: 0, disc: 0, parcel: 0, express: 0, lost: 0, lostN: 0,
      items: new Map(), pay: new Map(), pick: new Map(), shops: new Map(), cust: new Map(), days: new Map(),
      hours: Array.from({ length: 24 }, () => ({ n: 0, rev: 0 })),
      dow: Array.from({ length: 7 }, () => ({ n: 0, rev: 0 })),
      B, gran: bk.gran
    };
    const bump = (m, k, rev) => { const v = m.get(k) || { n: 0, rev: 0 }; v.n++; v.rev += rev; m.set(k, v); };
    list.forEach(o => {
      const inR = o.date ? (o.date >= from && o.date <= to) : undatedOk;
      if (!inR) return;
      if (!o.valid) { A.lost += o.total; A.lostN++; return; }
      A.rev += o.total; A.ord++; A.itm += o.itemCount;
      A.gross += o.subtotal; A.disc += o.discount; A.parcel += o.parcel; A.express += o.express;
      o.items.forEach(i => {
        const v = A.items.get(i.name) || { qty: 0, rev: 0 };
        v.qty += i.qty; v.rev += i.qty * i.price; A.items.set(i.name, v);
      });
      bump(A.pay, o.pay, o.total); bump(A.pick, o.pick, o.total); bump(A.shops, o.shopName, o.total);
      const ck = String(o.student || '').trim();
      if (ck) A.cust.set(ck, (A.cust.get(ck) || 0) + 1);
      if (o.date) {
        const i = bucketIndex(o.date, B[0], bk.gran);
        if (B[i]) { B[i].rev += o.total; B[i].ord++; B[i].itm += o.itemCount; }
        A.hours[o.date.getHours()].n++; A.hours[o.date.getHours()].rev += o.total;
        A.dow[(o.date.getDay() + 6) % 7].n++; A.dow[(o.date.getDay() + 6) % 7].rev += o.total;
        const dk = ymd(o.date);
        const d = A.days.get(dk) || { ord: 0, itm: 0, gross: 0, disc: 0, parcel: 0, express: 0, rev: 0 };
        d.ord++; d.itm += o.itemCount; d.gross += o.subtotal; d.disc += o.discount;
        d.parcel += o.parcel; d.express += o.express; d.rev += o.total; A.days.set(dk, d);
      }
    });
    A.aov = A.ord ? A.rev / A.ord : 0;
    A.customers = A.cust.size;
    A.repeat = Array.from(A.cust.values()).filter(n => n > 1).length;
    return A;
  }

  const METRICS = {
    revenue: { label: 'Net revenue', fmt: money, short: moneyShort, get: b => b.rev },
    orders: { label: 'Orders', fmt: n => NF.format(n), short: n => trim(n), get: b => b.ord },
    items: { label: 'Items sold', fmt: n => NF.format(n), short: n => trim(n), get: b => b.itm },
    aov: { label: 'Avg. order value', fmt: money, short: moneyShort, get: b => (b.ord ? b.rev / b.ord : 0) }
  };

  function bounds(st, list) {
    const today = sod(new Date());
    let from, to = eod(today);
    if (st.range === 'all') {
      const ds = list.filter(o => o.date).map(o => +o.date);
      from = ds.length ? sod(new Date(Math.min.apply(null, ds))) : today;
    } else if (st.range === 'custom') {
      from = st.from ? sod(new Date(st.from + 'T00:00')) : today;
      to = st.to ? eod(new Date(st.to + 'T00:00')) : eod(today);
      if (from > to) { const t = from; from = sod(to); to = eod(t); }
    } else if (st.range === 'month') {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
    } else {
      from = addDays(today, -(Number(st.range) - 1));
    }
    return { from, to };
  }

  function compute(st) {
    const all = scopedOrders();
    const shopMap = new Map();
    all.forEach(o => shopMap.set(o.shopId, o.shopName));
    const list = (role() === 'admin' && st.shop !== 'all') ? all.filter(o => o.shopId === st.shop) : all;
    const { from, to } = bounds(st, list);
    const A = aggregate(list, from, to, null, st.range === 'all');
    let P = null, pf = null, pt = null;
    if (st.range !== 'all') {
      const len = Math.round((sod(to) - sod(from)) / DAY) + 1;
      pt = eod(addDays(from, -1)); pf = sod(addDays(from, -len));
      P = aggregate(list, pf, pt, A.gran, false);
    }
    return { all, list, shopMap, from, to, A, P, pf, pt };
  }

  /* ------------------------------ rendering ------------------------------ */
  function delta(cur, prev) {
    if (prev == null) return '';
    if (!prev && !cur) return '<span class="cba-d flat">–</span>';
    if (!prev) return '<span class="cba-d up">New</span>';
    const p = (cur - prev) / prev * 100;
    const c = p > 0.05 ? 'up' : p < -0.05 ? 'down' : 'flat';
    return `<span class="cba-d ${c}">${p > 0.05 ? '▲' : p < -0.05 ? '▼' : '•'} ${Math.abs(p).toFixed(1)}%</span>`;
  }

  function niceScale(v) {
    const raw = Math.max(v, 1e-9) / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p * 4;
  }

  function bucketLabel(b, gran) {
    if (gran === 'day') return fmtD(b.s, { weekday: 'short', day: 'numeric', month: 'short' });
    if (gran === 'week') return 'Week of ' + fmtD(b.s);
    return b.s.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  function chartSVG(A, P, M) {
    const W = 760, H = 250, L = 48, R = 14, T = 14, Bt = 28;
    const cur = A.B.map(M.get);
    const prev = P ? A.B.map((_, i) => (P.B[i] ? M.get(P.B[i]) : 0)) : null;
    const max = niceScale(Math.max(1, ...cur, ...(prev || [])));
    const n = cur.length, iw = W - L - R, ih = H - T - Bt;
    const x = i => L + (n <= 1 ? iw / 2 : i * iw / (n - 1));
    const y = v => T + ih * (1 - v / max);
    const line = a => a.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const v = max * k / 4, yy = y(v).toFixed(1);
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="cba-grid"/><text x="${L - 8}" y="${+yy + 4}" text-anchor="end">${M.short(v)}</text>`;
    }
    const step = Math.max(1, Math.ceil(n / 6));
    let xl = '';
    for (let i = 0; i < n; i += step) {
      const b = A.B[i];
      const t = A.gran === 'month' ? b.s.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : fmtD(b.s);
      xl += `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(t)}</text>`;
    }
    const area = n > 1 ? `<path d="${line(cur)} L${x(n - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z" class="cba-area"/>` : '';
    const dots = n <= 40 ? cur.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5" class="cba-dot"/>`).join('') : '';
    return `<svg viewBox="0 0 ${W} ${H}" class="cba-svg" role="img" aria-label="${esc(M.label)} over time">
      ${g}${xl}${area}
      ${prev ? `<path d="${line(prev)}" class="cba-prev"/>` : ''}
      <path d="${line(cur)}" class="cba-line"/>${dots}
      <line class="cba-cross" x1="0" x2="0" y1="${T}" y2="${H - Bt}"/>
      <circle class="cba-hot" r="5" cx="0" cy="0"/>
    </svg>
    <div class="cba-tip"></div>`;
  }

  function barRows(rows, fmt, cls) {
    const max = Math.max(1, ...rows.map(r => r.v));
    if (!rows.length) return '<p class="cba-empty">No data in this period.</p>';
    return rows.map(r => `<div class="cba-row"><div class="cba-row-h"><span title="${esc(r.name)}">${esc(r.name)}</span><b>${fmt(r)}</b></div>
      <div class="cba-bar"><i class="${cls || ''}" style="width:${Math.max(2, r.v / max * 100)}%"></i></div></div>`).join('');
  }

  function pctRows(map, total) {
    const rows = Array.from(map.entries()).map(([name, v]) => ({ name, v: v.n, rev: v.rev })).sort((a, b) => b.v - a.v);
    return barRows(rows, r => `${total ? Math.round(r.v / total * 100) : 0}% · ${money(r.rev)}`, 'alt');
  }

  function columns(list, labelFn, tipFn, tickEvery) {
    const max = Math.max(1, ...list.map(x => x.n));
    const peak = list.reduce((bi, x, i) => (x.n > list[bi].n ? i : bi), 0);
    return `<div class="cba-cols">${list.map((x, i) => `<div class="cba-col" title="${esc(tipFn(x, i))}">
      <i class="${i === peak && x.n ? 'peak' : ''}" style="height:${Math.max(x.n ? 6 : 2, x.n / max * 100)}%"></i>
      <span>${!tickEvery || i % tickEvery === 0 ? labelFn(i) : ''}</span></div>`).join('')}</div>`;
  }

  function Studio(host, mode) {
    const st = { range: '28', from: '', to: '', metric: 'revenue', shop: 'all' };
    let sig = '', D = null;
    host.classList.add('cba');

    function scopeName() {
      if (mode === 'owner') return (typeof currentUser !== 'undefined' && currentUser && currentUser.shopName) || 'Your shop';
      if (st.shop === 'all') return 'All shops';
      return (D && D.shopMap.get(st.shop)) || 'Shop';
    }

    function render() {
      D = compute(st);
      const { A, P, from, to, pf, pt, shopMap } = D;
      const M = METRICS[st.metric];
      const rangeTxt = fmtDY(from) + ' – ' + fmtDY(to);
      const cmpTxt = P ? 'vs ' + fmtD(pf) + ' – ' + fmtD(pt) : '';
      const kpi = k => {
        const m = METRICS[k];
        return `<button type="button" class="cba-kpi ${k === st.metric ? 'on' : ''}" data-metric="${k}">
          <span class="l">${m.label}</span><span class="v">${m.fmt(m.get(A))}</span>${P ? delta(m.get(A), m.get(P)) : '<span class="cba-d flat">&nbsp;</span>'}</button>`;
      };
      const opt = (v, t) => `<option value="${v}" ${st.range === v ? 'selected' : ''}>${t}</option>`;
      const shopSel = mode === 'admin'
        ? `<select data-ctl="shop" aria-label="Shop"><option value="all">All shops</option>${Array.from(shopMap.entries()).map(([id, n]) =>
          `<option value="${esc(id)}" ${st.shop === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : '';

      const items = Array.from(A.items.entries()).map(([name, v]) => ({ name, v: v.rev || v.qty, qty: v.qty, rev: v.rev }))
        .sort((a, b) => b.v - a.v).slice(0, 8);
      const peakH = A.hours.reduce((bi, h, i) => (h.n > A.hours[bi].n ? i : bi), 0);
      const dn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const peakD = A.dow.reduce((bi, h, i) => (h.n > A.dow[bi].n ? i : bi), 0);
      let bestDay = null;
      A.days.forEach((v, k) => { if (!bestDay || v.rev > bestDay.rev) bestDay = { k, rev: v.rev }; });
      const hasData = A.ord > 0 || A.lostN > 0;
      const shops = Array.from(A.shops.entries()).map(([name, v]) => ({ name, v: v.rev, n: v.n })).sort((a, b) => b.v - a.v).slice(0, 8);

      const fin = (label, val, cls) => `<tr class="${cls || ''}"><td>${label}</td><td>${val}</td></tr>`;

      host.innerHTML = `
      <div class="cba-head">
        <div><h3>Sales analytics</h3><p>${esc(scopeName())} · ${esc(rangeTxt)}${cmpTxt ? ' <em>' + esc(cmpTxt) + '</em>' : ''}</p></div>
        <div class="cba-ctl">
          ${shopSel}
          <select data-ctl="range" aria-label="Date range">
            ${opt('7', 'Last 7 days')}${opt('28', 'Last 28 days')}${opt('90', 'Last 90 days')}${opt('365', 'Last 365 days')}${opt('month', 'This month')}${opt('all', 'All time')}${opt('custom', 'Custom…')}
          </select>
          ${st.range === 'custom' ? `<input type="date" data-ctl="from" value="${esc(st.from || ymd(from))}" aria-label="From"><input type="date" data-ctl="to" value="${esc(st.to || ymd(to))}" aria-label="To">` : ''}
          <button type="button" class="cba-btn" data-export="1">⬇ Download Excel</button>
        </div>
      </div>
      <div class="cba-kpis">${kpi('revenue')}${kpi('orders')}${kpi('items')}${kpi('aov')}</div>
      <div class="cba-card cba-chartcard">
        <div class="cba-ch-h"><b>${M.label}</b><span><i class="k cur"></i>This period ${P ? '<i class="k prv"></i>Previous period' : ''}</span></div>
        ${hasData ? `<div class="cba-chart">${chartSVG(A, P, M)}</div>`
          : '<p class="cba-empty big">No orders in this period yet. Try a longer date range.</p>'}
        <p class="cba-note">Net revenue counts orders that were not cancelled or refunded.${A.gran !== 'day' ? ' Grouped by ' + A.gran + '.' : ''}</p>
      </div>
      ${hasData ? `<div class="cba-hl">
        ${bestDay ? `<div><span>Best day</span><b>${esc(fmtD(new Date(bestDay.k + 'T00:00'), { weekday: 'short', day: 'numeric', month: 'short' }))}</b><em>${money(bestDay.rev)}</em></div>` : ''}
        ${A.hours[peakH].n ? `<div><span>Busiest hour</span><b>${hourFull(peakH)} – ${hourFull((peakH + 1) % 24)}</b><em>${A.hours[peakH].n} orders</em></div>` : ''}
        ${A.dow[peakD].n ? `<div><span>Busiest weekday</span><b>${dn[peakD]}</b><em>${A.dow[peakD].n} orders</em></div>` : ''}
        ${items[0] ? `<div><span>Top seller</span><b title="${esc(items[0].name)}">${esc(items[0].name)}</b><em>${items[0].qty} sold</em></div>` : ''}
      </div>` : ''}
      <div class="cba-grid2">
        <div class="cba-card"><h4>Financial summary</h4>
          <table class="cba-fin">
            ${fin('Item sales', money(A.gross))}
            ${fin('Parcel charges', '+ ' + money(A.parcel))}
            ${fin('Express charges', '+ ' + money(A.express))}
            ${fin('Discounts & coupons', '− ' + money(A.disc))}
            ${fin('Net revenue', money(A.rev) + ' ' + (P ? delta(A.rev, P.rev) : ''), 'sum')}
            ${fin('Cancelled / refunded (' + A.lostN + ')', money(A.lost), 'neg')}
            ${fin('Avg. order value', money(A.aov))}
            ${fin('Customers', NF.format(A.customers) + (A.customers ? ' · ' + A.repeat + ' repeat' : ''))}
          </table>
        </div>
        <div class="cba-card"><h4>Top items</h4>${barRows(items, r => `${r.qty} sold · ${money(r.rev)}`)}</div>
        <div class="cba-card"><h4>Orders by hour</h4>
          ${columns(A.hours, hourLabel, (x, i) => hourFull(i) + ': ' + x.n + ' orders · ' + money(x.rev), 3)}</div>
        <div class="cba-card"><h4>Orders by weekday</h4>
          ${columns(A.dow, i => dn[i], (x, i) => dn[i] + ': ' + x.n + ' orders · ' + money(x.rev), 0)}</div>
        <div class="cba-card"><h4>Payment methods</h4>${pctRows(A.pay, A.ord)}</div>
        <div class="cba-card"><h4>Dine-in vs parcel</h4>${pctRows(A.pick, A.ord)}</div>
        ${mode === 'admin' && st.shop === 'all' ? `<div class="cba-card cba-wide"><h4>Revenue by shop</h4>${barRows(shops, r => `${r.n} orders · ${money(r.v)}`)}</div>` : ''}
      </div>`;
      sig = signature();
      bindChart(M);
    }

    function bindChart(M) {
      const wrap = host.querySelector('.cba-chart'); if (!wrap) return;
      const svg = wrap.querySelector('svg'), tip = wrap.querySelector('.cba-tip');
      const cross = svg.querySelector('.cba-cross'), hot = svg.querySelector('.cba-hot');
      const W = 760, H = 250, L = 48, R = 14, T = 14, Bt = 28, iw = W - L - R, ih = H - T - Bt;
      const { A, P } = D, n = A.B.length;
      const cur = A.B.map(M.get), prev = P ? A.B.map((_, i) => (P.B[i] ? M.get(P.B[i]) : 0)) : null;
      const max = niceScale(Math.max(1, ...cur, ...(prev || [])));
      const move = e => {
        const r = svg.getBoundingClientRect();
        const vx = (e.clientX - r.left) / r.width * W;
        const i = Math.max(0, Math.min(n - 1, n <= 1 ? 0 : Math.round((vx - L) / iw * (n - 1))));
        const px = L + (n <= 1 ? iw / 2 : i * iw / (n - 1)), py = T + ih * (1 - cur[i] / max);
        cross.setAttribute('x1', px); cross.setAttribute('x2', px);
        hot.setAttribute('cx', px); hot.setAttribute('cy', py);
        cross.style.opacity = hot.style.opacity = 1;
        tip.innerHTML = `<b>${esc(bucketLabel(A.B[i], A.gran))}</b><div>${esc(M.label)}: <b>${M.fmt(cur[i])}</b></div>` +
          (prev ? `<div class="p">Previous: ${M.fmt(prev[i])}</div>` : '');
        tip.style.display = 'block';
        const left = Math.max(70, Math.min(r.width - 70, px / W * r.width));
        tip.style.left = left + 'px'; tip.style.top = (py / H * r.height) + 'px';
      };
      const out = () => { tip.style.display = 'none'; cross.style.opacity = hot.style.opacity = 0; };
      svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
      svg.addEventListener('pointerleave', out);
    }

    function signature() {
      const l = scopedOrders();
      return [l.length, l.reduce((a, o) => a + o.total + (o.valid ? 1 : 3), 0), ymd(new Date()), st.range, st.shop, st.metric].join('|');
    }

    host.addEventListener('click', e => {
      const k = e.target.closest('[data-metric]');
      if (k) { st.metric = k.dataset.metric; render(); return; }
      if (e.target.closest('[data-export]')) exportExcel(D, st, scopeName());
    });
    host.addEventListener('change', e => {
      const c = e.target.dataset && e.target.dataset.ctl; if (!c) return;
      if (c === 'range') { st.range = e.target.value; if (st.range === 'custom' && !st.from) { st.from = ymd(D.from); st.to = ymd(D.to); } }
      else st[c] = e.target.value;
      render();
    });

    return {
      render,
      visible: () => host.offsetParent !== null,
      tick() {
        if (!this.visible()) return;
        const a = document.activeElement;
        if (a && host.contains(a) && /SELECT|INPUT/.test(a.tagName)) return;
        if (signature() !== sig) render();
      }
    };
  }

  /* ------------------------------ Excel export ------------------------------ */
  let xlsxPromise = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxPromise) xlsxPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => (window.XLSX ? res(window.XLSX) : rej(new Error('XLSX missing')));
      s.onerror = () => { xlsxPromise = null; rej(new Error('Could not load the Excel library')); };
      document.head.appendChild(s);
    });
    return xlsxPromise;
  }

  const RS = '"₹"#,##0.00';
  const R$ = v => ({ t: 'n', v: Math.round((v || 0) * 100) / 100, z: RS });
  const RF = (f, v) => ({ t: 'n', f, v: Math.round((v || 0) * 100) / 100, z: RS });

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function orderRows(D) {
    const head = ['Order no.', 'Date', 'Time', 'Shop', 'Student', 'Items', 'Item count', 'Item sales (₹)', 'Parcel (₹)', 'Express (₹)', 'Discount (₹)', 'Coupon', 'Total (₹)', 'Payment', 'Pickup', 'Status'];
    const rows = D.list.filter(o => o.date ? (o.date >= D.from && o.date <= D.to) : false)
      .sort((a, b) => a.date - b.date)
      .map(o => [o.token, ymd(o.date), o.date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), o.shopName, o.student,
        o.items.map(i => i.qty + ' × ' + i.name).join(' + '), o.itemCount, o.subtotal, o.parcel, o.express, o.discount, o.coupon, o.total, o.pay, o.pick, o.status]);
    return { head, rows };
  }

  async function exportExcel(D, st, scope) {
    const btn = document.querySelector('.cba [data-export]');
    const A = D.A, P = D.P;
    const fname = 'CampusBite_' + scope.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') + '_Sales_' + ymd(D.from) + '_to_' + ymd(D.to);
    const ord = orderRows(D);
    let X;
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
      X = await loadXLSX();
    } catch (err) {
      // Offline / blocked CDN: still give the person their data as CSV.
      const esc2 = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const csv = '\ufeff' + [ord.head].concat(ord.rows).map(r => r.map(esc2).join(',')).join('\r\n');
      download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fname + '.csv');
      if (typeof showToast === 'function') showToast('Excel library unavailable – downloaded CSV instead');
      if (btn) { btn.disabled = false; btn.textContent = '⬇ Download Excel'; }
      return;
    }
    const wb = X.utils.book_new();
    const add = (name, aoa, widths, filter) => {
      const ws = X.utils.aoa_to_sheet(aoa);
      ws['!cols'] = widths.map(w => ({ wch: w }));
      if (filter) ws['!autofilter'] = { ref: filter };
      X.utils.book_append_sheet(wb, ws, name);
    };
    const pct = (c, p) => (p == null ? '' : !p ? (c ? 'New' : '–') : ((c - p) / p * 100).toFixed(1) + '%');

    // 1. Summary
    const S = [
      ['CampusBite – Sales & Financial Report'], [],
      ['Scope', scope], ['Period', fmtDY(D.from) + ' to ' + fmtDY(D.to)],
      ['Generated', new Date().toLocaleString('en-IN')],
      ['Generated by', (typeof currentUser !== 'undefined' && (currentUser.name || currentUser.username)) || ''], [],
      ['Key metrics', 'This period', P ? 'Previous period' : '', P ? 'Change' : ''],
      ['Net revenue (₹)', R$(A.rev), P ? R$(P.rev) : '', pct(A.rev, P && P.rev)],
      ['Orders', A.ord, P ? P.ord : '', pct(A.ord, P && P.ord)],
      ['Items sold', A.itm, P ? P.itm : '', pct(A.itm, P && P.itm)],
      ['Average order value (₹)', R$(A.aov), P ? R$(P.aov) : '', pct(A.aov, P && P.aov)],
      ['Unique customers', A.customers, P ? P.customers : '', pct(A.customers, P && P.customers)],
      ['Repeat customers', A.repeat, P ? P.repeat : '', ''], [],
      ['Financial breakdown', 'This period', P ? 'Previous period' : ''],
      ['Item sales (₹)', R$(A.gross), P ? R$(P.gross) : ''],
      ['+ Parcel charges (₹)', R$(A.parcel), P ? R$(P.parcel) : ''],
      ['+ Express charges (₹)', R$(A.express), P ? R$(P.express) : ''],
      ['− Discounts & coupons (₹)', R$(A.disc), P ? R$(P.disc) : ''],
      ['Net revenue (₹)', R$(A.rev), P ? R$(P.rev) : ''],
      ['Cancelled / refunded value (₹)', R$(A.lost), P ? R$(P.lost) : ''],
      ['Cancelled / refunded orders', A.lostN, P ? P.lostN : ''], [],
      ['Note', 'Net revenue counts orders that were not cancelled or refunded.']
    ];
    add('Summary', S, [34, 20, 20, 12]);

    // 2. Daily sales (with SUM formulas)
    const dayRows = [];
    const nDays = Math.round((sod(D.to) - sod(D.from)) / DAY) + 1;
    if (nDays <= 1200) for (let i = 0; i < nDays; i++) dayRows.push(ymd(addDays(sod(D.from), i)));
    else Array.from(A.days.keys()).sort().forEach(k => dayRows.push(k));
    const dh = ['Date', 'Orders', 'Items sold', 'Item sales (₹)', 'Parcel (₹)', 'Express (₹)', 'Discounts (₹)', 'Net revenue (₹)', 'Avg. order value (₹)'];
    const dd = dayRows.map((k, i) => {
      const v = A.days.get(k) || { ord: 0, itm: 0, gross: 0, parcel: 0, express: 0, disc: 0, rev: 0 }, r = i + 2;
      return [k, v.ord, v.itm, R$(v.gross), R$(v.parcel), R$(v.express), R$(v.disc), R$(v.rev), RF(`IF(B${r}=0,0,H${r}/B${r})`, v.ord ? v.rev / v.ord : 0)];
    });
    const last = dd.length + 1, t = last + 1;
    const col = c => `SUM(${c}2:${c}${last})`;
    dd.push(['TOTAL', { t: 'n', f: col('B'), v: A.ord }, { t: 'n', f: col('C'), v: A.itm }, RF(col('D'), A.gross), RF(col('E'), A.parcel), RF(col('F'), A.express),
      RF(col('G'), A.disc), RF(col('H'), A.rev), RF(`IF(B${t}=0,0,H${t}/B${t})`, A.aov)]);
    add('Daily Sales', [dh].concat(dd), [13, 9, 11, 15, 12, 12, 14, 16, 18], 'A1:I' + last);

    // 3. Top items
    const ti = Array.from(A.items.entries()).sort((a, b) => b[1].rev - a[1].rev || b[1].qty - a[1].qty);
    add('Top Items', [['Item', 'Quantity sold', 'Revenue (₹)', 'Share of item sales']].concat(
      ti.map(([n, v]) => [n, v.qty, R$(v.rev), { t: 'n', v: A.gross ? v.rev / A.gross : 0, z: '0.0%' }])), [30, 14, 16, 18]);

    // 4. Hourly + weekday
    const dn = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    add('Peak Times', [['Hour', 'Orders', 'Revenue (₹)']].concat(A.hours.map((h, i) => [hourFull(i), h.n, R$(h.rev)]))
      .concat([[], ['Weekday', 'Orders', 'Revenue (₹)']], A.dow.map((h, i) => [dn[i], h.n, R$(h.rev)])), [16, 10, 16]);

    // 5. Payments, pickup (+ shops)
    const grp = (title, m) => [[title, 'Orders', 'Revenue (₹)']].concat(
      Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [k, v.n, R$(v.rev)]));
    let br = grp('Payment method', A.pay).concat([[]], grp('Dine-in / parcel', A.pick));
    if (D.shopMap.size > 1 || role() === 'admin') br = br.concat([[]], grp('Shop', A.shops));
    add('Breakdowns', br, [26, 10, 16]);

    // 6. Every order (all statuses, so refunds stay visible)
    add('Orders', [ord.head].concat(ord.rows.map(r => r.map((v, i) => ([7, 8, 9, 10, 12].includes(i) ? R$(v) : v)))),
      [12, 12, 8, 20, 18, 46, 10, 14, 11, 11, 13, 12, 13, 16, 10, 12], 'A1:P' + (ord.rows.length + 1));

    X.writeFile(wb, fname + '.xlsx');
    if (typeof showToast === 'function') showToast('Excel report downloaded');
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Download Excel'; }
  }

  /* ------------------------------ styles ------------------------------ */
  function injectCSS() {
    if (document.getElementById('cba-style')) return;
    const s = document.createElement('style'); s.id = 'cba-style';
    s.textContent = `
.cba{--bg:#fff;--bg2:#f8fafc;--bd:#e2e8f0;--tx:#0f172a;--mut:#64748b;--ac:#f97316;--ac2:rgba(249,115,22,.14);--up:#059669;--dn:#dc2626;color:var(--tx)}
body.theme-dark .cba{--bg:#0f172a;--bg2:#111827;--bd:rgba(148,163,184,.22);--tx:#e2e8f0;--mut:#94a3b8;--ac2:rgba(249,115,22,.2);--up:#34d399;--dn:#f87171}
.cba *{box-sizing:border-box}
.cba-head{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-end;margin-bottom:14px}
.cba-head h3{font-size:1.35rem;font-weight:900;margin:0}.cba-head p{margin:2px 0 0;color:var(--mut);font-size:.82rem}.cba-head em{font-style:normal;opacity:.8}
.cba-ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cba select,.cba input[type=date]{background:var(--bg);color:var(--tx);border:1px solid var(--bd);border-radius:12px;padding:8px 10px;font-size:.82rem;font-weight:700;max-width:100%}
.cba-btn{background:var(--ac);color:#fff;border:0;border-radius:12px;padding:9px 14px;font-weight:800;font-size:.82rem;cursor:pointer}
.cba-btn:disabled{opacity:.6;cursor:wait}.cba-btn:focus-visible,.cba-kpi:focus-visible,.cba-tabs button:focus-visible{outline:3px solid var(--ac2);outline-offset:2px}
.cba-kpis{display:grid;grid-template-columns:repeat(4,1fr);background:var(--bg);border:1px solid var(--bd);border-radius:16px;overflow:hidden;margin-bottom:12px}
.cba-kpi{display:flex;flex-direction:column;gap:3px;text-align:left;background:transparent;border:0;border-right:1px solid var(--bd);padding:14px 16px;cursor:pointer;color:var(--tx);font:inherit}
.cba-kpi:last-child{border-right:0}.cba-kpi .l{font-size:.75rem;color:var(--mut);font-weight:700}
.cba-kpi .v{font-size:1.55rem;font-weight:900;font-variant-numeric:tabular-nums;line-height:1.15}
.cba-kpi.on{background:var(--bg2);box-shadow:inset 0 -3px 0 var(--ac)}.cba-kpi:hover:not(.on){background:var(--bg2)}
.cba-d{font-size:.72rem;font-weight:800;color:var(--mut)}.cba-d.up{color:var(--up)}.cba-d.down{color:var(--dn)}
.cba-card{background:var(--bg);border:1px solid var(--bd);border-radius:16px;padding:16px;min-width:0}
.cba-card h4{margin:0 0 12px;font-size:.95rem;font-weight:900}
.cba-chartcard{margin-bottom:12px}
.cba-ch-h{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;font-size:.82rem;margin-bottom:6px}
.cba-ch-h span{color:var(--mut);display:flex;align-items:center;gap:6px}.cba-ch-h .k{display:inline-block;width:14px;height:0;border-top:3px solid var(--ac);margin-left:6px}
.cba-ch-h .k.prv{border-top:2px dashed var(--mut)}
.cba-chart{position:relative}.cba-svg{width:100%;height:auto;display:block;touch-action:pan-y;overflow:visible}
.cba-svg text{fill:var(--mut);font-size:11px}.cba-grid{stroke:var(--bd);stroke-width:1}
.cba-line{fill:none;stroke:var(--ac);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.cba-prev{fill:none;stroke:var(--mut);stroke-width:1.6;stroke-dasharray:5 5;opacity:.7}
.cba-area{fill:var(--ac2);stroke:none}.cba-dot{fill:var(--ac)}
.cba-cross{stroke:var(--mut);stroke-width:1;stroke-dasharray:3 3;opacity:0}.cba-hot{fill:#fff;stroke:var(--ac);stroke-width:3;opacity:0}
.cba-tip{position:absolute;display:none;pointer-events:none;transform:translate(-50%,calc(-100% - 12px));background:#0f172a;color:#fff;border-radius:10px;padding:8px 10px;font-size:.75rem;line-height:1.5;white-space:nowrap;box-shadow:0 10px 24px rgba(15,23,42,.3);z-index:5}
.cba-tip .p{opacity:.7}
.cba-note{margin:6px 0 0;color:var(--mut);font-size:.72rem}
.cba-empty{color:var(--mut);font-size:.82rem;margin:0}.cba-empty.big{padding:46px 0;text-align:center}
.cba-hl{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
.cba-hl div{background:var(--bg);border:1px solid var(--bd);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;min-width:0}
.cba-hl span{font-size:.7rem;color:var(--mut);font-weight:700}.cba-hl b{font-size:.95rem;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cba-hl em{font-style:normal;font-size:.75rem;color:var(--mut)}
.cba-grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.cba-wide{grid-column:1/-1}
.cba-fin{width:100%;border-collapse:collapse;font-size:.85rem}.cba-fin td{padding:7px 0;border-bottom:1px solid var(--bd)}
.cba-fin td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
.cba-fin tr.sum td{font-weight:900;font-size:.95rem;border-bottom:2px solid var(--tx)}.cba-fin tr.neg td:last-child{color:var(--dn)}
.cba-row{margin-bottom:10px}.cba-row-h{display:flex;justify-content:space-between;gap:10px;font-size:.82rem}
.cba-row-h span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}.cba-row-h b{white-space:nowrap;color:var(--mut);font-weight:700}
.cba-bar{height:7px;border-radius:9px;background:var(--bg2);margin-top:4px;overflow:hidden}.cba-bar i{display:block;height:100%;border-radius:9px;background:var(--ac)}.cba-bar i.alt{background:#0ea5e9}
.cba-cols{display:flex;align-items:flex-end;gap:3px;height:130px;padding-bottom:16px}
.cba-col{flex:1;height:100%;position:relative;display:flex;align-items:flex-end}
.cba-col i{display:block;width:100%;background:var(--ac2);border-radius:4px 4px 0 0;border-top:2px solid var(--ac)}.cba-col i.peak{background:var(--ac)}
.cba-col span{position:absolute;left:50%;bottom:-16px;transform:translateX(-50%);font-size:.62rem;color:var(--mut);white-space:nowrap}
.cba-tabs{display:inline-flex;gap:4px;padding:4px;background:var(--bg2,#f1f5f9);border:1px solid #e2e8f0;border-radius:14px;margin-bottom:16px}
.cba-tabs button{border:0;background:transparent;padding:8px 14px;border-radius:10px;font-weight:800;font-size:.85rem;color:#64748b;cursor:pointer}
.cba-tabs button.on{background:#0f172a;color:#fff}
body.theme-dark .cba-tabs{background:#111827;border-color:rgba(148,163,184,.22)}body.theme-dark .cba-tabs button{color:#94a3b8}body.theme-dark .cba-tabs button.on{background:#f97316;color:#fff}
@media(max-width:820px){.cba-kpis{grid-template-columns:repeat(2,1fr)}.cba-kpi:nth-child(2){border-right:0}.cba-kpi:nth-child(-n+2){border-bottom:1px solid var(--bd)}
.cba-hl{grid-template-columns:repeat(2,1fr)}.cba-grid2{grid-template-columns:1fr}.cba-ctl{width:100%}.cba-ctl .cba-btn{flex:1}}
@media(prefers-reduced-motion:no-preference){.cba-line{stroke-dasharray:2000;stroke-dashoffset:2000;animation:cbaDraw 1s ease-out forwards}}
@keyframes cbaDraw{to{stroke-dashoffset:0}}`;
    document.head.appendChild(s);
  }

  /* ------------------------------ mounting ------------------------------ */
  const studios = [];

  function mountOwner() {
    const v = document.getElementById('ownerView');
    if (!v || v.dataset.cba) return;
    v.dataset.cba = '1';
    const header = v.firstElementChild;
    const tabs = document.createElement('div');
    tabs.className = 'cba-tabs';
    tabs.innerHTML = '<button type="button" data-t="shop" class="on">My canteen</button><button type="button" data-t="an">Sales &amp; analytics</button>';
    const sec = document.createElement('section');
    sec.id = 'ownerAnalyticsSection'; sec.style.display = 'none';
    header.after(tabs); tabs.after(sec);
    const studio = Studio(sec, 'owner'); studios.push(studio);
    tabs.addEventListener('click', e => {
      const b = e.target.closest('button[data-t]'); if (!b || role() !== 'owner') return;
      const an = b.dataset.t === 'an';
      tabs.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      Array.from(v.children).forEach(c => { if (c !== header && c !== tabs && c !== sec) c.style.display = an ? 'none' : ''; });
      sec.style.display = an ? '' : 'none';
      if (an) studio.render();
    });
  }

  function mountAdmin() {
    const v = document.getElementById('adminView'), menuBtn = document.getElementById('adminMenuBtn');
    if (!v || !menuBtn || v.dataset.cba) return;
    v.dataset.cba = '1';
    const btn = document.createElement('button');
    btn.id = 'adminAnalyticsBtn'; btn.type = 'button';
    btn.className = 'admin-section-btn px-4 py-2 rounded-xl bg-white border font-bold text-sm';
    btn.textContent = 'Sales & Analytics';
    menuBtn.after(btn);
    const sec = document.createElement('section');
    sec.id = 'adminAnalyticsSection'; sec.className = 'hidden'; sec.style.display = 'none';
    v.appendChild(sec);
    const studio = Studio(sec, 'admin'); studios.push(studio);
    const others = ['adminMenuSection', 'adminHistorySection', 'adminOwnersSection', 'adminStudentsSection', 'adminAdminsSection', 'adminServiceSection', 'adminReportsSection'];
    btn.addEventListener('click', () => {
      if (role() !== 'admin') return;
      others.forEach(id => { const el = document.getElementById(id); if (el) { el.classList.add('hidden'); el.style.display = 'none'; } });
      document.querySelectorAll('.admin-section-btn').forEach(b => { b.classList.remove('bg-slate-900', 'text-white'); b.classList.add('bg-white', 'border'); });
      btn.classList.remove('bg-white', 'border'); btn.classList.add('bg-slate-900', 'text-white');
      sec.classList.remove('hidden'); sec.style.display = 'block';
      studio.render();
    });
    // Any other admin section opening must hide ours.
    const orig = window.openAdminSection;
    if (typeof orig === 'function') {
      window.openAdminSection = function () {
        sec.classList.add('hidden'); sec.style.display = 'none';
        return orig.apply(this, arguments);
      };
    }
  }

  function init() {
    injectCSS(); mountOwner(); mountAdmin();
    setInterval(() => studios.forEach(s => { try { s.tick(); } catch (e) { console.error('Analytics refresh failed', e); } }), 2500);
  }
  window.CBAnalytics = { refresh: () => studios.forEach(s => s.visible() && s.render()) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
