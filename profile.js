/* ==========================================================================
   CampusBite Profile — profile.js
   Every signed-in user (student, owner, admin) gets a profile button in the header.
   Tap it and a Swiggy / Zomato style profile page slides in:
     • avatar (emoji or first letter), name, role, ID, class / shop, phone
     • students: orders, total spent, wallet balance, favourite food, member-since
     • shortcuts: My Orders, Wallet, Rewards, Help (student) • Kitchen, Food Menu (owner) • Shop Admin (admin)
     • Edit profile (name, phone, class, avatar), Change password, Dark mode, Logout
   Firestore: users/{uid}  { name, phone, avatar, className, ... }   (needs the updated firestore.rules)
   Load after wallet.js and rewards.js (see bottom of index.html).
   ========================================================================== */
(function () {
  'use strict';
  if (window.CBProfile) return;

  function $(id) { return document.getElementById(id); }
  function role() { try { return typeof currentRole === 'string' ? currentRole : ''; } catch (e) { return ''; } }
  function cu() { try { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : {}; } catch (e) { return {}; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rs(n) { return '₹' + (Math.round(Number(n || 0) * 100) / 100); }
  function toast(m) { try { if (typeof showToast === 'function') return showToast(m); } catch (e) {} alert(m); }
  function db() { return window.firebase && firebase.apps && firebase.apps.length ? firebase.firestore() : null; }
  function me() { return window.firebase && firebase.apps && firebase.apps.length ? firebase.auth().currentUser : null; }
  function errText(e) {
    var c = e && e.code;
    if (c === 'permission-denied') return 'Firestore blocked this. Publish the updated firestore.rules and try again.';
    if (c === 'auth/wrong-password' || c === 'auth/invalid-credential' || c === 'auth/invalid-login-credentials') return 'Current password is wrong.';
    if (c === 'auth/weak-password') return 'New password is too weak (use at least 6 characters).';
    if (c === 'auth/requires-recent-login') return 'Please log out, log in again and retry.';
    if (c === 'auth/too-many-requests') return 'Too many attempts. Please wait a few minutes.';
    return (e && e.message) || 'Something went wrong.';
  }

  var AVATARS = ['😀', '😎', '🤓', '🥳', '🦊', '🐼', '🐯', '🦁', '🐶', '🐱', '🍕', '🍔', '🍟', '🍩', '☕', '⚡'];
  var ROLE_LABEL = { student: '🎓 Student', owner: '🏪 Shop Owner', admin: '🛡️ Admin' };

  var P = { doc: null, uid: '', stats: null, view: 'main', avatarDraft: null };
  var btn, panel, isOpen = false;

  /* ---------- data ---------- */
  function info() {
    var d = P.doc || {}, c = cu(), u = me();
    var email = (u && u.email) || d.email || c.email || '';
    return {
      name: d.name || c.name || c.username || 'User',
      username: d.username || c.username || '',
      email: email,
      showEmail: email && !/@campusbite\.app$/i.test(email),
      phone: d.phone || '',
      className: d.className || '',
      avatar: d.avatar || '',
      shopName: d.shopName || c.shopName || '',
      shopId: d.shopId || c.shopId || ''
    };
  }
  function initial(n) { n = String(n || '?').trim(); return (n.charAt(0) || '?').toUpperCase(); }
  function avatarHtml(size, text) {
    var i = info();
    return '<span class="' + size + ' ' + text + ' rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white grid place-items-center font-black shrink-0 select-none">'
      + esc(i.avatar || initial(i.name)) + '</span>';
  }

  function loadDoc() {
    var u = me(), d = db();
    if (!u || !d) { if (P.uid) { P = { doc: null, uid: '', stats: null, view: 'main', avatarDraft: null }; } return; }
    if (P.uid === u.uid) return;
    P = { doc: null, uid: u.uid, stats: null, view: 'main', avatarDraft: null };
    var uid = u.uid;
    d.collection('users').doc(uid).get().then(function (s) {
      if (P.uid !== uid) return;
      P.doc = s.exists ? s.data() : {};
      paintBtn(); if (isOpen) render();
    }).catch(function (e) { console.error('Profile load failed:', e); });
  }

  function loadStats() {
    var u = me(), d = db();
    if (role() !== 'student' || !u || !d) return;
    var uid = u.uid;
    d.collection('orders').where('studentId', '==', uid).get().then(function (snap) {
      if (P.uid !== uid) return;
      var count = 0, spent = 0, tally = {};
      snap.docs.forEach(function (x) {
        var o = x.data();
        if (o.status === 'Cancelled' || o.status === 'Refunded') return;
        count++;
        if (o.status === 'Completed') spent += Number(o.total) || 0;
        (Array.isArray(o.items) ? o.items : []).forEach(function (it) {
          if (it && it.name) tally[it.name] = (tally[it.name] || 0) + (Number(it.quantity) || 1);
        });
      });
      var fav = '', best = 0;
      Object.keys(tally).forEach(function (k) { if (tally[k] > best) { best = tally[k]; fav = k; } });
      P.stats = { count: count, spent: spent, fav: fav };
      if (isOpen) render();
    }).catch(function (e) { console.error('Profile stats failed:', e); });
  }

  /* ---------- header button ---------- */
  function mountBtn() {
    if ($('cbProfileBtn')) { btn = $('cbProfileBtn'); return; }
    var anchor = $('roleBadge') || $('logoutBtn'); if (!anchor || !anchor.parentNode) return;
    var st = document.createElement('style');
    st.id = 'cbProfileCss';
    st.textContent = '#roleBadge{display:none!important}'
      + '.cbp-slide{animation:cbpIn .28s cubic-bezier(.22,1,.36,1) both}'
      + '@keyframes cbpIn{from{transform:translateX(36px);opacity:0}to{transform:none;opacity:1}}'
      + '.cbp-row{transition:background-color .15s ease}.cbp-row:hover{background:rgba(249,115,22,.07)}';
    document.head.appendChild(st);
    btn = document.createElement('button');
    btn.id = 'cbProfileBtn'; btn.type = 'button';
    btn.className = 'hidden items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold text-sm whitespace-nowrap';
    btn.setAttribute('aria-label', 'Open my profile');
    btn.addEventListener('click', openPanel);
    anchor.parentNode.insertBefore(btn, anchor);
    paintBtn();
  }
  function paintBtn() {
    if (!btn) return;
    var i = info();
    btn.innerHTML = avatarHtml('w-8 h-8', 'text-sm') + '<span class="hidden sm:inline max-w-[110px] truncate">' + esc(String(i.name).split(' ')[0]) + '</span>';
  }

  /* ---------- panel ---------- */
  function mountPanel() {
    if ($('cbProfilePanel')) { panel = $('cbProfilePanel'); return; }
    panel = document.createElement('div');
    panel.id = 'cbProfilePanel';
    panel.className = 'hidden fixed inset-0 z-[9992] modal-backdrop flex justify-end';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'My profile');
    document.body.appendChild(panel);
    panel.addEventListener('click', onClick);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) { if (P.view !== 'main') { P.view = 'main'; render(); } else closePanel(); } });
  }
  function openPanel() {
    if (!role()) return;
    mountPanel(); loadDoc();
    P.view = 'main'; P.avatarDraft = null; isOpen = true;
    panel.classList.remove('hidden'); document.body.style.overflow = 'hidden';
    render(true); loadStats();
    var b = panel.querySelector('[data-act="close"]'); if (b) b.focus();
  }
  function closePanel() {
    isOpen = false;
    if (panel) panel.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function row(icon, title, sub, act, extra) {
    return '<button type="button" data-act="' + act + '"' + (extra || '') + ' class="cbp-row w-full flex items-center gap-3 px-4 py-3.5 text-left">'
      + '<span class="w-10 h-10 rounded-xl bg-orange-50 grid place-items-center text-xl shrink-0">' + icon + '</span>'
      + '<span class="flex-1 min-w-0"><span class="block font-black text-slate-900">' + title + '</span>'
      + (sub ? '<span class="block text-xs text-slate-500 truncate">' + sub + '</span>' : '') + '</span>'
      + '<span class="text-slate-400 text-xl">›</span></button>';
  }
  function card(inner) { return '<div class="bg-white border rounded-2xl overflow-hidden divide-y">' + inner + '</div>'; }
  function topbar(title, back) {
    return '<div class="sticky top-0 z-10 bg-slate-50 flex items-center gap-3 px-4 py-3 border-b">'
      + '<button type="button" data-act="' + (back ? 'back' : 'close') + '" class="w-10 h-10 rounded-xl bg-white border text-xl font-black" aria-label="' + (back ? 'Back' : 'Close profile') + '">←</button>'
      + '<h2 class="text-lg font-black">' + title + '</h2></div>';
  }
  function shell(inner, animate) {
    return '<section class="' + (animate ? 'cbp-slide ' : '') + 'bg-slate-50 w-full md:max-w-md h-full overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">' + inner + '</section>';
  }

  function render(animate) {
    if (!panel || !isOpen) return;
    var keep = panel.firstElementChild ? panel.firstElementChild.scrollTop : 0;
    panel.innerHTML = P.view === 'edit' ? viewEdit(animate) : P.view === 'pass' ? viewPass(animate) : viewMain(animate);
    if (panel.firstElementChild) panel.firstElementChild.scrollTop = keep;
  }

  function viewMain(animate) {
    var i = info(), r = role();
    var sub = [i.username ? 'ID: ' + esc(i.username) : '', r === 'student' ? esc(i.className) : '', r === 'owner' ? esc(i.shopName) : ''].filter(Boolean).join(' • ');
    var canEdit = !!me();
    var h = topbar('My Profile', false);
    h += '<div class="p-4 space-y-4">';

    h += '<div class="rounded-3xl bg-gradient-to-br from-orange-500 to-amber-500 text-white p-5 shadow-lg">'
      + '<div class="flex items-center gap-4">' + avatarHtml('w-20 h-20', 'text-4xl').replace('from-orange-400 to-orange-600', 'from-white/30 to-white/10 ring-2 ring-white/60')
      + '<div class="min-w-0 flex-1"><p class="text-2xl font-black truncate">' + esc(i.name) + '</p>'
      + '<span class="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-white/25 text-xs font-black">' + (ROLE_LABEL[r] || '') + '</span>'
      + (sub ? '<p class="text-xs mt-2 text-white/90 truncate">' + sub + '</p>' : '') + '</div></div>'
      + '<div class="mt-4 space-y-1 text-sm text-white/95">'
      + (i.phone ? '<p>📞 ' + esc(i.phone) + '</p>' : '')
      + (i.showEmail ? '<p class="truncate">✉️ ' + esc(i.email) + '</p>' : '')
      + (r === 'owner' && i.shopId ? '<p>🏪 Shop ID: ' + esc(i.shopId) + '</p>' : '')
      + '</div>'
      + (canEdit ? '<button type="button" data-act="edit" class="mt-4 w-full py-2.5 rounded-xl bg-white text-orange-600 font-black">✏️ Edit profile</button>' : '')
      + '</div>';

    if (r === 'student') {
      var s = P.stats, bal = (window.CBWallet && CBWallet.loaded) ? rs(CBWallet.balance) : '…';
      h += '<div class="grid grid-cols-3 gap-3 text-center">'
        + stat(s ? s.count : '…', 'Orders') + stat(s ? rs(s.spent) : '…', 'Spent') + stat(bal, 'Wallet') + '</div>';
      if (s && s.fav) h += '<div class="bg-white border rounded-2xl px-4 py-3 flex items-center gap-3"><span class="text-2xl">❤️</span><div><p class="text-xs text-slate-500 font-bold">Your favourite</p><p class="font-black">' + esc(s.fav) + '</p></div></div>';
    }

    h += '<p class="text-xs font-black text-slate-500 uppercase tracking-wider px-1">Quick links</p>';
    var links = '';
    if (r === 'student') {
      links += row('📦', 'My Orders', 'Track, reorder and review', 'go', ' data-id="myOrdersTab"');
      links += row('👛', 'Campus Wallet', (window.CBWallet && CBWallet.loaded) ? 'Balance ' + rs(CBWallet.balance) : 'Add money & history', 'wallet');
      if (window.CBRewards) links += row('🏆', 'Rewards', 'Claim your milestone bonuses', 'rewards');
      links += row('🆘', 'Help / Report', 'Raise a ticket', 'go', ' data-id="reportTab"');
    } else if (r === 'owner') {
      links += row('🍳', 'Kitchen', 'Live orders', 'go', ' data-id="vendorTab"');
      links += row('🍽️', 'Food Menu', 'Edit items and stock', 'go', ' data-id="foodMenuTab"');
      links += row('🆘', 'Help / Report', 'Raise a ticket', 'go', ' data-id="reportTab"');
    } else if (r === 'admin') {
      links += row('🛡️', 'Shop Admin', 'Users, wallet, rewards, reports', 'go', ' data-id="adminTab"');
    }
    h += card(links);

    h += '<p class="text-xs font-black text-slate-500 uppercase tracking-wider px-1">Settings</p>';
    var dark = document.body.classList.contains('theme-dark');
    var set = '';
    if ($('themeToggle')) set += row(dark ? '☀️' : '🌙', 'Dark mode', dark ? 'On — tap to switch to light' : 'Off — tap to switch to dark', 'theme');
    if (me() && me().email) set += row('🔒', 'Change password', 'Keep your account safe', 'pass');
    if (set) h += card(set);

    h += '<button type="button" data-act="logout" class="w-full py-3 rounded-2xl bg-white border border-red-200 text-red-600 font-black">Logout</button>';
    var u = me(), since = u && u.metadata && u.metadata.creationTime ? new Date(u.metadata.creationTime) : null;
    h += '<p class="text-center text-xs text-slate-400">CampusBite' + (since && !isNaN(since) ? ' • Member since ' + since.toLocaleDateString([], { month: 'short', year: 'numeric' }) : '') + '</p>';
    h += '</div>';
    return shell(h, animate);
  }
  function stat(v, k) { return '<div class="bg-white border rounded-2xl py-3 px-1"><p class="text-lg font-black truncate">' + esc(v) + '</p><p class="text-[11px] text-slate-500 font-bold">' + k + '</p></div>'; }

  function field(id, label, val, extra) {
    return '<label class="block text-xs font-bold text-slate-500">' + label
      + '<input id="' + id + '" value="' + esc(val) + '" ' + (extra || '') + ' class="mt-1 block w-full border rounded-xl px-3 py-2.5 text-sm font-normal text-slate-900 bg-white"></label>';
  }
  function viewEdit(animate) {
    var i = info(), r = role();
    var av = P.avatarDraft != null ? P.avatarDraft : i.avatar;
    var h = topbar('Edit profile', true) + '<div class="p-4 space-y-4">';
    h += '<div class="bg-white border rounded-2xl p-4"><div class="flex items-center gap-4">'
      + '<span id="cbpAvPrev" class="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white grid place-items-center text-3xl font-black">' + esc(av || initial(i.name)) + '</span>'
      + '<p class="text-sm text-slate-500">Pick an avatar or use the first letter of your name.</p></div>'
      + '<div class="grid grid-cols-8 gap-1.5 mt-3">'
      + AVATARS.map(function (a) { return '<button type="button" data-act="av" data-v="' + a + '" class="h-9 rounded-lg ' + (av === a ? 'bg-orange-100 ring-2 ring-orange-500' : 'bg-slate-100') + ' text-xl">' + a + '</button>'; }).join('')
      + '<button type="button" data-act="av" data-v="" class="h-9 rounded-lg ' + (!av ? 'bg-orange-100 ring-2 ring-orange-500' : 'bg-slate-100') + ' text-xs font-black col-span-2">Aa</button></div></div>';
    h += '<div class="bg-white border rounded-2xl p-4 space-y-3">'
      + field('cbpName', 'Full name', i.name, 'maxlength="40" autocomplete="name"')
      + field('cbpPhone', 'Phone number (optional)', i.phone, 'maxlength="15" inputmode="tel" autocomplete="tel" placeholder="e.g. 98765 43210"')
      + (r === 'student' ? field('cbpClass', 'Class / Department', i.className, 'maxlength="40"') : '')
      + '<p class="text-xs text-slate-400">Login ID' + (i.username ? ': <b>' + esc(i.username) + '</b>' : '') + ' can only be changed by the admin.</p></div>'
      + '<p id="cbpMsg" class="text-sm font-bold min-h-[1.25rem]" role="status"></p>'
      + '<button type="button" data-act="save" class="w-full py-3 rounded-2xl bg-orange-500 text-white font-black">Save changes</button></div>';
    return shell(h, animate);
  }
  function viewPass(animate) {
    var h = topbar('Change password', true) + '<div class="p-4 space-y-4"><div class="bg-white border rounded-2xl p-4 space-y-3">'
      + '<label class="block text-xs font-bold text-slate-500">Current password<input id="cbpCur" type="password" autocomplete="current-password" class="mt-1 block w-full border rounded-xl px-3 py-2.5 text-sm font-normal text-slate-900 bg-white"></label>'
      + '<label class="block text-xs font-bold text-slate-500">New password<input id="cbpNew" type="password" autocomplete="new-password" class="mt-1 block w-full border rounded-xl px-3 py-2.5 text-sm font-normal text-slate-900 bg-white"></label>'
      + '<label class="block text-xs font-bold text-slate-500">Confirm new password<input id="cbpNew2" type="password" autocomplete="new-password" class="mt-1 block w-full border rounded-xl px-3 py-2.5 text-sm font-normal text-slate-900 bg-white"></label></div>'
      + '<p id="cbpMsg" class="text-sm font-bold min-h-[1.25rem]" role="status"></p>'
      + '<button type="button" data-act="savepass" class="w-full py-3 rounded-2xl bg-slate-900 text-white font-black">Update password</button></div>';
    return shell(h, animate);
  }

  function msg(t, bad) { var m = $('cbpMsg'); if (m) { m.textContent = t; m.className = 'text-sm font-bold min-h-[1.25rem] ' + (bad ? 'text-red-600' : 'text-emerald-600'); } }

  /* ---------- actions ---------- */
  function saveProfile(b) {
    var d = db(), u = me(); if (!d || !u) return msg('You are not signed in with an online account.', true);
    var name = $('cbpName').value.replace(/[<>"]/g, '').trim();
    var phone = $('cbpPhone').value.trim();
    var cls = $('cbpClass') ? $('cbpClass').value.replace(/[<>"]/g, '').trim() : null;
    if (name.length < 2) return msg('Please enter your name (at least 2 letters).', true);
    if (phone && !/^[0-9+\-\s]{7,15}$/.test(phone)) return msg('Phone number looks wrong.', true);
    var av = P.avatarDraft != null ? P.avatarDraft : (info().avatar || '');
    var data = { name: name, phone: phone, avatar: av, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (cls !== null) data.className = cls;
    b.disabled = true; msg('Saving…');
    d.collection('users').doc(u.uid).update(data).then(function () {
      P.doc = Object.assign({}, P.doc || {}, { name: name, phone: phone, avatar: av });
      if (cls !== null) P.doc.className = cls;
      try { cu().name = name; if (cls !== null) cu().className = cls; } catch (e) {}
      var rb = $('roleBadge'); if (rb) rb.textContent = ({ student: '🎓 ', owner: '🏪 ', admin: '🛡️ ' }[role()] || '') + name;
      paintBtn(); P.view = 'main'; P.avatarDraft = null; render(); toast('Profile updated ✓');
    }).catch(function (e) { msg(errText(e), true); b.disabled = false; });
  }
  function savePass(b) {
    var u = me(); if (!u || !u.email) return msg('Password change is only for online accounts.', true);
    var cur = $('cbpCur').value, n1 = $('cbpNew').value, n2 = $('cbpNew2').value;
    if (!cur || !n1) return msg('Fill in all the boxes.', true);
    if (n1.length < 6) return msg('New password must be at least 6 characters.', true);
    if (n1 !== n2) return msg('The new passwords do not match.', true);
    if (n1 === cur) return msg('New password must be different.', true);
    b.disabled = true; msg('Updating…');
    var cred = firebase.auth.EmailAuthProvider.credential(u.email, cur);
    u.reauthenticateWithCredential(cred).then(function () { return u.updatePassword(n1); })
      .then(function () { P.view = 'main'; render(); toast('Password updated ✓'); })
      .catch(function (e) { msg(errText(e), true); b.disabled = false; });
  }

  function onClick(e) {
    if (e.target === panel) return closePanel();
    var t = e.target.closest && e.target.closest('[data-act]'); if (!t) return;
    var act = t.getAttribute('data-act');
    if (act === 'close') return closePanel();
    if (act === 'back') { P.view = 'main'; P.avatarDraft = null; return render(); }
    if (act === 'edit') { P.view = 'edit'; P.avatarDraft = null; return render(); }
    if (act === 'pass') { P.view = 'pass'; return render(); }
    if (act === 'av') {
      P.avatarDraft = t.getAttribute('data-v');
      var keep = { n: $('cbpName').value, p: $('cbpPhone').value, c: $('cbpClass') ? $('cbpClass').value : null };
      render(); $('cbpName').value = keep.n; $('cbpPhone').value = keep.p; if (keep.c !== null && $('cbpClass')) $('cbpClass').value = keep.c;
      return;
    }
    if (act === 'save') return saveProfile(t);
    if (act === 'savepass') return savePass(t);
    if (act === 'theme') { var tg = $('themeToggle'); if (tg) tg.click(); return setTimeout(render, 60); }
    if (act === 'go') { var id = t.getAttribute('data-id'); closePanel(); var tab = $(id); if (tab) setTimeout(function () { tab.click(); }, 30); return; }
    if (act === 'wallet') { closePanel(); return setTimeout(function () { if (window.CBWallet) CBWallet.open(); }, 30); }
    if (act === 'rewards') { closePanel(); return setTimeout(function () { if (window.CBRewards) CBRewards.open(); }, 30); }
    if (act === 'logout') { closePanel(); var lo = $('logoutBtn'); if (lo) lo.click(); }
  }

  /* ---------- wiring ---------- */
  function sync() {
    mountBtn();
    var r = role(), signedIn = !!r && $('loginView') && $('loginView').classList.contains('hidden');
    if (btn) { btn.classList.toggle('hidden', !signedIn); btn.classList.toggle('inline-flex', !!signedIn); }
    if (!signedIn) { if (isOpen) closePanel(); if (P.uid) P = { doc: null, uid: '', stats: null, view: 'main', avatarDraft: null }; return; }
    loadDoc(); paintBtn();
  }
  function boot() {
    mountBtn();
    ['loginView', 'logoutBtn'].forEach(function (id) {
      var el = $(id); if (el && window.MutationObserver) new MutationObserver(function () { setTimeout(sync, 60); }).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    if (window.firebase && firebase.apps && firebase.apps.length) firebase.auth().onAuthStateChanged(function () { setTimeout(sync, 250); });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  window.CBProfile = { open: openPanel, close: closePanel };
})();
