/* ==========================================================================
   CampusBite Master Control — master-control.js
   Adds, without touching your Firebase code:
     • Admin ▸ "Master Control" tab: one place to control everything
         – pause / resume ALL ordering
         – open / close each canteen
         – coupons (create, limit, expire, per-canteen, on/off)
         – announcement banner for every user
         – low-stock alert level (used by the mascots)
         – animations on/off for everyone, mascots on/off, live numbers
     • Student cart: coupon box + discount line
   Settings are stored in Firestore document  campusbite/config  (your existing
   rules already allow signed-in users to read/write the campusbite collection).
   When Firebase is not signed in they fall back to this browser (localStorage).

   Load it after animations.js and BEFORE mascot.js:
       <script src="master-control.js"></script>
   ========================================================================== */
(function () {
  'use strict';
  if (window.CBMaster) return;

  var LS = 'campusbite_master_config';
  var DEFAULTS = {
    ordering: { enabled: true, message: '' },
    couponsEnabled: true,
    coupons: [],
    closedShops: {},
    announcement: { enabled: false, text: '', level: 'info' },
    lowStock: 10,
    animations: true
  };
  var cfg = clone(DEFAULTS);
  var applied = '';            // coupon code currently applied in this student's cart
  var couponNote = '';         // message under the coupon box
  var couponNoteBad = false;
  var panelOpen = false;

  /* ---------------- helpers ---------------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rs(n) { return '₹' + (Math.round(Number(n) * 100) / 100); }
  function role() { try { return typeof currentRole === 'string' ? currentRole : ''; } catch (e) { return ''; } }
  function G(name, fallback) { try { return (0, eval)('typeof ' + name + '!=="undefined"?' + name + ':undefined'); } catch (e) { return undefined; } }
  function arr(name) { var v = G(name); return Array.isArray(v) ? v : []; }
  function toast(msg) { try { if (typeof showToast === 'function') return showToast(msg); } catch (e) {} alert(msg); }
  function shops() {
    try { if (typeof getFoodShops === 'function') return getFoodShops(); } catch (e) {}
    return [{ id: 'main-canteen', name: 'Main Canteen' }];
  }
  function shopName(id) {
    var s = shops().filter(function (x) { return x.id === id; })[0];
    return s ? s.name : id;
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function merge(remote) {
    if (!remote || typeof remote !== 'object') return;
    var c = clone(DEFAULTS);
    if (remote.ordering) c.ordering = { enabled: remote.ordering.enabled !== false, message: String(remote.ordering.message || '') };
    if (typeof remote.couponsEnabled === 'boolean') c.couponsEnabled = remote.couponsEnabled;
    if (Array.isArray(remote.coupons)) c.coupons = remote.coupons;
    if (remote.closedShops && typeof remote.closedShops === 'object') c.closedShops = remote.closedShops;
    if (remote.announcement) c.announcement = { enabled: !!remote.announcement.enabled, text: String(remote.announcement.text || ''), level: remote.announcement.level || 'info' };
    if (Number(remote.lowStock) > 0) c.lowStock = Number(remote.lowStock);
    if (typeof remote.animations === 'boolean') c.animations = remote.animations;
    cfg = c;
  }
  try { merge(JSON.parse(localStorage.getItem(LS) || 'null')); } catch (e) {}

  /* ---------------- Firestore (optional, additive) ---------------- */
  var unsub = null, fsOK = false;
  function fdb() { try { return window.firebase && firebase.apps && firebase.apps.length ? firebase.firestore() : null; } catch (e) { return null; } }
  function cref() { var d = fdb(); return d ? d.collection('campusbite').doc('config') : null; }
  function listen() {
    var r = cref(); if (!r || unsub) return;
    unsub = r.onSnapshot(function (s) {
      fsOK = true;
      if (s.exists) { merge(s.data()); try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) {} }
      changed();
    }, function (e) { fsOK = false; console.warn('Master Control: cloud settings unavailable, using this browser.', e && e.code); });
  }
  function startWhenSignedIn() {
    try {
      if (!window.firebase || !firebase.auth) return;
      firebase.auth().onAuthStateChanged(function (u) {
        if (u) listen();
        else { if (unsub) { unsub(); unsub = null; } fsOK = false; }
      });
    } catch (e) {}
  }
  function persist(label) {
    try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) {}
    var r = cref(), signed = false;
    try { signed = !!(window.firebase && firebase.auth().currentUser); } catch (e) {}
    changed();
    if (r && signed) {
      return r.set(clone(cfg)).then(function () { say('Saved for all users ✓' + (label ? ' — ' + label : ''), false); })
        .catch(function (e) { console.error(e); say('Could not save to Firestore (saved in this browser only). Check rules.', true); });
    }
    say('Saved in this browser (sign in with Firebase to share with everyone)', false);
    return Promise.resolve();
  }
  var sayTimer = 0;
  function say(msg, bad) {
    var el = $('cbmStatus'); if (!el) return;
    el.textContent = msg; el.className = 'text-sm font-bold ' + (bad ? 'text-red-600' : 'text-emerald-600');
    clearTimeout(sayTimer); sayTimer = setTimeout(function () { el.textContent = ''; }, 5000);
  }

  /* ---------------- coupons: validate / apply ---------------- */
  function cartShop() { var c = arr('cart'); return c.length ? (c[0].shopId || 'main-canteen') : ''; }
  function findCoupon(code) {
    code = String(code || '').trim().toUpperCase();
    return cfg.coupons.filter(function (c) { return String(c.code).toUpperCase() === code; })[0] || null;
  }
  function validate(code, sub, shopId) {
    var c = findCoupon(code);
    if (!cfg.couponsEnabled) return { ok: false, msg: 'Coupons are switched off right now.' };
    if (!c) return { ok: false, msg: 'That coupon code is not valid.' };
    if (c.active === false) return { ok: false, msg: c.code + ' is not active.' };
    if (c.expires && c.expires < today()) return { ok: false, msg: c.code + ' has expired.' };
    if (Number(c.limit) > 0 && Number(c.used || 0) >= Number(c.limit)) return { ok: false, msg: c.code + ' has been fully redeemed.' };
    if (c.shopId && shopId && c.shopId !== shopId) return { ok: false, msg: c.code + ' works only at ' + shopName(c.shopId) + '.' };
    if (Number(c.min) > 0 && sub < Number(c.min)) return { ok: false, msg: 'Add ' + rs(Number(c.min) - sub) + ' more to use ' + c.code + ' (minimum ' + rs(c.min) + ').' };
    var d = c.type === 'flat' ? Number(c.value) : Math.floor(sub * Number(c.value) / 100);
    if (c.type !== 'flat' && Number(c.max) > 0) d = Math.min(d, Number(c.max));
    d = Math.max(0, Math.min(d, sub));
    if (!d) return { ok: false, msg: c.code + ' gives no discount on this order.' };
    return { ok: true, discount: d, coupon: c };
  }
  function discountFor(sub) {
    if (!applied) return 0;
    var v = validate(applied, sub, cartShop());
    if (!v.ok) { couponNote = v.msg; couponNoteBad = true; applied = ''; return 0; }
    return v.discount;
  }
  function consume(sub) {
    if (!applied) return { discount: 0, code: '' };
    var v = validate(applied, sub, cartShop());
    if (!v.ok) { var m = v.msg; applied = ''; renderBox(); throw new Error(m + ' Please review your cart and try again.'); }
    return { discount: v.discount, code: v.coupon.code };
  }
  function afterOrder(code) {
    applied = ''; couponNote = ''; couponNoteBad = false;
    if (code) bumpUse(code);
    renderBox();
  }
  function bumpUse(code) {
    var c = findCoupon(code); if (c) c.used = Number(c.used || 0) + 1;      // local view
    var d = fdb(), r = cref(); if (!d || !r) { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) {} return; }
    d.runTransaction(function (t) {
      return t.get(r).then(function (s) {
        var list = (s.exists && Array.isArray(s.data().coupons)) ? s.data().coupons : cfg.coupons;
        list = list.map(function (x) { return String(x.code).toUpperCase() === String(code).toUpperCase() ? Object.assign({}, x, { used: Number(x.used || 0) + 1 }) : x; });
        t.set(r, { coupons: list }, { merge: true });
      });
    }).catch(function (e) { console.warn('Could not record coupon use', e && e.code); });
  }

  /* ---------------- ordering guard ---------------- */
  function guard(shopId) {
    if (cfg.ordering && cfg.ordering.enabled === false) return cfg.ordering.message || 'Ordering is paused by the canteen admin. Please try again soon.';
    if (shopId && cfg.closedShops && cfg.closedShops[shopId]) return shopName(shopId) + ' is closed by the admin right now.';
    return '';
  }

  /* ---------------- student cart: coupon box ---------------- */
  function renderBox(sub, disc) {
    var area = $('checkoutArea'); if (!area) return;
    var rows = area.querySelector('.space-y-2'); if (!rows) return;
    var box = $('cbCouponBox');
    var eligible = cfg.couponsEnabled ? cfg.coupons.filter(function (c) {
      return c.active !== false && (!c.expires || c.expires >= today()) && !(Number(c.limit) > 0 && Number(c.used || 0) >= Number(c.limit)) && (!c.shopId || !cartShop() || c.shopId === cartShop());
    }) : [];
    if (!eligible.length && !applied) { if (box) box.remove(); var r0 = $('cbDiscRow'); if (r0) r0.remove(); return; }
    if (!box) {
      box = document.createElement('div'); box.id = 'cbCouponBox'; box.className = 'mb-4';
      area.insertBefore(box, rows);
      box.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-cb]') : null; if (!t) return;
        var a = t.getAttribute('data-cb');
        if (a === 'remove') { applied = ''; couponNote = ''; refreshCart(); return; }
        if (a === 'apply') apply($('cbCouponInput').value);
        if (a === 'chip') apply(t.getAttribute('data-code'));
      });
      box.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'cbCouponInput') { e.preventDefault(); apply(e.target.value); } });
    }
    if (sub == null) sub = arr('cart').reduce(function (a, b) { return a + b.price * b.qty; }, 0);
    var typed = ($('cbCouponInput') || {}).value || '';
    var chips = eligible.map(function (c) {
      var off = c.type === 'flat' ? rs(c.value) + ' off' : c.value + '% off';
      return '<button type="button" data-cb="chip" data-code="' + esc(c.code) + '" class="px-2.5 py-1 rounded-lg border border-dashed border-orange-400 bg-orange-50 text-orange-700 text-xs font-black">' + esc(c.code) + ' • ' + off + '</button>';
    }).join(' ');
    box.innerHTML = applied
      ? '<div class="flex items-center justify-between rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3 py-2"><div><b class="text-emerald-700">🎟️ ' + esc(applied) + ' applied</b><p class="text-xs text-emerald-700">You save ' + rs(disc || 0) + '</p></div><button type="button" data-cb="remove" class="text-xs font-black text-red-600 px-2 py-1">Remove</button></div>'
      : '<p class="text-xs font-bold text-slate-500 mb-2">🎟️ Have a coupon?</p><div class="flex gap-2"><input id="cbCouponInput" value="' + esc(typed) + '" maxlength="20" autocomplete="off" autocapitalize="characters" placeholder="Enter code" class="flex-1 border rounded-xl px-3 py-2 uppercase text-sm"><button type="button" data-cb="apply" class="px-4 py-2 rounded-xl bg-slate-900 text-white font-black text-sm">Apply</button></div>'
        + '<div class="flex flex-wrap gap-2 mt-2">' + chips + '</div>'
        + (couponNote ? '<p class="text-xs font-bold mt-2 ' + (couponNoteBad ? 'text-red-600' : 'text-emerald-600') + '">' + esc(couponNote) + '</p>' : '');
    // discount line in the totals
    var row = $('cbDiscRow');
    if (disc > 0) {
      if (!row) { row = document.createElement('div'); row.id = 'cbDiscRow'; row.className = 'flex justify-between text-emerald-600 font-bold'; rows.insertBefore(row, rows.children[2] || null); }
      row.innerHTML = '<span>Coupon ' + esc(applied) + '</span><b>−' + rs(disc) + '</b>';
    } else if (row) row.remove();
  }
  function apply(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) { couponNote = 'Type a coupon code first.'; couponNoteBad = true; renderBox(); return; }
    var sub = arr('cart').reduce(function (a, b) { return a + b.price * b.qty; }, 0);
    var v = validate(code, sub, cartShop());
    if (!v.ok) { couponNote = v.msg; couponNoteBad = true; renderBox(); return; }
    applied = v.coupon.code; couponNote = 'Coupon applied — you save ' + rs(v.discount) + '!'; couponNoteBad = false;
    refreshCart();
    try { if (window.CampusBiteMotion && CampusBiteMotion.confetti) CampusBiteMotion.confetti(); } catch (e) {}
  }
  function refreshCart() { try { if (typeof renderCart === 'function') renderCart(); } catch (e) { console.error(e); } }

  /* ---------------- announcement banner + global switches ---------------- */
  function banner() {
    var el = $('cbAnnounce');
    var paused = cfg.ordering && cfg.ordering.enabled === false;
    var a = cfg.announcement || {};
    var show = paused || (a.enabled && a.text);
    if (!show) { if (el) el.remove(); return; }
    if (!el) {
      var h = document.querySelector('header'); if (!h) return;
      el = document.createElement('div'); el.id = 'cbAnnounce'; el.setAttribute('role', 'status');
      h.parentNode.insertBefore(el, h.nextSibling);
    }
    var lvl = paused ? 'bad' : a.level;
    var colors = { info: ['#eff6ff', '#1d4ed8'], warn: ['#fffbeb', '#b45309'], bad: ['#fef2f2', '#b91c1c'] }[lvl] || ['#eff6ff', '#1d4ed8'];
    el.style.cssText = 'background:' + colors[0] + ';color:' + colors[1] + ';padding:10px 16px;text-align:center;font-weight:800;font-size:14px;border-bottom:1px solid rgba(0,0,0,.06)';
    el.textContent = (paused ? '⏸️ ' + (cfg.ordering.message || 'Ordering is paused by the admin.') : '📢 ' + a.text);
  }
  var lastAnim = true;
  function applyGlobals() {
    banner();
    try {
      if (window.CampusBiteMotion && cfg.animations !== lastAnim) {
        CampusBiteMotion.setEnabled(cfg.animations !== false);
        lastAnim = cfg.animations !== false;
      }
    } catch (e) {}
    renderBox();
  }
  function changed() {
    applyGlobals();
    if (panelOpen) { renderPanel(); }
    refreshCart();
  }

  /* ---------------- guard "add to cart" ---------------- */
  if (typeof window.add === 'function') {
    var _add = window.add;
    window.add = function (id) {
      var f = arr('menu').filter(function (m) { return String(m.id) === String(id); })[0];
      var msg = guard(f && (f.shopId || 'main-canteen'));
      if (msg) { toast(msg); return false; }
      return _add.apply(this, arguments);
    };
  }

  /* ---------------- ADMIN: Master Control panel ---------------- */
  function sw(key, on, label) {
    return '<button type="button" role="switch" aria-checked="' + on + '" aria-label="' + esc(label) + '" data-sw="' + esc(key) + '" style="position:relative;width:52px;height:30px;border-radius:9999px;border:0;cursor:pointer;flex:none;transition:background .2s;background:' + (on ? '#10b981' : '#cbd5e1') + '"><span style="position:absolute;left:4px;top:4px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .2s;transform:translateX(' + (on ? 22 : 0) + 'px)"></span></button>';
  }
  function card(title, sub, body) {
    return '<div class="bg-white rounded-2xl border p-4 md:p-5"><div class="mb-3"><h3 class="text-lg font-black">' + title + '</h3>' + (sub ? '<p class="text-sm text-slate-500">' + sub + '</p>' : '') + '</div>' + body + '</div>';
  }
  function row(label, desc, ctl) {
    return '<div class="flex items-center justify-between gap-3 py-3 border-b last:border-0"><div><b>' + label + '</b>' + (desc ? '<p class="text-xs text-slate-500">' + desc + '</p>' : '') + '</div>' + ctl + '</div>';
  }
  function stat(label, val, cls) { return '<div class="rounded-2xl border p-3 bg-white"><p class="text-xs text-slate-500">' + label + '</p><b class="text-2xl ' + (cls || '') + '">' + val + '</b></div>'; }

  function renderStats() {
    var el = $('cbmStats'); if (!el) return;
    var menu = arr('menu'), th = cfg.lowStock;
    var low = menu.filter(function (x) { return (x.qty || 0) > 0 && (x.qty || 0) <= th; }).length;
    var out = menu.filter(function (x) { return !((x.qty || 0) > 0); }).length;
    var open = arr('reports').filter(function (r) { return r.status !== 'Closed' && r.status !== 'Resolved'; }).length;
    el.innerHTML = stat('Canteens', shops().length) + stat('Menu items', menu.length) + stat('Low stock (≤' + th + ')', low, 'text-amber-600') + stat('Sold out', out, 'text-red-600')
      + stat('Active orders', arr('orders').length) + stat('Students', arr('students').length) + stat('Owners', arr('owners').length) + stat('Open tickets', open, open ? 'text-red-600' : '');
  }
  function renderPanel() {
    var host = $('cbmBody'); if (!host) return;
    renderStats();
    var ordOn = cfg.ordering.enabled !== false;
    var mascotBtn = $('cbMascotSwitch');
    var mascotOn = mascotBtn ? mascotBtn.getAttribute('aria-checked') === 'true' : true;
    var controls = card('⚙️ Global controls', 'These apply to every student and shop owner instantly.',
      row('Accept orders', ordOn ? 'Students can order normally.' : 'PAUSED — nobody can add to cart or place orders.', sw('ordering', ordOn, 'Accept orders'))
      + (ordOn ? '' : '<div class="py-3"><input id="cbmPauseMsg" value="' + esc(cfg.ordering.message) + '" placeholder="Message shown to students (optional)" class="w-full border rounded-xl px-3 py-2 text-sm"></div>')
      + row('Coupons', 'Students can use coupon codes at checkout.', sw('coupons', cfg.couponsEnabled, 'Coupons'))
      + row('Animations', 'Interactive animations for everyone (students on reduced-motion stay off).', sw('animations', cfg.animations !== false, 'Animations'))
      + row('Fun mascots', 'Mascot characters with live updates.', sw('mascots', mascotOn, 'Mascots'))
      + row('Low-stock alert level', 'Mascots warn owners &amp; admin at or below this quantity.', '<input id="cbmLow" type="number" min="1" max="500" value="' + cfg.lowStock + '" class="w-20 border rounded-xl px-2 py-1.5 text-center font-bold">'));

    var shopRows = shops().map(function (s) {
      var items = arr('menu').filter(function (m) { return (m.shopId || 'main-canteen') === s.id; });
      var low = items.filter(function (x) { return (x.qty || 0) > 0 && (x.qty || 0) <= cfg.lowStock; }).length;
      var closed = !!cfg.closedShops[s.id];
      return row('🏪 ' + esc(s.name), items.length + ' items' + (low ? ' • <span class="text-amber-600 font-bold">' + low + ' low stock</span>' : '') + ' • ' + (closed ? '<span class="text-red-600 font-bold">CLOSED by admin</span>' : 'Open'), sw('shop:' + s.id, !closed, 'Open ' + s.name));
    }).join('');
    var canteens = card('🏪 Canteens', 'Close a canteen to stop new orders from it (existing orders continue).', shopRows || '<p class="text-sm text-slate-500">No canteens yet.</p>');

    var a = cfg.announcement;
    var ann = card('📢 Announcement banner', 'Shown at the top for every user.',
      row('Show banner', '', sw('announce', !!a.enabled, 'Show banner'))
      + '<div class="grid gap-2 mt-3"><input id="cbmAnnText" value="' + esc(a.text) + '" maxlength="140" placeholder="e.g. Canteen closes early today at 4 PM" class="w-full border rounded-xl px-3 py-2 text-sm">'
      + '<div class="flex gap-2"><select id="cbmAnnLevel" class="border rounded-xl px-3 py-2 text-sm"><option value="info"' + (a.level === 'info' ? ' selected' : '') + '>ℹ️ Info</option><option value="warn"' + (a.level === 'warn' ? ' selected' : '') + '>⚠️ Warning</option><option value="bad"' + (a.level === 'bad' ? ' selected' : '') + '>🚨 Urgent</option></select>'
      + '<button type="button" data-act="saveAnn" class="px-4 py-2 rounded-xl bg-slate-900 text-white font-black text-sm">Save banner</button></div></div>');

    var shopOpts = '<option value="">All canteens</option>' + shops().map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('');
    var cRows = cfg.coupons.map(function (c, i) {
      var off = c.type === 'flat' ? rs(c.value) + ' off' : c.value + '% off' + (c.max ? ' (max ' + rs(c.max) + ')' : '');
      var meta = [off, c.min ? 'min ' + rs(c.min) : '', c.shopId ? shopName(c.shopId) : 'All canteens', c.expires ? 'till ' + c.expires : 'no expiry', 'used ' + (c.used || 0) + (c.limit ? '/' + c.limit : '')].filter(Boolean).join(' • ');
      return '<div class="flex items-center justify-between gap-3 border rounded-xl p-3"><div><b class="tracking-wide">🎟️ ' + esc(c.code) + '</b><p class="text-xs text-slate-500">' + esc(meta) + '</p></div><div class="flex items-center gap-2">' + sw('coupon:' + i, c.active !== false, 'Coupon ' + c.code + ' active') + '<button type="button" data-act="delCoupon" data-i="' + i + '" class="px-3 py-2 rounded-lg bg-red-50 text-red-600 font-bold text-sm">Delete</button></div></div>';
    }).join('');
    var form = '<div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">'
      + '<input id="cpCode" maxlength="20" placeholder="CODE e.g. SAVE10" class="border rounded-xl px-3 py-2 text-sm uppercase col-span-2 md:col-span-1">'
      + '<select id="cpType" class="border rounded-xl px-3 py-2 text-sm"><option value="percent">% off</option><option value="flat">₹ off</option></select>'
      + '<input id="cpValue" type="number" min="1" placeholder="Value" class="border rounded-xl px-3 py-2 text-sm">'
      + '<input id="cpMin" type="number" min="0" placeholder="Min order ₹" title="Minimum cart value (0 = none)" class="border rounded-xl px-3 py-2 text-sm">'
      + '<input id="cpMax" type="number" min="0" placeholder="Max ₹ off" title="Maximum discount for % coupons (0 = no cap)" class="border rounded-xl px-3 py-2 text-sm">'
      + '<select id="cpShop" class="border rounded-xl px-3 py-2 text-sm">' + shopOpts + '</select>'
      + '<input id="cpExp" type="date" min="' + today() + '" class="border rounded-xl px-3 py-2 text-sm">'
      + '<input id="cpLimit" type="number" min="0" placeholder="Uses" title="Total times it can be used (0 = unlimited)" class="border rounded-xl px-3 py-2 text-sm">'
      + '</div><button type="button" data-act="addCoupon" class="w-full md:w-auto px-5 py-2.5 rounded-xl bg-orange-500 text-white font-black text-sm">+ Create coupon</button>';
    var coupons = card('🎟️ Coupons', 'Create discount codes students can apply in their cart.', form + '<div class="space-y-2 mt-4">' + (cRows || '<p class="text-sm text-slate-500">No coupons yet. Create one above.</p>') + '</div>');

    // keep typed text when re-rendering
    var keep = {}; ['cpCode', 'cpType', 'cpValue', 'cpMin', 'cpMax', 'cpShop', 'cpExp', 'cpLimit', 'cbmAnnText', 'cbmAnnLevel', 'cbmPauseMsg'].forEach(function (id) { var e = $(id); if (e) keep[id] = e.value; });
    host.innerHTML = '<div class="grid lg:grid-cols-2 gap-4">' + controls + canteens + '</div><div class="grid lg:grid-cols-2 gap-4 mt-4">' + coupons + ann + '</div>';
    Object.keys(keep).forEach(function (id) { var e = $(id); if (e) e.value = keep[id]; });
  }

  function onPanelClick(e) {
    var s = e.target.closest ? e.target.closest('[data-sw]') : null;
    if (s) {
      var k = s.getAttribute('data-sw');
      if (k === 'ordering') { cfg.ordering.enabled = !(cfg.ordering.enabled !== false); persist(cfg.ordering.enabled ? 'ordering resumed' : 'ordering paused'); }
      else if (k === 'coupons') { cfg.couponsEnabled = !cfg.couponsEnabled; persist('coupons ' + (cfg.couponsEnabled ? 'on' : 'off')); }
      else if (k === 'animations') { cfg.animations = !(cfg.animations !== false); persist('animations ' + (cfg.animations ? 'on' : 'off')); }
      else if (k === 'announce') { cfg.announcement.enabled = !cfg.announcement.enabled; persist('banner ' + (cfg.announcement.enabled ? 'on' : 'off')); }
      else if (k === 'mascots') { var b = $('cbMascotSwitch'); if (b) { b.click(); setTimeout(renderPanel, 400); } else { toast('Open this tab after the mascot card has loaded.'); } }
      else if (k.indexOf('shop:') === 0) { var id = k.slice(5); if (cfg.closedShops[id]) delete cfg.closedShops[id]; else cfg.closedShops[id] = true; persist(shopName(id) + (cfg.closedShops[id] ? ' closed' : ' opened')); }
      else if (k.indexOf('coupon:') === 0) { var c = cfg.coupons[+k.slice(7)]; if (c) { c.active = c.active === false; persist('coupon ' + c.code); } }
      return;
    }
    var a = e.target.closest ? e.target.closest('[data-act]') : null; if (!a) return;
    var act = a.getAttribute('data-act');
    if (act === 'delCoupon') { var i = +a.getAttribute('data-i'); var cc = cfg.coupons[i]; if (cc && confirm('Delete coupon ' + cc.code + '?')) { cfg.coupons.splice(i, 1); persist('coupon deleted'); } }
    if (act === 'saveAnn') { cfg.announcement.text = $('cbmAnnText').value.trim().slice(0, 140); cfg.announcement.level = $('cbmAnnLevel').value; if (cfg.announcement.text) cfg.announcement.enabled = true; persist('banner updated'); }
    if (act === 'addCoupon') addCoupon();
  }
  function addCoupon() {
    var code = $('cpCode').value.trim().toUpperCase(), type = $('cpType').value, value = Number($('cpValue').value);
    if (!/^[A-Z0-9]{3,20}$/.test(code)) { alert('Coupon code: 3–20 letters or numbers, no spaces.'); return; }
    if (findCoupon(code)) { alert('A coupon with this code already exists.'); return; }
    if (!(value > 0) || (type === 'percent' && value > 100)) { alert(type === 'percent' ? 'Enter a percentage between 1 and 100.' : 'Enter the rupee amount to take off.'); return; }
    cfg.coupons.push({
      code: code, type: type, value: value, min: Math.max(0, Number($('cpMin').value) || 0), max: type === 'percent' ? Math.max(0, Number($('cpMax').value) || 0) : 0,
      shopId: $('cpShop').value || '', expires: $('cpExp').value || '', limit: Math.max(0, Math.floor(Number($('cpLimit').value) || 0)), used: 0, active: true, createdAt: today()
    });
    ['cpCode', 'cpValue', 'cpMin', 'cpMax', 'cpExp', 'cpLimit'].forEach(function (id) { $(id).value = ''; });
    persist('coupon ' + code + ' created');
  }
  function onPanelChange(e) {
    if (e.target.id === 'cbmLow') { var n = Math.max(1, Math.min(500, Math.floor(Number(e.target.value) || 10))); cfg.lowStock = n; persist('low-stock level ' + n); }
    if (e.target.id === 'cbmPauseMsg') { cfg.ordering.message = e.target.value.trim().slice(0, 140); persist('pause message'); }
  }

  var BTN = 'adminMasterBtn', SEC = 'adminMasterSection';
  function mountAdmin() {
    var menuBtn = $('adminMenuBtn'), menuSec = $('adminMenuSection');
    if (!menuBtn || !menuSec || $(BTN)) return;
    var b = document.createElement('button');
    b.id = BTN; b.className = 'admin-section-btn px-4 py-2 rounded-xl bg-orange-500 text-white font-bold text-sm'; b.textContent = '👑 Master Control';
    menuBtn.parentNode.insertBefore(b, menuBtn.parentNode.firstChild);
    var s = document.createElement('section');
    s.id = SEC; s.className = 'hidden'; s.style.display = 'none';
    s.innerHTML = '<div class="flex flex-wrap items-center justify-between gap-2 mb-4"><div><h3 class="text-2xl font-black">👑 Master Control</h3><p class="text-sm text-slate-500">Control the whole canteen app from one place.</p></div><p id="cbmStatus" class="text-sm font-bold" role="status"></p></div>'
      + '<div id="cbmStats" class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4"></div><div id="cbmBody"></div>';
    menuSec.parentNode.insertBefore(s, menuSec);
    s.addEventListener('click', onPanelClick);
    s.addEventListener('change', onPanelChange);
    b.addEventListener('click', openPanel);

    if (typeof window.openAdminSection === 'function') {
      var orig = window.openAdminSection;
      window.openAdminSection = function (section) {
        if (section === 'master') return openPanel();
        closePanel();
        return orig.apply(this, arguments);
      };
    }
    setInterval(function () { if (panelOpen && document.visibilityState === 'visible') renderStats(); }, 4000);
  }
  function openPanel() {
    if (role() !== 'admin') return false;
    var ids = ['adminMenuSection', 'adminHistorySection', 'adminOwnersSection', 'adminStudentsSection', 'adminAdminsSection', 'adminServiceSection', 'adminReportsSection'];
    ids.forEach(function (id) { var el = $(id); if (el) { el.classList.add('hidden'); el.style.display = 'none'; } });
    var s = $(SEC); s.classList.remove('hidden'); s.style.display = 'block';
    document.querySelectorAll('.admin-section-btn').forEach(function (x) { x.classList.remove('bg-slate-900', 'text-white', 'bg-orange-500'); x.classList.add('bg-white', 'border'); });
    var b = $(BTN); b.classList.remove('bg-white', 'border'); b.classList.add('bg-slate-900', 'text-white');
    panelOpen = true; renderPanel();
    try { if (typeof replayAnimation === 'function') replayAnimation(s, 'admin-section-enter'); } catch (e) {}
    return true;
  }
  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    var s = $(SEC); if (s) { s.classList.add('hidden'); s.style.display = 'none'; }
    var b = $(BTN); if (b) { b.classList.remove('bg-slate-900', 'text-white'); b.classList.add('bg-orange-500', 'text-white'); }
  }

  /* ---------------- boot ---------------- */
  function boot() {
    mountAdmin(); startWhenSignedIn(); applyGlobals();
    // when the shared cart/menu re-renders the checkout area is the same node, so nothing else is needed
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  window.CBMaster = {
    get config() { return cfg; },
    lowStock: function () { return cfg.lowStock; },
    guard: guard, discountFor: discountFor, consume: consume, afterOrder: afterOrder,
    renderCouponBox: renderBox, orderingAllowed: function (shopId) { return !guard(shopId); }
  };
})();
