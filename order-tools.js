/* ==========================================================================
   CampusBite Order Tools — order-tools.js
   1) ADMIN ▸ Order History: the order # is now a button. Click it to see WHO ordered
      (customer name + ID) together with the full order details.
      (The same popup opens from the Wallet ledger.)
   2) STUDENT ▸ My Orders: "Sort" menu (newest, oldest, highest/lowest amount,
      active first). Your choice is remembered in this browser.
   Load after wallet.js (see bottom of index.html).
   ========================================================================== */
(function () {
  'use strict';
  if (window.CBOrderTools) return;

  function $(id) { return document.getElementById(id); }
  function role() { try { return typeof currentRole === 'string' ? currentRole : ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rs(n) { return '₹' + (Math.round(Number(n || 0) * 100) / 100); }
  function list(name) {
    try { var v = (0, eval)('typeof ' + name + '!=="undefined"?' + name + ':null'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function when(v) {
    var d = v && v.toDate ? v.toDate() : (v instanceof Date ? v : (v ? new Date(v) : null));
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
  function stamp(o) {
    var v = o && (o.createdAt || o.time);
    var d = v && v.toDate ? v.toDate() : (v ? new Date(v) : null);
    return d && !isNaN(d.getTime()) ? d.getTime() : 0;
  }

  /* ---------- who is the customer? ---------- */
  function studentRecord(o) {
    var st = list('students');
    for (var i = 0; i < st.length; i++) {
      var s = st[i];
      if ((o.studentId && (s.uid === o.studentId || s.authUid === o.studentId)) || (o.user && s.username === o.user)) return s;
    }
    return null;
  }
  function customerOf(o) {
    var rec = studentRecord(o) || {};
    return {
      name: o.studentName || rec.name || o.user || rec.username || '',
      username: rec.username || o.user || '',
      className: rec.className || '',
      email: rec.email || ''
    };
  }

  function findOrder(token) {
    var pools = [list('orderHistory'), list('orders'), list('purchaseStore')];
    for (var p = 0; p < pools.length; p++) {
      for (var i = 0; i < pools[p].length; i++) if (pools[p][i] && pools[p][i].token === token) return pools[p][i];
    }
    return null;
  }

  /* ---------- the popup ---------- */
  var modal;
  function mountModal() {
    if ($('orderCustomerModal')) { modal = $('orderCustomerModal'); return; }
    modal = document.createElement('div');
    modal.id = 'orderCustomerModal';
    modal.className = 'hidden fixed inset-0 z-[88] modal-backdrop grid place-items-center p-4';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'ocmTitle');
    modal.innerHTML = '<section class="modal-shell bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">'
      + '<div class="flex items-center justify-between mb-4"><h2 id="ocmTitle" class="text-xl font-black">Order details</h2>'
      + '<button type="button" id="ocmClose" class="w-9 h-9 rounded-xl bg-slate-100" aria-label="Close">×</button></div><div id="ocmBody"></div></section>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal || e.target.id === 'ocmClose') close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
  }
  function close() { if (modal) modal.classList.add('hidden'); }

  function row(k, v) { return '<div class="flex justify-between gap-4 py-2 border-b last:border-0"><span class="text-slate-500">' + k + '</span><span class="font-bold text-right">' + v + '</span></div>'; }

  function fetchOrder(token) {
    if (!window.firebase || !firebase.apps || !firebase.apps.length) return Promise.resolve(null);
    return firebase.firestore().collection('orders').where('token', '==', token).get().then(function (snap) {
      var d = snap.docs && snap.docs[0]; if (!d) return null;
      var o = d.data(); o.id = d.id;
      var raw = Array.isArray(o.items) ? o.items : [];
      o.itemDetails = raw;
      o.items = raw.map(function (i) { return (i.quantity || 1) + ' × ' + (i.name || 'Food item'); }).join(' + ');
      return o;
    });
  }

  /* Opens the popup. If the order is not in the lists already loaded in the page
     (e.g. still Preparing, or cancelled), it is fetched from Firestore. */
  function openOrder(token, hint) {
    if (role() !== 'admin') return;
    mountModal();
    var o = findOrder(token) || hint;
    if (o) return showOrder(o);
    $('ocmBody').innerHTML = '<p class="text-slate-500">Loading order ' + esc(token) + '…</p>';
    modal.classList.remove('hidden');
    fetchOrder(token).then(function (found) {
      if (found) showOrder(found);
      else $('ocmBody').innerHTML = '<p class="text-slate-500">Order ' + esc(token) + ' could not be found.</p>';
    }).catch(function (e) {
      console.error('Could not load the order:', e);
      $('ocmBody').innerHTML = '<p class="text-red-600 font-semibold">Could not load order ' + esc(token) + '. Check your connection and Firestore rules.</p>';
    });
  }

  function showOrder(o) {
    var body = $('ocmBody');
    var c = customerOf(o);
    var rawItems = Array.isArray(o.itemDetails) ? o.itemDetails : (Array.isArray(o.items) ? o.items : null);
    var items = rawItems ? rawItems.map(function (i) { return esc((i.quantity || 1) + ' × ' + (i.name || 'Food item')); }).join('<br>') : esc(o.items || '');
    var method = o.paymentMethod || o.payment || '';
    var fee = Number(o.expressFee || 0) + Number(o.parcelFee || 0);
    var name = c.name ? esc(c.name) : '<span class="text-slate-400">Not recorded (older order)</span>';
    body.innerHTML =
      '<div class="rounded-2xl bg-slate-900 text-white p-4 mb-4"><p class="text-xs text-slate-300 font-bold uppercase tracking-wider">Customer</p>'
      + '<p class="text-2xl font-black mt-1">' + (c.name ? esc(c.name) : 'Unknown customer') + '</p>'
      + '<p class="text-xs text-slate-300 mt-1">' + [c.username ? 'ID: ' + esc(c.username) : '', c.className ? esc(c.className) : '', c.email ? esc(c.email) : ''].filter(Boolean).join(' • ') + '</p></div>'
      + '<div class="text-sm">'
      + row('Order', esc(o.token || ''))
      + row('Customer name', name)
      + row('Status', esc(o.status || ''))
      + row('Canteen', esc(o.shopName || 'Main Canteen'))
      + row('Items', items)
      + (o.subtotal != null ? row('Subtotal', rs(o.subtotal)) : '')
      + (fee ? row(o.pickupType === 'parcel' ? 'Parcel charge' : 'Express fee', rs(fee)) : '')
      + (Number(o.discount) > 0 ? row('Discount' + (o.couponCode ? ' (' + esc(o.couponCode) + ')' : ''), '−' + rs(o.discount)) : '')
      + row('Total', rs(o.total))
      + row('Payment', (/wallet/i.test(method) ? '👛 ' : '') + esc(method) + (o.walletRefunded ? ' • refunded to wallet' : ''))
      + row('Pickup', o.pickupType === 'parcel' || o.pickupLabel === 'Parcel' ? 'Parcel' : 'Dine-in')
      + row('Placed', esc(when(o.createdAt) || o.time || ''))
      + '</div>';
    modal.classList.remove('hidden');
  }

  /* ---------- admin Order History table (token is clickable) ---------- */
  function renderHistory2() {
    var tb = $('historyTable'); if (!tb) return;
    var q = ($('historySearch') && $('historySearch').value || '').toLowerCase();
    var rows = list('orderHistory').filter(function (o) {
      return (String(o.token || '') + ' ' + String(o.items || '') + ' ' + String(customerOf(o).name || '')).toLowerCase().indexOf(q) >= 0;
    });
    tb.innerHTML = rows.map(function (o) {
      var method = o.paymentMethod || o.payment || '';
      var refunded = o.status === 'Refunded';
      return '<tr class="history-row border-b last:border-0">'
        + '<td class="py-3"><button type="button" data-order-token="' + esc(o.token) + '" class="font-black text-orange-600 underline decoration-dotted underline-offset-4" title="Click to see the customer" aria-label="View customer for order ' + esc(o.token) + '">' + esc(o.token) + '</button></td>'
        + '<td>' + esc(o.items) + '<div class="text-xs text-slate-500 mt-1">' + esc(o.pickupLabel || 'Dine-in') + '</div></td>'
        + '<td class="font-bold">₹' + esc(o.total) + '</td>'
        + '<td>' + (/wallet/i.test(method) ? '👛 ' : '') + esc(method) + '</td>'
        + '<td><span class="' + (refunded ? 'text-red-600' : 'text-emerald-600') + ' font-bold">' + esc(o.status) + '</span></td>'
        + '<td>' + esc(o.time || when(o.createdAt)) + '</td>'
        + '<td>' + (refunded ? '<span class="text-slate-400">Refunded</span>' : '<button type="button" data-refund-token="' + esc(o.token) + '" class="px-2 py-1 rounded-lg bg-red-50 text-red-600 font-bold">Refund</button>') + '</td></tr>';
    }).join('');
  }
  function mountHistory() {
    window.renderHistory = renderHistory2;            // renderAll()/live sync call this by name
    var s = $('historySearch');
    if (s) { s.oninput = renderHistory2; s.placeholder = 'Search token, food or customer…'; }
    var tb = $('historyTable');
    if (tb && !tb.__cbTools) {
      tb.__cbTools = true;
      tb.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('[data-order-token]');
        if (t) return openOrder(t.getAttribute('data-order-token'));
        var r = e.target.closest && e.target.closest('[data-refund-token]');
        if (r && typeof window.refundOrder === 'function') window.refundOrder(r.getAttribute('data-refund-token'));
      });
    }
    renderHistory2();
  }

  /* ---------- student My Orders: sort ---------- */
  var SORT_KEY = 'campusbite_orders_sort';
  var SORTS = [
    ['new', 'Newest first'], ['old', 'Oldest first'], ['high', 'Amount: High → Low'], ['low', 'Amount: Low → High'], ['active', 'Active orders first']
  ];
  var sortMode = 'new';
  try { var sv = localStorage.getItem(SORT_KEY); if (SORTS.some(function (x) { return x[0] === sv; })) sortMode = sv; } catch (e) {}
  var ACTIVE = { Preparing: 0, Accepted: 0, Confirmed: 0, Ready: 0 };

  function compare(a, b) {
    var ta = stamp(a), tb = stamp(b);
    if (sortMode === 'old') return ta - tb;
    if (sortMode === 'high') return (Number(b.total) || 0) - (Number(a.total) || 0) || tb - ta;
    if (sortMode === 'low') return (Number(a.total) || 0) - (Number(b.total) || 0) || tb - ta;
    if (sortMode === 'active') {
      var aa = a.status in ACTIVE ? 0 : 1, bb = b.status in ACTIVE ? 0 : 1;
      return aa - bb || tb - ta;
    }
    return tb - ta;
  }

  function mountSort() {
    var group = document.querySelector('#studentOrdersView [aria-label="Filter orders"]');
    if (!group || $('studentOrderSort')) return;
    var sel = document.createElement('select');
    sel.id = 'studentOrderSort'; sel.setAttribute('aria-label', 'Sort orders');
    sel.className = 'sm:ml-auto border rounded-full px-4 py-2 bg-white font-bold text-sm';
    sel.innerHTML = SORTS.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === sortMode ? ' selected' : '') + '>↕ ' + x[1] + '</option>'; }).join('');
    sel.addEventListener('change', function () {
      sortMode = sel.value;
      try { localStorage.setItem(SORT_KEY, sortMode); } catch (e) {}
      if (typeof window.renderMyPurchases === 'function') window.renderMyPurchases();
    });
    group.appendChild(sel);
  }
  function wrapMyPurchases() {
    if (typeof window.renderMyPurchases !== 'function' || window.renderMyPurchases.__cbSorted) return;
    var prev = window.renderMyPurchases;
    var wrapped = function () {
      try { if (Array.isArray(myPurchases)) myPurchases.sort(compare); } catch (e) {}   // sorted before the cards are drawn
      return prev.apply(this, arguments);
    };
    wrapped.__cbSorted = true;
    window.renderMyPurchases = wrapped;
  }

  function boot() {
    mountHistory(); mountSort(); wrapMyPurchases();
    if (typeof window.renderMyPurchases === 'function') window.renderMyPurchases();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  window.CBOrderTools = { openOrder: openOrder, close: close };
})();
