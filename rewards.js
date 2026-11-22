/* ==========================================================================
   CampusBite Milestone Rewards — rewards.js
   ADMIN   ▸ 🏆 Rewards tab: create / edit / switch off / delete milestones and watch the claims.
   STUDENT ▸ 🏆 button in the header: progress bars and a Claim button. The bonus goes into the
             Campus Wallet (ledger type "reward").
   Firestore:  rewardMilestones/{id}  { title, metric: 'orders'|'spend', target, bonus, period: 'month'|'lifetime', active }
               rewardClaims/{uid_milestoneId_period}  (written only by the claimReward Cloud Function)
   Load after wallet.js and cb-functions.js.
   ========================================================================== */
(function () {
  'use strict';
  if (window.CBRewards) return;

  function $(id) { return document.getElementById(id); }
  function role() { try { return typeof currentRole === 'string' ? currentRole : ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rs(n) { return '₹' + (Math.round(Number(n || 0) * 100) / 100); }
  function toast(m) { try { if (typeof showToast === 'function') return showToast(m); } catch (e) {} alert(m); }
  function db() { return window.firebase && firebase.apps && firebase.apps.length ? firebase.firestore() : null; }
  function me() { return window.firebase && firebase.apps && firebase.apps.length ? firebase.auth().currentUser : null; }
  function ms(v) { var d = v && v.toDate ? v.toDate() : (v ? new Date(v) : null); return d && !isNaN(d.getTime()) ? d.getTime() : 0; }
  function when(v) { var t = ms(v); return t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''; }
  function errText(e) { return e && e.code === 'permission-denied' ? 'Firestore blocked this. Publish the updated firestore.rules and try again.' : ((e && e.message) || 'Something went wrong.'); }

  /* India calendar month, same rule as the Cloud Function */
  function monthKey(t) { var d = new Date((t == null ? Date.now() : t) + 330 * 60000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
  function describe(m) {
    var base = m.metric === 'spend' ? 'Spend ' + rs(m.target) : 'Complete ' + m.target + (Number(m.target) === 1 ? ' order' : ' orders');
    return base + (m.period === 'month' ? ' in a month' : ' (one-time)');
  }

  /* ---------- live data ---------- */
  var S = { milestones: [], claims: [], orders: [], ready: false };
  var unsubs = [], liveFor = '';
  function stop() { unsubs.forEach(function (f) { try { f(); } catch (e) {} }); unsubs = []; liveFor = ''; S = { milestones: [], claims: [], orders: [], ready: false }; }
  function start() {
    var r = role(), u = me(), d = db(), key = (r && u && d && (r === 'student' || r === 'admin')) ? r + ':' + u.uid : '';
    if (key === liveFor) return;
    stop();
    if (!key) { refresh(); return; }
    liveFor = key;
    var bad = function (w) { return function (e) { console.error('Rewards listener (' + w + ') failed:', e); }; };
    unsubs.push(d.collection('rewardMilestones').onSnapshot(function (s) {
      S.milestones = s.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; }).sort(function (a, b) { return Number(a.target) - Number(b.target); });
      S.ready = true; refresh();
    }, bad('milestones')));
    if (r === 'student') {
      unsubs.push(d.collection('rewardClaims').where('studentId', '==', u.uid).onSnapshot(function (s) { S.claims = s.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; }); refresh(); }, bad('claims')));
      unsubs.push(d.collection('orders').where('studentId', '==', u.uid).onSnapshot(function (s) { S.orders = s.docs.map(function (x) { return x.data(); }); refresh(); }, bad('orders')));
    } else {
      unsubs.push(d.collection('rewardClaims').orderBy('claimedAt', 'desc').limit(100).onSnapshot(function (s) { S.claims = s.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; }); refresh(); }, bad('claims')));
    }
  }

  /* ---------- student progress ---------- */
  function progress(m) {
    var key = m.period === 'month' ? monthKey() : 'all', n = 0, spend = 0;
    S.orders.forEach(function (o) {
      if (o.status !== 'Completed') return;
      if (key !== 'all' && monthKey(ms(o.createdAt)) !== key) return;
      n += 1; spend += Number(o.total || 0);
    });
    var uid = me() && me().uid, claimed = S.claims.some(function (c) { return c.id === uid + '_' + m.id + '_' + key; });
    return { value: m.metric === 'spend' ? spend : n, claimed: claimed };
  }
  function claimable() {
    return S.milestones.filter(function (m) { if (!m.active) return false; var p = progress(m); return !p.claimed && p.value >= Number(m.target); }).length;
  }

  /* ======================== STUDENT UI ======================== */
  var chip, modal;
  function mountChip() {
    if ($('rewardsBtn')) { chip = $('rewardsBtn'); return; }
    var anchor = $('walletBtn') || $('cartBtn'); if (!anchor || !anchor.parentNode) return;
    chip = document.createElement('button');
    chip.id = 'rewardsBtn'; chip.type = 'button'; chip.className = 'hidden relative px-3 py-2 rounded-xl bg-amber-50 text-amber-700 font-black text-sm whitespace-nowrap';
    chip.setAttribute('aria-label', 'Open my rewards');
    chip.innerHTML = '🏆 <span class="hidden sm:inline">Rewards</span><span id="rewardsDot" class="hidden absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black grid place-items-center">0</span>';
    chip.addEventListener('click', openModal);
    anchor.parentNode.insertBefore(chip, anchor);
  }
  function mountModal() {
    if ($('rewardsModal')) { modal = $('rewardsModal'); return; }
    modal = document.createElement('div');
    modal.id = 'rewardsModal'; modal.className = 'hidden fixed inset-0 z-[85] modal-backdrop grid place-items-center p-4';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'rewardsTitle');
    modal.innerHTML = '<section class="modal-shell bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">'
      + '<div class="flex items-center justify-between mb-1"><h2 id="rewardsTitle" class="text-xl font-black">🏆 My Rewards</h2><button type="button" id="rewardsClose" class="w-9 h-9 rounded-xl bg-slate-100" aria-label="Close">×</button></div>'
      + '<p class="text-sm text-slate-500 mb-4">Order from the canteen and unlock bonus money for your wallet.</p><div id="rewardsList" class="space-y-3"></div></section>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.id === 'rewardsClose') return closeModal();
      var b = e.target.closest && e.target.closest('[data-claim]'); if (b) claim(b);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeModal(); });
  }
  function openModal() { if (role() !== 'student') return; mountModal(); renderModal(); modal.classList.remove('hidden'); }
  function closeModal() { if (modal) modal.classList.add('hidden'); }

  function claim(btn) {
    btn.disabled = true; btn.textContent = 'Claiming…';
    CBFn.call('claimReward', { milestoneId: btn.getAttribute('data-claim') }).then(function (r) {
      toast('🎉 ' + rs(r.bonus) + ' added to your wallet!');
    }).catch(function (e) { alert(e.message); btn.disabled = false; btn.textContent = 'Claim'; });
  }

  function renderModal() {
    var box = $('rewardsList'); if (!box) return;
    var list = S.milestones.filter(function (m) { return m.active; });
    if (!S.ready) { box.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Loading…</p>'; return; }
    if (!list.length) { box.innerHTML = '<p class="text-sm text-slate-400 text-center py-6">No rewards are running right now. Check back soon!</p>'; return; }
    box.innerHTML = list.map(function (m) {
      var p = progress(m), target = Number(m.target), pct = Math.min(100, Math.round(p.value / target * 100)), done = p.value >= target;
      var left = m.metric === 'spend' ? rs(Math.max(0, target - p.value)) + ' more to go' : Math.max(0, target - p.value) + ' more order' + (target - p.value === 1 ? '' : 's') + ' to go';
      var action = p.claimed ? '<span class="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm">Claimed ✓</span>'
        : done ? '<button type="button" data-claim="' + esc(m.id) + '" class="px-4 py-2 rounded-xl bg-orange-500 text-white font-black text-sm">Claim</button>'
        : '<span class="text-xs font-bold text-slate-400">' + left + '</span>';
      return '<div class="border rounded-2xl p-4"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="font-black">' + esc(m.title) + '</p><p class="text-xs text-slate-500">' + esc(describe(m)) + '</p></div>'
        + '<span class="shrink-0 px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-black">+' + rs(m.bonus) + '</span></div>'
        + '<div class="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><div class="h-full rounded-full bg-orange-500" style="width:' + pct + '%"></div></div>'
        + '<div class="mt-3 flex items-center justify-between gap-3"><span class="text-xs text-slate-500">' + (m.metric === 'spend' ? rs(Math.min(p.value, target)) + ' / ' + rs(target) : Math.min(p.value, target) + ' / ' + target) + '</span>' + action + '</div></div>';
    }).join('');
  }

  /* ======================== ADMIN UI ======================== */
  var BTN = 'adminRewardsBtn', SEC = 'adminRewardsSection', editing = '';
  function mountAdmin() {
    if ($(BTN)) return;
    var hist = $('adminHistoryBtn'), histSec = $('adminHistorySection'); if (!hist || !histSec) return;
    var b = document.createElement('button');
    b.id = BTN; b.type = 'button'; b.className = 'admin-section-btn px-4 py-2 rounded-xl bg-white border font-bold text-sm'; b.textContent = '🏆 Rewards';
    hist.parentNode.appendChild(b);
    var s = document.createElement('section'); s.id = SEC; s.className = 'hidden mt-5'; s.style.display = 'none';
    s.innerHTML = '<div class="bg-white rounded-2xl border p-4 md:p-5">'
      + '<div class="mb-4"><h3 class="text-xl font-black">Milestone Rewards</h3><p class="text-sm text-slate-500">You decide the goals and the bonus. Students claim them from the 🏆 button and the money goes to their Campus Wallet.</p></div>'
      + '<form id="rwForm" class="grid grid-cols-1 sm:grid-cols-6 gap-3 border rounded-2xl p-4 mb-5 bg-slate-50" autocomplete="off">'
      + '<label class="sm:col-span-3 text-xs font-bold text-slate-500">Reward name<input id="rwTitle" maxlength="60" required placeholder="e.g. Lunch Regular" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm font-normal text-slate-900 bg-white"></label>'
      + '<label class="sm:col-span-3 text-xs font-bold text-slate-500">Goal is based on<select id="rwMetric" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm font-bold text-slate-900 bg-white"><option value="orders">Number of completed orders</option><option value="spend">Money spent (₹)</option></select></label>'
      + '<label class="sm:col-span-2 text-xs font-bold text-slate-500">Target<input id="rwTarget" type="number" min="1" step="1" required placeholder="10" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm font-normal text-slate-900 bg-white"></label>'
      + '<label class="sm:col-span-2 text-xs font-bold text-slate-500">Bonus (₹ to wallet)<input id="rwBonus" type="number" min="1" max="1000" step="1" required placeholder="25" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm font-normal text-slate-900 bg-white"></label>'
      + '<label class="sm:col-span-2 text-xs font-bold text-slate-500">How often<select id="rwPeriod" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm font-bold text-slate-900 bg-white"><option value="month">Every month (resets on the 1st)</option><option value="lifetime">One time only</option></select></label>'
      + '<div class="sm:col-span-6 flex flex-wrap items-center gap-2"><button type="submit" id="rwSave" class="px-4 py-2 rounded-xl bg-slate-900 text-white font-black text-sm">Add milestone</button>'
      + '<button type="button" id="rwCancel" class="hidden px-4 py-2 rounded-xl bg-slate-200 font-bold text-sm">Cancel edit</button><span id="rwMsg" class="text-xs font-bold" role="status"></span></div></form>'
      + '<h4 class="font-black mb-2">Milestones</h4><div id="rwList" class="space-y-2 mb-6"></div>'
      + '<h4 class="font-black mb-2">Recent claims</h4><div class="overflow-x-auto"><table class="w-full text-sm min-w-[520px]"><thead><tr class="border-b text-left text-slate-500"><th class="py-3">When</th><th>Student</th><th>Reward</th><th>Period</th><th>Bonus</th></tr></thead><tbody id="rwClaims"></tbody></table></div>'
      + '<p id="rwNoClaims" class="hidden text-center text-slate-400 py-4">No rewards claimed yet.</p></div>';
    histSec.parentNode.insertBefore(s, histSec);
    b.addEventListener('click', openAdmin);
    $('rwForm').addEventListener('submit', function (e) { e.preventDefault(); saveMilestone(); });
    $('rwCancel').addEventListener('click', resetForm);
    s.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-rw]'); if (!t) return;
      var id = t.getAttribute('data-id'), act = t.getAttribute('data-rw'), m = S.milestones.filter(function (x) { return x.id === id; })[0]; if (!m) return;
      if (act === 'toggle') db().collection('rewardMilestones').doc(id).update({ active: !m.active }).catch(function (er) { alert(errText(er)); });
      if (act === 'edit') loadForm(m);
      if (act === 'delete' && confirm('Delete "' + m.title + '"? Rewards students already claimed stay in their wallets.')) db().collection('rewardMilestones').doc(id).delete().catch(function (er) { alert(errText(er)); });
    });
    document.addEventListener('click', function (e) { var o = e.target.closest && e.target.closest('.admin-section-btn'); if (o && o.id !== BTN) hideAdmin(); });
    if (typeof window.openAdminSection === 'function') { var orig = window.openAdminSection; window.openAdminSection = function () { hideAdmin(); return orig.apply(this, arguments); }; }
  }
  function hideAdmin() { var s = $(SEC); if (s) { s.classList.add('hidden'); s.style.display = 'none'; } }
  function openAdmin() {
    if (role() !== 'admin') return;
    Array.prototype.forEach.call($('adminView').children, function (el) { if (el.tagName === 'SECTION' && el.id !== SEC) { el.classList.add('hidden'); el.style.display = 'none'; } });
    document.querySelectorAll('.admin-section-btn').forEach(function (x) { x.classList.remove('bg-slate-900', 'text-white'); x.classList.add('bg-white', 'border'); });
    var b = $(BTN); b.classList.remove('bg-white', 'border'); b.classList.add('bg-slate-900', 'text-white');
    var s = $(SEC); s.classList.remove('hidden'); s.style.display = 'block';
    start(); renderAdmin();
  }
  function msg(t, bad) { var el = $('rwMsg'); if (!el) return; el.textContent = t; el.className = 'text-xs font-bold ' + (bad ? 'text-red-600' : 'text-emerald-600'); }
  function resetForm() {
    editing = ''; $('rwForm').reset(); $('rwSave').textContent = 'Add milestone'; $('rwCancel').classList.add('hidden');
  }
  function loadForm(m) {
    editing = m.id; $('rwTitle').value = m.title; $('rwMetric').value = m.metric; $('rwTarget').value = m.target; $('rwBonus').value = m.bonus; $('rwPeriod').value = m.period;
    $('rwSave').textContent = 'Save changes'; $('rwCancel').classList.remove('hidden'); $('rwTitle').focus();
  }
  function saveMilestone() {
    var d = db(); if (!d || role() !== 'admin') return;
    var data = {
      title: $('rwTitle').value.trim(), metric: $('rwMetric').value, target: Math.floor(Number($('rwTarget').value)),
      bonus: Math.floor(Number($('rwBonus').value)), period: $('rwPeriod').value
    };
    if (!data.title || !(data.target >= 1) || !(data.bonus >= 1) || data.bonus > 1000) return msg('Enter a name, a target of at least 1 and a bonus between ₹1 and ₹1000.', true);
    var ref = editing ? d.collection('rewardMilestones').doc(editing) : d.collection('rewardMilestones').doc();
    var stamp = firebase.firestore.FieldValue.serverTimestamp();
    if (!editing) { data.active = true; data.createdAt = stamp; }
    data.updatedAt = stamp;
    $('rwSave').disabled = true;
    ref.set(data, { merge: true }).then(function () { msg(editing ? 'Saved ✓' : 'Milestone added ✓'); resetForm(); })
      .catch(function (e) { msg(errText(e), true); }).then(function () { var b = $('rwSave'); if (b) b.disabled = false; });
  }
  function renderAdmin() {
    var s = $(SEC); if (!s || s.classList.contains('hidden') || role() !== 'admin') return;
    var counts = {}; S.claims.forEach(function (c) { counts[c.milestoneId] = (counts[c.milestoneId] || 0) + 1; });
    $('rwList').innerHTML = S.milestones.length ? S.milestones.map(function (m) {
      return '<div class="flex flex-wrap items-center justify-between gap-3 border rounded-xl p-3 ' + (m.active ? '' : 'opacity-60') + '"><div class="min-w-0"><b>' + esc(m.title) + '</b>'
        + '<p class="text-xs text-slate-500">' + esc(describe(m)) + ' → <b class="text-slate-900">+' + rs(m.bonus) + '</b> • ' + (counts[m.id] || 0) + ' claimed</p></div>'
        + '<div class="flex items-center gap-2"><button type="button" data-rw="toggle" data-id="' + esc(m.id) + '" class="px-3 py-1.5 rounded-lg font-bold text-sm ' + (m.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600') + '">' + (m.active ? 'Active' : 'Paused') + '</button>'
        + '<button type="button" data-rw="edit" data-id="' + esc(m.id) + '" class="px-3 py-1.5 rounded-lg bg-slate-100 font-bold text-sm">Edit</button>'
        + '<button type="button" data-rw="delete" data-id="' + esc(m.id) + '" class="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-bold text-sm">Delete</button></div></div>';
    }).join('') : '<p class="text-sm text-slate-400">No milestones yet. Add your first one above.</p>';
    $('rwNoClaims').classList.toggle('hidden', S.claims.length > 0);
    $('rwClaims').innerHTML = S.claims.map(function (c) {
      return '<tr class="history-row border-b last:border-0"><td class="py-3 text-xs text-slate-500 whitespace-nowrap">' + esc(when(c.claimedAt)) + '</td><td class="font-bold">' + esc(c.studentName || 'Student') + '</td><td>' + esc(c.title) + '</td><td>' + (c.period === 'all' ? 'One-time' : esc(c.period)) + '</td><td class="font-black text-emerald-600">+' + rs(c.amount) + '</td></tr>';
    }).join('');
  }

  /* ---------- wiring ---------- */
  function refresh() {
    var isStudent = role() === 'student'; mountChip();
    if (chip) {
      chip.classList.toggle('hidden', !isStudent);
      var n = isStudent ? claimable() : 0, dot = $('rewardsDot'); if (dot) { dot.textContent = n; dot.classList.toggle('hidden', !n); }
    }
    if (modal && !modal.classList.contains('hidden')) renderModal();
    if (role() === 'admin') renderAdmin();
    if (!isStudent) closeModal();
  }
  function sync() { mountChip(); mountAdmin(); start(); refresh(); }
  function boot() {
    mountChip(); mountAdmin();
    ['loginView', 'logoutBtn'].forEach(function (id) { var el = $(id); if (el && window.MutationObserver) new MutationObserver(function () { setTimeout(sync, 60); }).observe(el, { attributes: true, attributeFilter: ['class'] }); });
    if (window.firebase && firebase.apps && firebase.apps.length) firebase.auth().onAuthStateChanged(function () { setTimeout(sync, 250); });
    setInterval(sync, 3000); sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  window.CBRewards = { open: openModal, get milestones() { return S.milestones; }, progress: progress, describe: describe };
})();
