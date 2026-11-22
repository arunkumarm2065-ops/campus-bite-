/* ==========================================================================
   CampusBite Wallet — wallet.js
   • STUDENT : 👛 balance chip in the header → wallet panel (add money, history).
               "Campus Wallet" at checkout now really pays from this balance.
   • ADMIN   : 👛 Wallet tab → every student's balance, a live ledger of all
               top-ups / payments / refunds (click an order # to see the customer),
               and "refund due" list for cancelled wallet orders.
   Data (Cloud Firestore, same project/app as index.html):
       wallets/{studentUid}   { balance, studentId, studentName, updatedAt }
       walletTxns/{autoId}    { studentId, studentName, type, amount, balanceAfter,
                                orderId, token, note, createdAt, createdBy, createdByRole }
   Payments are written by index.html's placeOrder in ONE transaction together with
   the order, so a balance can never change without a ledger line.

   Load AFTER the main inline scripts (see index.html bottom).
   ========================================================================== */
(function () {
  'use strict';
  if (window.CBWallet) return;

  /* ---------- settings ---------- */
  // DEMO SWITCH: there is no payment gateway in this project, so students can top up their own
  // wallet for testing. Set to false for real use (then only admins add money) and also set
  // demoTopUpAllowed() to false in firestore.rules.
  var ALLOW_STUDENT_TOPUP = true;
  var TOPUP_MAX = 2000;       // per top-up
  var BALANCE_MAX = 5000;     // wallet ceiling
  var QUICK_AMOUNTS = [50, 100, 200, 500];

  /* ---------- tiny helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function role() { try { return typeof currentRole === 'string' ? currentRole : ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rs(n) { return '₹' + (Math.round(Number(n || 0) * 100) / 100); }
  function r2(n) { return Math.round(Number(n || 0) * 100) / 100; }
  function toast(m) { try { if (typeof showToast === 'function') return showToast(m); } catch (e) {} alert(m); }
  function db() { return window.firebase && firebase.apps && firebase.apps.length ? firebase.firestore() : null; }
  function me() { return window.firebase && firebase.apps && firebase.apps.length ? firebase.auth().currentUser : null; }
  function myName() {
    try { return (currentUser && (currentUser.name || currentUser.username)) || (me() && (me().displayName || me().email)) || 'Student'; } catch (e) { return 'Student'; }
  }
  function when(v) {
    var d = v && v.toDate ? v.toDate() : (v instanceof Date ? v : (v ? new Date(v) : null));
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
  function ms(v) { var d = v && v.toDate ? v.toDate() : (v ? new Date(v) : null); return d && !isNaN(d.getTime()) ? d.getTime() : 0; }
  function isToday(v) { var t = ms(v); if (!t) return false; var a = new Date(t), b = new Date(); return a.toDateString() === b.toDateString(); }
  function errText(e) {
    if (e && e.code === 'permission-denied') return 'Firestore blocked this wallet action. Publish the updated firestore.rules (wallets + walletTxns) and try again.';
    return (e && e.message) || 'Something went wrong. Please try again.';
  }

  var TYPE = {
    topup:        { label: 'Top-up',      icon: '➕', cls: 'bg-emerald-50 text-emerald-700', sign: 1 },
    admin_credit: { label: 'Added by admin', icon: '🛡️', cls: 'bg-emerald-50 text-emerald-700', sign: 1 },
    refund:       { label: 'Refund',      icon: '↩️', cls: 'bg-sky-50 text-sky-700', sign: 1 },
    payment:      { label: 'Payment',     icon: '🍽️', cls: 'bg-orange-50 text-orange-700', sign: -1 }
  };

  /* ---------- state ---------- */
  var S = { balance: 0, loaded: false, txns: [], wallets: [], allTxns: [], cancelled: [] };
  var unsubs = [], liveFor = '';   // liveFor = "role:uid" the listeners belong to

  function stopLive() { unsubs.forEach(function (f) { try { f(); } catch (e) {} }); unsubs = []; liveFor = ''; S.balance = 0; S.loaded = false; S.txns = []; S.wallets = []; S.allTxns = []; S.cancelled = []; }

  function startLive() {
    var r = role(), u = me(), d = db();
    var key = (r && u && d) ? r + ':' + u.uid : '';
    if (key === liveFor) return;
    stopLive();
    if (!key || (r !== 'student' && r !== 'admin')) { refreshAll(); return; }
    liveFor = key;
    var onErr = function (what) { return function (e) { console.error('Wallet listener (' + what + ') failed:', e); }; };
    if (r === 'student') {
      unsubs.push(d.collection('wallets').doc(u.uid).onSnapshot(function (s) {
        S.balance = s.exists ? Number(s.data().balance || 0) : 0; S.loaded = true; refreshAll();
      }, onErr('wallet')));
      unsubs.push(d.collection('walletTxns').where('studentId', '==', u.uid).onSnapshot(function (s) {
        S.txns = s.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; }).sort(function (a, b) { return ms(b.createdAt) - ms(a.createdAt); });
        refreshAll();
      }, onErr('transactions')));
    } else {
      unsubs.push(d.collection('wallets').onSnapshot(function (s) {
        S.wallets = s.docs.map(function (x) { var o = x.data(); o.uid = x.id; return o; }); S.loaded = true; refreshAll();
      }, onErr('wallets')));
      unsubs.push(d.collection('walletTxns').orderBy('createdAt', 'desc').limit(300).onSnapshot(function (s) {
        S.allTxns = s.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; }); refreshAll();
      }, onErr('ledger')));
      unsubs.push(d.collection('orders').where('status', '==', 'Cancelled').onSnapshot(function (s) {
        S.cancelled = s.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; }); refreshAll();
      }, onErr('cancelled orders')));
    }
  }

  /* ======================================================================
     MONEY MOVEMENT (top-up, admin credit, refund). Payments live in placeOrder.
     ====================================================================== */
  function writeCredit(studentUid, studentName, amount, type, note, extra) {
    var d = db(), u = me();
    if (!d || !u) return Promise.reject(new Error('Please sign in first.'));
    amount = r2(amount);
    if (!(amount > 0)) return Promise.reject(new Error('Enter an amount greater than zero.'));
    var wref = d.collection('wallets').doc(studentUid), tref = d.collection('walletTxns').doc();
    return d.runTransaction(function (tx) {
      var reads = [tx.get(wref)];
      if (extra && extra.orderRef) reads.push(tx.get(extra.orderRef));
      return Promise.all(reads).then(function (snaps) {
        var ws = snaps[0], os = snaps[1];
        if (os && os.exists && os.data().walletRefunded) throw new Error('This order was already refunded to the wallet.');
        var bal = ws.exists ? Number(ws.data().balance || 0) : 0, nb = r2(bal + amount);
        if (role() === 'student' && nb > BALANCE_MAX) throw new Error('Wallet limit is ' + rs(BALANCE_MAX) + '. You can add up to ' + rs(Math.max(0, BALANCE_MAX - bal)) + ' more.');
        var stamp = firebase.firestore.FieldValue.serverTimestamp();
        tx.set(wref, { balance: nb, studentId: studentUid, studentName: studentName, updatedAt: stamp }, { merge: true });
        tx.set(tref, {
          studentId: studentUid, studentName: studentName, type: type, amount: amount, balanceAfter: nb,
          orderId: (extra && extra.orderId) || '', token: (extra && extra.token) || '', note: note || '',
          createdAt: stamp, createdBy: u.uid, createdByRole: role(), createdByName: myName()
        });
        if (extra && extra.orderRef) {
          var upd = { walletRefunded: true, walletRefundedAt: stamp, updatedAt: stamp };
          if (extra.newStatus) upd.status = extra.newStatus;
          tx.update(extra.orderRef, upd);
        }
        return nb;
      });
    });
  }

  function studentTopUp(amount) {
    var u = me();
    if (!ALLOW_STUDENT_TOPUP) return Promise.reject(new Error('Top-ups are handled by the canteen admin.'));
    amount = Math.floor(Number(amount));
    if (!(amount >= 1) || amount > TOPUP_MAX) return Promise.reject(new Error('Enter an amount between ₹1 and ' + rs(TOPUP_MAX) + '.'));
    return writeCredit(u.uid, myName(), amount, 'topup', 'Wallet top-up (demo payment)');
  }

  function adminCredit(studentUid, studentName, amount) {
    if (role() !== 'admin') return Promise.reject(new Error('Only admins can do this.'));
    amount = Math.floor(Number(amount));
    if (!(amount >= 1) || amount > 5000) return Promise.reject(new Error('Enter an amount between ₹1 and ₹5000.'));
    return writeCredit(studentUid, studentName, amount, 'admin_credit', 'Added by ' + myName());
  }

  /* Refund an order's money back to the student's wallet (admin only). Safe to call twice. */
  function walletRefund(order, opts) {
    opts = opts || {};
    var d = db();
    var method = String(order.paymentMethod || order.payment || '');
    if (role() !== 'admin' || !d || !order || !order.id || !order.studentId) return Promise.resolve(false);
    if (method !== 'Campus Wallet' || order.walletRefunded) return Promise.resolve(false);
    var amt = r2(order.total);
    if (!(amt > 0)) return Promise.resolve(false);
    return writeCredit(order.studentId, order.studentName || 'Student', amt, 'refund',
      (order.status === 'Cancelled' ? 'Cancelled order ' : 'Refund for ') + (order.token || ''),
      { orderId: order.id, token: order.token || '', orderRef: d.collection('orders').doc(order.id), newStatus: order.status === 'Cancelled' ? '' : 'Refunded' })
      .then(function () { return true; });
  }

  /* The admin's existing "Refund" button: keep its behaviour, and also return wallet money. */
  (function wrapRefund() {
    if (typeof window.refundOrder !== 'function') return;
    var orig = window.refundOrder;
    window.refundOrder = function (token) {
      var list = (typeof orderHistory !== 'undefined' && Array.isArray(orderHistory)) ? orderHistory : [];
      var h = list.filter(function (o) { return o.token === token; })[0];
      var before = h && h.status;
      var out = orig.apply(this, arguments);
      if (h && before !== 'Refunded' && h.status === 'Refunded') {
        walletRefund(h).then(function (done) { if (done) toast('Refunded ' + rs(h.total) + ' to ' + (h.studentName || 'the student') + "'s wallet"); })
          .catch(function (e) { console.error(e); alert('The order was marked refunded, but the wallet credit failed: ' + errText(e)); });
      }
      return out;
    };
  })();

  /* ======================================================================
     STUDENT UI
     ====================================================================== */
  var chip, modal;
  function mountChip() {
    if ($('walletBtn')) { chip = $('walletBtn'); return; }
    var cart = $('cartBtn'); if (!cart || !cart.parentNode) return;
    chip = document.createElement('button');
    chip.id = 'walletBtn'; chip.type = 'button'; chip.className = 'hidden px-3 py-2 rounded-xl bg-orange-50 text-orange-600 font-black text-sm whitespace-nowrap';
    chip.setAttribute('aria-label', 'Open my wallet');
    chip.innerHTML = '👛 <span id="walletChipAmt">₹0</span>';
    chip.addEventListener('click', openModal);
    cart.parentNode.insertBefore(chip, cart);
  }

  function mountModal() {
    if ($('walletModal')) { modal = $('walletModal'); return; }
    modal = document.createElement('div');
    modal.id = 'walletModal';
    modal.className = 'hidden fixed inset-0 z-[85] modal-backdrop grid place-items-center p-4';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'walletTitle');
    modal.innerHTML =
      '<section class="modal-shell bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">'
      + '<div class="flex items-center justify-between mb-4"><h2 id="walletTitle" class="text-xl font-black">👛 My Campus Wallet</h2>'
      + '<button type="button" id="walletClose" class="w-9 h-9 rounded-xl bg-slate-100" aria-label="Close wallet">×</button></div>'
      + '<div class="rounded-2xl bg-slate-900 text-white p-5"><p class="text-xs text-slate-300 font-bold uppercase tracking-wider">Available balance</p>'
      + '<p id="walletBal" class="text-4xl font-black mt-1">₹0</p><p class="text-xs text-slate-400 mt-1">Pay for orders instantly at checkout.</p></div>'
      + '<div id="walletTopArea" class="mt-4"></div>'
      + '<h3 class="font-black mt-5 mb-2">Recent activity</h3><div id="walletHist" class="space-y-2"></div>'
      + '</section>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.id === 'walletClose') return closeModal();
      var q = e.target.closest && e.target.closest('[data-quick]');
      if (q) { $('walletAmt').value = q.getAttribute('data-quick'); return; }
      if (e.target.id === 'walletAddBtn') doTopUp(e.target);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
  }
  function openModal() { if (role() !== 'student') return; mountModal(); renderModal(); modal.classList.remove('hidden'); }
  function closeModal() { if (modal) modal.classList.add('hidden'); }

  function doTopUp(btn) {
    var inp = $('walletAmt'), st = $('walletTopStatus');
    btn.disabled = true; st.textContent = 'Adding…'; st.className = 'text-xs font-bold mt-2 text-slate-500';
    studentTopUp(inp.value).then(function (nb) {
      inp.value = ''; st.textContent = 'Added! New balance ' + rs(nb); st.className = 'text-xs font-bold mt-2 text-emerald-600';
      toast('Wallet updated: ' + rs(nb));
    }).catch(function (e) { st.textContent = errText(e); st.className = 'text-xs font-bold mt-2 text-red-600'; })
      .then(function () { btn.disabled = false; });
  }

  function renderModal() {
    if (!modal || modal.classList.contains('hidden') && !$('walletBal')) return;
    $('walletBal').textContent = rs(S.balance);
    var top = $('walletTopArea');
    if (ALLOW_STUDENT_TOPUP) {
      if (!$('walletAmt')) {
        top.innerHTML = '<p class="text-sm font-black mb-2">Add money</p>'
          + '<div class="flex flex-wrap gap-2 mb-2">' + QUICK_AMOUNTS.map(function (a) { return '<button type="button" data-quick="' + a + '" class="px-3 py-2 rounded-xl bg-orange-50 text-orange-700 font-bold text-sm">+₹' + a + '</button>'; }).join('') + '</div>'
          + '<div class="flex gap-2"><input id="walletAmt" type="number" min="1" max="' + TOPUP_MAX + '" step="1" inputmode="numeric" placeholder="Amount (₹)" class="flex-1 border rounded-xl px-3 py-2">'
          + '<button type="button" id="walletAddBtn" class="px-4 py-2 rounded-xl bg-orange-500 text-white font-black">Add</button></div>'
          + '<p id="walletTopStatus" class="text-xs font-bold mt-2 text-slate-500" role="status"></p>'
          + '<p class="text-[11px] text-slate-400 mt-1">Demo wallet: no real money is charged. Limit ' + rs(TOPUP_MAX) + ' per top-up, ' + rs(BALANCE_MAX) + ' in total.</p>';
      }
    } else {
      top.innerHTML = '<p class="rounded-xl bg-slate-50 border p-3 text-sm text-slate-600">To add money, visit the canteen counter. The admin will credit your wallet and it will show here instantly.</p>';
    }
    var h = $('walletHist');
    if (!S.txns.length) { h.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">No wallet activity yet.</p>'; return; }
    h.innerHTML = S.txns.slice(0, 40).map(function (t) {
      var T = TYPE[t.type] || { label: t.type, icon: '•', cls: 'bg-slate-100 text-slate-600', sign: 1 };
      var plus = T.sign > 0;
      return '<div class="flex items-center gap-3 border rounded-xl p-3"><span class="w-9 h-9 rounded-xl grid place-items-center ' + T.cls + '">' + T.icon + '</span>'
        + '<div class="flex-1 min-w-0"><p class="font-bold text-sm">' + esc(T.label) + (t.token ? ' • ' + esc(t.token) : '') + '</p><p class="text-xs text-slate-400">' + esc(when(t.createdAt)) + '</p></div>'
        + '<div class="text-right"><p class="font-black ' + (plus ? 'text-emerald-600' : 'text-slate-900') + '">' + (plus ? '+' : '−') + rs(t.amount) + '</p><p class="text-[11px] text-slate-400">Bal ' + rs(t.balanceAfter) + '</p></div></div>';
    }).join('');
  }

  /* checkout: show the balance on the Campus Wallet option + a warning if it is not enough */
  function updateCart() {
    var radio = document.querySelector('input[name="pay"][value="wallet"]'); if (!radio) return;
    var label = radio.closest('label'), small = label && label.querySelector('small');
    var isStudent = role() === 'student';
    if (small && isStudent) small.textContent = S.loaded ? 'Balance ' + rs(S.balance) : 'Checking balance…';
    var note = $('walletCartNote');
    var grid = label && label.parentNode;
    if (!note && grid) {
      note = document.createElement('div'); note.id = 'walletCartNote'; note.className = 'hidden text-xs font-bold rounded-xl bg-red-50 text-red-700 p-3 mt-2';
      grid.parentNode.insertBefore(note, grid.nextSibling);
    }
    if (!note) return;
    var total = Number(String(($('total') || {}).textContent || '').replace(/[^0-9.]/g, '')) || 0;
    var chosen = document.querySelector('input[name="pay"]:checked');
    var short = isStudent && S.loaded && chosen && chosen.value === 'wallet' && total > S.balance;
    note.classList.toggle('hidden', !short);
    if (short) {
      note.innerHTML = 'Your wallet has ' + rs(S.balance) + ' but this order is ' + rs(total) + '. '
        + '<button type="button" id="walletCartAdd" class="underline font-black">' + (ALLOW_STUDENT_TOPUP ? 'Add money' : 'View wallet') + '</button>';
      var b = $('walletCartAdd'); if (b) b.onclick = function () { openModal(); };
    }
  }

  (function wrapCart() {
    if (typeof window.renderCart !== 'function') return;
    var orig = window.renderCart;
    window.renderCart = function () { var r = orig.apply(this, arguments); try { updateCart(); } catch (e) {} return r; };
    document.addEventListener('change', function (e) { if (e.target && e.target.name === 'pay') updateCart(); });
  })();

  /* ======================================================================
     ADMIN UI
     ====================================================================== */
  var BTN = 'adminWalletBtn', SEC = 'adminWalletSection', ledgerFilter = { q: '', type: 'all' };

  function mountAdmin() {
    if ($(BTN)) return;
    var hist = $('adminHistoryBtn'), histSec = $('adminHistorySection');
    if (!hist || !histSec) return;
    var b = document.createElement('button');
    b.id = BTN; b.type = 'button'; b.className = 'admin-section-btn px-4 py-2 rounded-xl bg-white border font-bold text-sm'; b.textContent = '👛 Wallet';
    hist.parentNode.insertBefore(b, hist.nextSibling);
    var s = document.createElement('section');
    s.id = SEC; s.className = 'hidden mt-5'; s.style.display = 'none';
    s.innerHTML =
      '<div class="bg-white rounded-2xl border p-4 md:p-5">'
      + '<div class="mb-4"><h3 class="text-xl font-black">Wallet Monitor</h3><p class="text-sm text-slate-500">Live view of student wallet balances and every top-up, payment and refund.</p></div>'
      + '<div id="cbwStats" class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"></div>'
      + '<div id="cbwRefunds"></div>'
      + '<h4 class="font-black mb-2">Student wallets</h4><div id="cbwWallets" class="space-y-2 mb-6"></div>'
      + '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3"><h4 class="font-black">Transaction ledger</h4>'
      + '<div class="flex gap-2"><input id="cbwSearch" type="search" placeholder="Search student, order # or note…" class="border rounded-xl px-3 py-2 text-sm w-full sm:w-64">'
      + '<select id="cbwType" class="border rounded-xl px-3 py-2 text-sm font-bold" aria-label="Filter by type"><option value="all">All</option><option value="payment">Payments</option><option value="topup">Top-ups</option><option value="admin_credit">Admin credits</option><option value="refund">Refunds</option></select></div></div>'
      + '<div class="overflow-x-auto"><table class="w-full text-sm min-w-[760px]"><thead><tr class="border-b text-left text-slate-500"><th class="py-3">Time</th><th>Student</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Order</th><th>Note</th></tr></thead><tbody id="cbwLedger"></tbody></table></div>'
      + '<p id="cbwEmpty" class="hidden text-center text-slate-400 py-6">No wallet transactions match.</p>'
      + '</div>';
    histSec.parentNode.insertBefore(s, histSec);

    b.addEventListener('click', openAdmin);
    s.addEventListener('input', function (e) {
      if (e.target.id === 'cbwSearch') { ledgerFilter.q = e.target.value.toLowerCase(); renderLedger(); }
    });
    s.addEventListener('change', function (e) { if (e.target.id === 'cbwType') { ledgerFilter.type = e.target.value; renderLedger(); } });
    s.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-order]');
      if (t) { if (window.CBOrderTools) CBOrderTools.openOrder(t.getAttribute('data-order')); return; }
      var c = e.target.closest && e.target.closest('[data-credit]');
      if (c) return creditClick(c);
      var r = e.target.closest && e.target.closest('[data-refund]');
      if (r) return refundClick(r);
    });

    // any other admin tab hides this one
    document.addEventListener('click', function (e) {
      var o = e.target.closest && e.target.closest('.admin-section-btn');
      if (o && o.id !== BTN) hideAdmin();
    });
    if (typeof window.openAdminSection === 'function') {
      var orig = window.openAdminSection;
      window.openAdminSection = function () { hideAdmin(); return orig.apply(this, arguments); };
    }
  }
  function hideAdmin() { var s = $(SEC); if (s) { s.classList.add('hidden'); s.style.display = 'none'; } }
  function openAdmin() {
    if (role() !== 'admin') return;
    var v = $('adminView');
    Array.prototype.forEach.call(v.children, function (el) { if (el.tagName === 'SECTION' && el.id !== SEC) { el.classList.add('hidden'); el.style.display = 'none'; } });
    document.querySelectorAll('.admin-section-btn').forEach(function (x) { x.classList.remove('bg-slate-900', 'text-white', 'bg-orange-500'); x.classList.add('bg-white', 'border'); });
    var b = $(BTN); b.classList.remove('bg-white', 'border'); b.classList.add('bg-slate-900', 'text-white');
    var s = $(SEC); s.classList.remove('hidden'); s.style.display = 'block';
    try { if (typeof replayAnimation === 'function') replayAnimation(s, 'admin-section-enter'); } catch (e) {}
    startLive(); renderAdmin();
  }

  function creditClick(btn) {
    var uid = btn.getAttribute('data-credit'), name = btn.getAttribute('data-name');
    var inp = document.querySelector('[data-amt="' + uid + '"]'), amt = inp ? inp.value : '';
    btn.disabled = true;
    adminCredit(uid, name, amt).then(function (nb) { toast('Added to ' + name + "'s wallet. New balance " + rs(nb)); if (inp) inp.value = ''; })
      .catch(function (e) { alert(errText(e)); }).then(function () { btn.disabled = false; });
  }
  function refundClick(btn) {
    var id = btn.getAttribute('data-refund');
    var o = S.cancelled.filter(function (x) { return x.id === id; })[0]; if (!o) return;
    if (!confirm('Refund ' + rs(o.total) + ' to ' + (o.studentName || 'the student') + "'s wallet for cancelled order " + (o.token || '') + '?')) return;
    btn.disabled = true;
    walletRefund(o).then(function (ok) { toast(ok ? 'Refunded to wallet' : 'Nothing to refund'); })
      .catch(function (e) { alert(errText(e)); }).then(function () { btn.disabled = false; });
  }

  function studentList() {
    var map = {};
    S.wallets.forEach(function (w) { map[w.uid] = { uid: w.uid, name: w.studentName || 'Student', balance: Number(w.balance || 0) }; });
    try {
      (typeof students !== 'undefined' && Array.isArray(students) ? students : []).forEach(function (st) {
        var id = st.uid || st.authUid; if (!id) return;
        if (!map[id]) map[id] = { uid: id, name: st.name || st.username || 'Student', balance: 0 };
        else if (!map[id].name || map[id].name === 'Student') map[id].name = st.name || st.username || map[id].name;
      });
    } catch (e) {}
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function pendingRefunds() {
    return S.cancelled.filter(function (o) { return String(o.paymentMethod || '') === 'Campus Wallet' && !o.walletRefunded && Number(o.total) > 0 && o.studentId; });
  }

  function renderAdmin() {
    var s = $(SEC); if (!s || s.classList.contains('hidden') || role() !== 'admin') return;
    var held = S.wallets.reduce(function (a, w) { return a + Number(w.balance || 0); }, 0);
    var spentToday = 0, addedToday = 0;
    S.allTxns.forEach(function (t) {
      if (!isToday(t.createdAt)) return;
      if (t.type === 'payment') spentToday += Number(t.amount || 0);
      else if (t.type === 'topup' || t.type === 'admin_credit') addedToday += Number(t.amount || 0);
    });
    var card = function (label, val, cls) { return '<div class="dashboard-stat-card bg-white rounded-2xl border p-4"><p class="text-xs text-slate-500">' + label + '</p><b class="text-2xl ' + (cls || '') + '">' + val + '</b></div>'; };
    $('cbwStats').innerHTML = card('Money held in wallets', rs(held)) + card('Wallets', S.wallets.length) + card('Spent today', rs(spentToday), 'text-orange-600') + card('Added today', rs(addedToday), 'text-emerald-600');

    var pr = pendingRefunds();
    $('cbwRefunds').innerHTML = pr.length
      ? '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-5"><h4 class="font-black text-amber-800 mb-2">Refunds due (' + pr.length + ')</h4><p class="text-xs text-amber-700 mb-3">These wallet orders were cancelled but the money has not been returned yet.</p><div class="space-y-2">'
        + pr.map(function (o) {
          return '<div class="flex items-center justify-between gap-3 bg-white rounded-xl border p-3"><div class="min-w-0"><b>' + esc(o.token || '') + '</b> • ' + esc(o.studentName || 'Student') + '<p class="text-xs text-slate-500">' + rs(o.total) + (o.cancelReason ? ' • ' + esc(o.cancelReason) : '') + '</p></div>'
            + '<button type="button" data-refund="' + esc(o.id) + '" class="px-3 py-2 rounded-xl bg-slate-900 text-white font-bold text-sm whitespace-nowrap">Refund to wallet</button></div>';
        }).join('') + '</div></div>'
      : '';

    var list = studentList();
    $('cbwWallets').innerHTML = list.length ? list.map(function (st) {
      return '<div class="flex flex-wrap items-center justify-between gap-3 border rounded-xl p-3"><div><b>' + esc(st.name) + '</b><p class="text-xs text-slate-500">Balance <b class="text-slate-900">' + rs(st.balance) + '</b></p></div>'
        + '<div class="flex items-center gap-2"><input data-amt="' + esc(st.uid) + '" type="number" min="1" max="5000" step="1" inputmode="numeric" placeholder="₹" aria-label="Amount to add for ' + esc(st.name) + '" class="w-24 border rounded-lg px-2 py-1.5 text-sm">'
        + '<button type="button" data-credit="' + esc(st.uid) + '" data-name="' + esc(st.name) + '" class="px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 font-bold text-sm">+ Add money</button></div></div>';
    }).join('') : '<p class="text-sm text-slate-400">No student wallets yet. They appear as soon as a student adds money, or after you create student accounts.</p>';
    renderLedger();
  }

  function renderLedger() {
    var body = $('cbwLedger'); if (!body) return;
    var q = ledgerFilter.q, ty = ledgerFilter.type;
    var rows = S.allTxns.filter(function (t) {
      if (ty !== 'all' && t.type !== ty) return false;
      return !q || (String(t.studentName || '') + ' ' + String(t.token || '') + ' ' + String(t.note || '')).toLowerCase().indexOf(q) >= 0;
    });
    $('cbwEmpty').classList.toggle('hidden', rows.length > 0);
    body.innerHTML = rows.map(function (t) {
      var T = TYPE[t.type] || { label: t.type, icon: '•', cls: 'bg-slate-100 text-slate-600', sign: 1 }, plus = T.sign > 0;
      return '<tr class="history-row border-b last:border-0"><td class="py-3 text-xs text-slate-500 whitespace-nowrap">' + esc(when(t.createdAt)) + '</td>'
        + '<td class="font-bold">' + esc(t.studentName || 'Student') + '</td>'
        + '<td><span class="px-2 py-1 rounded-full text-xs font-bold ' + T.cls + '">' + T.icon + ' ' + esc(T.label) + '</span></td>'
        + '<td class="font-black ' + (plus ? 'text-emerald-600' : 'text-red-600') + '">' + (plus ? '+' : '−') + rs(t.amount) + '</td>'
        + '<td>' + rs(t.balanceAfter) + '</td>'
        + '<td>' + (t.token ? '<button type="button" data-order="' + esc(t.token) + '" class="font-black text-orange-600 underline decoration-dotted">' + esc(t.token) + '</button>' : '<span class="text-slate-300">—</span>') + '</td>'
        + '<td class="text-xs text-slate-500">' + esc(t.note || '') + '</td></tr>';
    }).join('');
  }

  /* ======================================================================
     wiring
     ====================================================================== */
  function refreshAll() {
    var r = role(), isStudent = r === 'student';
    mountChip();
    if (chip) {
      chip.classList.toggle('hidden', !isStudent);
      var amt = $('walletChipAmt'); if (amt) amt.textContent = S.loaded ? rs(S.balance) : '…';
    }
    if (modal && !modal.classList.contains('hidden')) renderModal();
    if (isStudent) updateCart();
    if (r === 'admin') renderAdmin();
    if (!isStudent) closeModal();
  }

  function sync() { mountChip(); mountAdmin(); startLive(); refreshAll(); }

  function boot() {
    mountChip(); mountAdmin();
    ['loginView', 'logoutBtn'].forEach(function (id) {
      var el = $(id); if (el && window.MutationObserver) new MutationObserver(function () { setTimeout(sync, 50); }).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    if (window.firebase && firebase.apps && firebase.apps.length) firebase.auth().onAuthStateChanged(function () { setTimeout(sync, 200); });
    setInterval(sync, 3000);      // cheap safety net (e.g. role changes without a class change)
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  window.CBWallet = {
    get balance() { return S.balance; },
    get loaded() { return S.loaded; },
    open: openModal,
    refresh: refreshAll,
    allowTopUp: ALLOW_STUDENT_TOPUP
  };
})();
