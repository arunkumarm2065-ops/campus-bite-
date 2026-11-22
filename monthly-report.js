/* ==========================================================================
   CampusBite Monthly Sales Report — monthly-report.js
   ADMIN ▸ 📧 Monthly Report tab:
     • type each canteen owner's REAL e-mail address (owner logins like 001@campusbite.app are not real mailboxes)
     • switch the automatic e-mail on/off per canteen
     • "Send now" button to test or re-send any month
     • history of what was sent
   The e-mails themselves are sent by the Cloud Function monthlySalesReport on the 1st of
   every month at 08:00 India time (see functions/index.js and SETUP-NEW-FEATURES.txt).
   Firestore: reportSettings/{shopId} { email, enabled, shopName }   reportLogs/{shopId_YYYY-MM}
   Load after wallet.js and cb-functions.js.
   ========================================================================== */
(function () {
  'use strict';
  if (window.CBMonthlyReport) return;

  function $(id) { return document.getElementById(id); }
  function role() { try { return typeof currentRole === 'string' ? currentRole : ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rs(n) { return '₹' + (Math.round(Number(n || 0) * 100) / 100); }
  function toast(m) { try { if (typeof showToast === 'function') return showToast(m); } catch (e) {} alert(m); }
  function db() { return window.firebase && firebase.apps && firebase.apps.length ? firebase.firestore() : null; }
  function me() { return window.firebase && firebase.apps && firebase.apps.length ? firebase.auth().currentUser : null; }
  function when(v) { var d = v && v.toDate ? v.toDate() : null; return d ? d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''; }
  function errText(e) { return e && e.code === 'permission-denied' ? 'Firestore blocked this. Publish the updated firestore.rules and try again.' : ((e && e.message) || 'Something went wrong.'); }
  function shops() { try { if (typeof getFoodShops === 'function') return getFoodShops(); } catch (e) {} return [{ id: 'main-canteen', name: 'Main Canteen' }]; }
  function prevMonth() { var d = new Date(Date.now() + 330 * 60000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var S = { settings: {}, logs: [] }, draft = {}, unsubs = [], liveFor = '', lastHtml = '';
  function stop() { unsubs.forEach(function (f) { try { f(); } catch (e) {} }); unsubs = []; liveFor = ''; S = { settings: {}, logs: [] }; }
  function start() {
    var u = me(), d = db(), key = (role() === 'admin' && u && d) ? u.uid : '';
    if (key === liveFor) return;
    stop(); if (!key) return; liveFor = key;
    var bad = function (w) { return function (e) { console.error('Monthly report listener (' + w + ') failed:', e); }; };
    unsubs.push(d.collection('reportSettings').onSnapshot(function (s) { S.settings = {}; s.docs.forEach(function (x) { S.settings[x.id] = x.data(); }); render(); }, bad('settings')));
    unsubs.push(d.collection('reportLogs').orderBy('sentAt', 'desc').limit(30).onSnapshot(function (s) { S.logs = s.docs.map(function (x) { return x.data(); }); render(); }, bad('logs')));
  }

  var BTN = 'adminMonthlyReportBtn', SEC = 'adminMonthlyReportSection';
  function mount() {
    if ($(BTN)) return;
    var hist = $('adminHistoryBtn'), histSec = $('adminHistorySection'); if (!hist || !histSec) return;
    var b = document.createElement('button');
    b.id = BTN; b.type = 'button'; b.className = 'admin-section-btn px-4 py-2 rounded-xl bg-white border font-bold text-sm'; b.textContent = '📧 Monthly Report';
    hist.parentNode.appendChild(b);
    var s = document.createElement('section'); s.id = SEC; s.className = 'hidden mt-5'; s.style.display = 'none';
    s.innerHTML = '<div class="bg-white rounded-2xl border p-4 md:p-5">'
      + '<div class="mb-4"><h3 class="text-xl font-black">Monthly Sales Report</h3><p class="text-sm text-slate-500">Every month on the <b>1st at 8:00 AM</b> each canteen owner automatically receives last month\'s sales by e-mail: total sales, orders, top items, payment split and best day.</p></div>'
      + '<div class="flex flex-wrap items-end gap-3 mb-4"><label class="text-xs font-bold text-slate-500">Month for “Send now”<input id="mrMonth" type="month" class="mt-1 block border rounded-xl px-3 py-2 text-sm font-normal text-slate-900 bg-white"></label></div>'
      + '<div id="mrRows" class="space-y-3 mb-6"></div>'
      + '<h4 class="font-black mb-2">Sent reports</h4><div class="overflow-x-auto"><table class="w-full text-sm min-w-[560px]"><thead><tr class="border-b text-left text-slate-500"><th class="py-3">Sent</th><th>Canteen</th><th>Month</th><th>To</th><th>Sales</th><th>Status</th></tr></thead><tbody id="mrLogs"></tbody></table></div>'
      + '<p id="mrNoLogs" class="hidden text-center text-slate-400 py-4">Nothing sent yet. The first automatic e-mail goes out on the 1st of next month.</p></div>';
    histSec.parentNode.insertBefore(s, histSec);
    $('mrMonth').value = prevMonth();
    b.addEventListener('click', open);
    s.addEventListener('input', function (e) { var id = e.target.getAttribute && e.target.getAttribute('data-email'); if (id) (draft[id] = draft[id] || {}).email = e.target.value; });
    s.addEventListener('change', function (e) { var id = e.target.getAttribute && e.target.getAttribute('data-on'); if (id) (draft[id] = draft[id] || {}).enabled = e.target.checked; });
    s.addEventListener('click', function (e) {
      var sv = e.target.closest && e.target.closest('[data-save]'); if (sv) return save(sv.getAttribute('data-save'), sv);
      var sn = e.target.closest && e.target.closest('[data-send]'); if (sn) return sendNow(sn.getAttribute('data-send'), sn);
    });
    document.addEventListener('click', function (e) { var o = e.target.closest && e.target.closest('.admin-section-btn'); if (o && o.id !== BTN) hide(); });
    if (typeof window.openAdminSection === 'function') { var orig = window.openAdminSection; window.openAdminSection = function () { hide(); return orig.apply(this, arguments); }; }
  }
  function hide() { var s = $(SEC); if (s) { s.classList.add('hidden'); s.style.display = 'none'; } }
  function open() {
    if (role() !== 'admin') return;
    Array.prototype.forEach.call($('adminView').children, function (el) { if (el.tagName === 'SECTION' && el.id !== SEC) { el.classList.add('hidden'); el.style.display = 'none'; } });
    document.querySelectorAll('.admin-section-btn').forEach(function (x) { x.classList.remove('bg-slate-900', 'text-white'); x.classList.add('bg-white', 'border'); });
    var b = $(BTN); b.classList.remove('bg-white', 'border'); b.classList.add('bg-slate-900', 'text-white');
    var s = $(SEC); s.classList.remove('hidden'); s.style.display = 'block';
    start(); lastHtml = ''; render();
  }

  function current(id) {
    var saved = S.settings[id] || {}, dr = draft[id] || {};
    return { email: dr.email != null ? dr.email : (saved.email || ''), enabled: dr.enabled != null ? dr.enabled : !!saved.enabled, saved: !!S.settings[id] };
  }
  function render() {
    var s = $(SEC); if (!s || s.classList.contains('hidden') || role() !== 'admin') return;
    var rows = shops().map(function (sh) {
      var c = current(sh.id);
      return '<div class="border rounded-2xl p-4"><div class="flex flex-wrap items-center justify-between gap-2"><div><b>' + esc(sh.name) + '</b><p class="text-xs text-slate-500">Canteen ID: ' + esc(sh.id) + '</p></div>'
        + '<label class="flex items-center gap-2 text-sm font-bold"><input type="checkbox" data-on="' + esc(sh.id) + '"' + (c.enabled ? ' checked' : '') + ' class="w-4 h-4 accent-orange-500"> Send automatically</label></div>'
        + '<div class="flex flex-col sm:flex-row gap-2 mt-3"><input type="email" data-email="' + esc(sh.id) + '" value="' + esc(c.email) + '" placeholder="owner@gmail.com" aria-label="Owner e-mail for ' + esc(sh.name) + '" class="flex-1 border rounded-xl px-3 py-2 text-sm">'
        + '<button type="button" data-save="' + esc(sh.id) + '" data-name="' + esc(sh.name) + '" class="px-4 py-2 rounded-xl bg-slate-900 text-white font-black text-sm">Save</button>'
        + '<button type="button" data-send="' + esc(sh.id) + '" class="px-4 py-2 rounded-xl bg-orange-50 text-orange-700 font-black text-sm whitespace-nowrap"' + (c.saved ? '' : ' disabled title="Save the e-mail first"') + '>Send now</button></div></div>';
    }).join('');
    var html = rows;
    // never repaint while the admin is typing in the list (that is what erased the wallet amount box)
    var ae = document.activeElement;
    if (html !== lastHtml && !(ae && $('mrRows') && $('mrRows').contains(ae) && ae.tagName === 'INPUT' && ae.type !== 'checkbox')) { $('mrRows').innerHTML = html; lastHtml = html; }
    $('mrNoLogs').classList.toggle('hidden', S.logs.length > 0);
    $('mrLogs').innerHTML = S.logs.map(function (l) {
      return '<tr class="history-row border-b last:border-0"><td class="py-3 text-xs text-slate-500 whitespace-nowrap">' + esc(when(l.sentAt)) + '</td><td class="font-bold">' + esc(l.shopName || l.shopId) + '</td><td>' + esc(l.monthKey) + (l.manual ? ' <span class="text-[10px] text-slate-400">manual</span>' : '') + '</td><td class="text-xs">' + esc(l.to) + '</td><td>' + (l.status === 'sent' ? rs(l.revenue) + ' • ' + (l.orders || 0) + ' orders' : '—') + '</td><td><span class="font-bold ' + (l.status === 'sent' ? 'text-emerald-600' : 'text-red-600') + '">' + esc(l.status) + '</span>' + (l.error ? '<div class="text-[11px] text-red-500">' + esc(l.error) + '</div>' : '') + '</td></tr>';
    }).join('');
  }

  function save(id, btn) {
    var d = db(); if (!d) return;
    var c = current(id), email = String(c.email).trim();
    if (c.enabled && !EMAIL_RE.test(email)) return alert('Enter a valid e-mail address first.');
    if (email && !EMAIL_RE.test(email)) return alert('That e-mail address does not look right.');
    btn.disabled = true;
    d.collection('reportSettings').doc(id).set({ email: email, enabled: !!c.enabled, shopName: btn.getAttribute('data-name') || id, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
      .then(function () { delete draft[id]; lastHtml = ''; toast('Saved. ' + (c.enabled ? 'Reports will be e-mailed on the 1st of every month.' : 'Automatic reports are off for this canteen.')); render(); })
      .catch(function (e) { alert(errText(e)); }).then(function () { btn.disabled = false; });
  }
  function sendNow(id, btn) {
    var month = ($('mrMonth') && $('mrMonth').value) || prevMonth();
    if (!confirm('E-mail the ' + month + ' sales report to ' + (S.settings[id] && S.settings[id].email) + ' now?')) return;
    var label = btn.textContent; btn.disabled = true; btn.textContent = 'Sending…';
    CBFn.call('sendReportNow', { shopId: id, month: month }).then(function (r) { toast('Sent ' + r.month + ' report to ' + r.to + ' (' + r.orders + ' orders, ' + rs(r.revenue) + ')'); })
      .catch(function (e) { alert(e.message); }).then(function () { btn.disabled = false; btn.textContent = label; });
  }

  function sync() { mount(); if (role() === 'admin') { start(); render(); } else if (liveFor) stop(); }
  function boot() {
    mount();
    ['loginView', 'logoutBtn'].forEach(function (id) { var el = $(id); if (el && window.MutationObserver) new MutationObserver(function () { setTimeout(sync, 60); }).observe(el, { attributes: true, attributeFilter: ['class'] }); });
    if (window.firebase && firebase.apps && firebase.apps.length) firebase.auth().onAuthStateChanged(function () { setTimeout(sync, 250); });
    setInterval(sync, 3000); sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.CBMonthlyReport = { open: open };
})();
