/* ==========================================================================
   CampusBite Chatbot Admin — chatbot-admin.js
   ADMIN ▸ 🤖 Chatbot tab:
     • ON / OFF switch for everyone (just like the mascots)
     • change the bot's icon (pick an emoji, type your own, or upload a picture), name, greeting, "don't know" message
     • TRAIN it: add triggers (words, phrases or /commands) + the reply it should give
     • see the questions the bot could NOT answer and teach it with one click
     • test box: type a message and see what the bot would answer
   Firestore: chatbotConfig/settings, chatbotTraining/{id}, chatbotUnanswered/{id}
   Load after chatbot.js (see SETUP-CHATBOT.txt).
   ========================================================================== */
(function () {
  'use strict';
  if (window.CBChatAdmin) return;

  function $(id) { return document.getElementById(id); }
  function role() { try { return typeof currentRole === 'string' ? currentRole : ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { try { if (typeof showToast === 'function') return showToast(m); } catch (e) {} alert(m); }
  function db() { return window.firebase && firebase.apps && firebase.apps.length ? firebase.firestore() : null; }
  function me() { return window.firebase && firebase.apps && firebase.apps.length ? firebase.auth().currentUser : null; }
  function ts() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function errText(e) { return e && e.code === 'permission-denied' ? 'Firestore blocked this. Publish the updated firestore.rules and try again.' : ((e && e.message) || 'Something went wrong.'); }

  var PRESETS = ['💬', '🤖', '🍔', '🍕', '🍜', '🥪', '☕', '🧑‍🍳', '🦊', '🐼', '😺', '🐶', '✨', '🎓'];
  var AUD = { all: 'Everyone', student: 'Students', owner: 'Owners', admin: 'Admins' };
  var S = { cfg: {}, train: [], unans: [] }, unsubs = [], liveFor = '';
  var iconDraft = { type: 'emoji', icon: '💬' }, dirty = false, editId = '', teachId = '', switchBusy = false;
  var BTN = 'adminChatbotBtn', SEC = 'adminChatbotSection';
  var INP = 'w-full border rounded-xl px-3 py-2 text-sm bg-white';
  var LBL = 'block text-xs font-bold text-slate-500 mb-1';

  function iconTag(d) { return d.type === 'image' ? '<img alt="" src="' + d.icon + '" style="width:100%;height:100%;object-fit:cover;display:block">' : esc(d.icon || '💬'); }

  /* ---------------- live data ---------------- */
  function stop() { unsubs.forEach(function (f) { try { f(); } catch (e) {} }); unsubs = []; liveFor = ''; S = { cfg: {}, train: [], unans: [] }; }
  function start() {
    var u = me(), d = db(), key = (role() === 'admin' && u && d) ? u.uid : '';
    if (key === liveFor) return;
    stop(); if (!key) return; liveFor = key;
    var bad = function (w) { return function (e) { console.error('Chatbot admin listener (' + w + ') failed:', e); }; };
    unsubs.push(d.collection('chatbotConfig').doc('settings').onSnapshot(function (s) {
      S.cfg = s.exists ? s.data() : {}; paintSwitch(); if (!dirty) fillForm();
    }, bad('settings')));
    unsubs.push(d.collection('chatbotTraining').onSnapshot(function (s) {
      S.train = s.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; }); renderTrain();
    }, bad('training')));
    unsubs.push(d.collection('chatbotUnanswered').orderBy('lastAt', 'desc').limit(50).onSnapshot(function (s) {
      S.unans = s.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; }); renderUnans();
    }, bad('unanswered')));
  }

  /* ---------------- mount the tab ---------------- */
  function mount() {
    if ($(BTN)) return;
    var hist = $('adminHistoryBtn'), histSec = $('adminHistorySection'); if (!hist || !histSec) return;
    var b = document.createElement('button');
    b.id = BTN; b.type = 'button'; b.className = 'admin-section-btn px-4 py-2 rounded-xl bg-white border font-bold text-sm'; b.textContent = '🤖 Chatbot';
    hist.parentNode.appendChild(b);
    var s = document.createElement('section'); s.id = SEC; s.className = 'hidden mt-5 space-y-5'; s.style.display = 'none';
    s.innerHTML =
      /* --- settings card --- */
      '<div class="bg-white rounded-2xl border p-4 md:p-5">'
      + '<div class="flex flex-wrap items-center justify-between gap-3 mb-4"><div><h3 class="text-xl font-black">🤖 Chatbot</h3>'
      + '<p class="text-xs text-slate-500">The assistant button at the bottom-right. Status: <b id="cbaState"></b></p></div>'
      + '<button type="button" id="cbaSwitch" role="switch" aria-label="Turn the chatbot on or off" style="position:relative;width:52px;height:30px;border-radius:9999px;border:0;cursor:pointer;transition:background .2s"><span style="position:absolute;left:4px;top:4px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .2s"></span></button></div>'
      + '<div class="grid md:grid-cols-2 gap-5" data-cfg="1">'
      + '<div class="space-y-3">'
      + '<div><label class="' + LBL + '" for="cbaName">Bot name</label><input id="cbaName" maxlength="40" placeholder="CampusBite Assistant" class="' + INP + '"></div>'
      + '<div><label class="' + LBL + '" for="cbaGreet">First message</label><textarea id="cbaGreet" rows="2" maxlength="300" placeholder="Hi! 👋 I am the {name}. What would you like to know?" class="' + INP + '"></textarea></div>'
      + '<div><label class="' + LBL + '" for="cbaFallback">When the bot does not know the answer</label><textarea id="cbaFallback" rows="2" maxlength="400" placeholder="Leave empty for the default message" class="' + INP + '"></textarea></div>'
      + '</div>'
      + '<div><span class="' + LBL + '">Bot icon</span>'
      + '<div class="flex items-center gap-3 mb-3"><div id="cbaPreview" style="width:56px;height:56px;border-radius:9999px;background:#f97316;color:#fff;font-size:26px;display:grid;place-items:center;overflow:hidden;box-shadow:0 8px 20px rgba(249,115,22,.35)"></div><p class="text-xs text-slate-500">Preview of the round button students see.</p></div>'
      + '<div id="cbaPresets" class="flex flex-wrap gap-2 mb-3">' + PRESETS.map(function (p) { return '<button type="button" data-preset="' + esc(p) + '" aria-label="Use ' + esc(p) + '" class="w-10 h-10 rounded-xl bg-slate-100 text-xl">' + esc(p) + '</button>'; }).join('') + '</div>'
      + '<div class="flex flex-wrap gap-2 items-center"><input id="cbaEmoji" maxlength="8" placeholder="Or type any emoji" aria-label="Custom emoji" class="border rounded-xl px-3 py-2 text-sm w-40 bg-white">'
      + '<button type="button" id="cbaFileBtn" class="px-3 py-2 rounded-xl bg-slate-100 font-bold text-sm">📷 Upload picture</button>'
      + '<input id="cbaFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden"></div>'
      + '<p class="text-[11px] text-slate-400 mt-2">A picture is cropped to a square and shrunk automatically. Use a simple logo or mascot face.</p></div>'
      + '</div>'
      + '<div class="mt-4"><button type="button" id="cbaSaveCfg" class="px-5 py-2 rounded-xl bg-slate-900 text-white font-black text-sm">Save settings</button></div>'
      + '</div>'

      /* --- training card --- */
      + '<div class="bg-white rounded-2xl border p-4 md:p-5">'
      + '<h3 class="text-xl font-black">Teach the bot</h3>'
      + '<p class="text-sm text-slate-500 mb-4">When a user message contains one of the <b>triggers</b>, the bot sends your <b>reply</b>. Your answers are checked <b>before</b> the built-in ones, so you can also change how it answers menu, timing or wallet questions.</p>'
      + '<div class="grid md:grid-cols-2 gap-4"><div>'
      + '<label class="' + LBL + '" for="cbaTrig"><span id="cbaFormTitle">New answer</span> — triggers (one per line)</label>'
      + '<textarea id="cbaTrig" rows="4" placeholder="hostel timing\nwhen does hostel mess open\n/offers" class="' + INP + '"></textarea>'
      + '<p class="text-[11px] text-slate-400 mt-1">A line starting with <b>/</b> is a command: it only fires when the user types exactly that (e.g. <b>/offers</b>).</p></div>'
      + '<div><label class="' + LBL + '" for="cbaReply">Reply</label>'
      + '<textarea id="cbaReply" rows="4" maxlength="1000" placeholder="The hostel mess opens at **7:30 AM**." class="' + INP + '"></textarea>'
      + '<p class="text-[11px] text-slate-400 mt-1">Use <b>**bold**</b>. Live values: <b>{wallet}</b> <b>{timings}</b> <b>{menu}</b> <b>{name}</b></p></div></div>'
      + '<div class="flex flex-wrap items-center gap-3 mt-3">'
      + '<label class="text-sm font-bold flex items-center gap-2">Who gets it <select id="cbaAud" class="border rounded-xl px-3 py-2 text-sm bg-white">' + Object.keys(AUD).map(function (k) { return '<option value="' + k + '">' + AUD[k] + '</option>'; }).join('') + '</select></label>'
      + '<label class="text-sm font-bold flex items-center gap-2"><input type="checkbox" id="cbaChip" class="w-4 h-4 accent-orange-500"> Show first trigger as a quick button</label>'
      + '<span class="ml-auto flex gap-2"><button type="button" id="cbaCancel" class="hidden px-4 py-2 rounded-xl bg-slate-100 font-bold text-sm">Cancel</button>'
      + '<button type="button" id="cbaAdd" class="px-5 py-2 rounded-xl bg-orange-500 text-white font-black text-sm">Add answer</button></span></div>'
      + '<h4 class="font-black mt-6 mb-2">Taught answers <span id="cbaCount" class="text-slate-400 font-bold"></span></h4>'
      + '<div id="cbaList" class="space-y-2"></div></div>'

      /* --- unanswered card --- */
      + '<div class="bg-white rounded-2xl border p-4 md:p-5">'
      + '<h3 class="text-xl font-black">Questions the bot could not answer</h3>'
      + '<p class="text-sm text-slate-500 mb-3">Most recent first. Press <b>Teach</b> to turn one into a trigger. (No names are saved, only the question.)</p>'
      + '<div id="cbaUnans" class="space-y-2"></div></div>'

      /* --- test card --- */
      + '<div class="bg-white rounded-2xl border p-4 md:p-5">'
      + '<h3 class="text-xl font-black">Test the bot</h3>'
      + '<div class="flex flex-wrap gap-2 mt-3"><input id="cbaTestIn" maxlength="300" placeholder="Type a message…" aria-label="Test message" class="flex-1 min-w-[180px] border rounded-xl px-3 py-2 text-sm bg-white">'
      + '<select id="cbaTestAs" aria-label="Test as" class="border rounded-xl px-3 py-2 text-sm bg-white"><option value="student">as Student</option><option value="owner">as Owner</option><option value="admin">as Admin</option></select>'
      + '<button type="button" id="cbaTestBtn" class="px-4 py-2 rounded-xl bg-slate-900 text-white font-black text-sm">Test</button></div>'
      + '<div id="cbaTestOut" class="mt-3 text-sm bg-slate-50 border rounded-xl p-3 hidden"></div>'
      + '<p class="text-[11px] text-slate-400 mt-2">“as Student/Owner” checks which taught answers apply. Built-in answers (orders, wallet…) use your live admin session.</p></div>';
    histSec.parentNode.insertBefore(s, histSec);

    b.addEventListener('click', open);
    s.addEventListener('input', function (e) {
      var t = e.target;
      if (t.id === 'cbaEmoji') { var v = t.value.trim(); if (v) { iconDraft = { type: 'emoji', icon: v.slice(0, 16) }; paintPreview(); } }
      if (t.closest && t.closest('[data-cfg]')) dirty = true;
    });
    s.addEventListener('change', function (e) { if (e.target.id === 'cbaFile') { pickImage(e.target.files && e.target.files[0]); e.target.value = ''; } });
    s.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'cbaTestIn') { e.preventDefault(); runTest(); } });
    s.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-preset')) { iconDraft = { type: 'emoji', icon: t.getAttribute('data-preset') }; $('cbaEmoji').value = ''; dirty = true; return paintPreview(); }
      if (t.id === 'cbaSwitch') return flip(t);
      if (t.id === 'cbaSaveCfg') return saveCfg(t);
      if (t.id === 'cbaFileBtn') return $('cbaFile').click();
      if (t.id === 'cbaAdd') return saveTrain(t);
      if (t.id === 'cbaCancel') return clearForm();
      if (t.id === 'cbaTestBtn') return runTest();
      if (t.hasAttribute('data-edit')) return edit(t.getAttribute('data-edit'));
      if (t.hasAttribute('data-del')) return del(t.getAttribute('data-del'));
      if (t.hasAttribute('data-toggle')) return toggleEntry(t.getAttribute('data-toggle'));
      if (t.hasAttribute('data-teach')) return teach(t.getAttribute('data-teach'));
      if (t.hasAttribute('data-dismiss')) return dismiss(t.getAttribute('data-dismiss'));
    });
    document.addEventListener('click', function (e) { var o = e.target.closest && e.target.closest('.admin-section-btn'); if (o && o.id !== BTN) hide(); });
    if (typeof window.openAdminSection === 'function') { var orig = window.openAdminSection; window.openAdminSection = function () { hide(); return orig.apply(this, arguments); }; }
    paintPreview(); paintSwitch(); renderTrain(); renderUnans();
  }
  function hide() { var s = $(SEC); if (s) { s.classList.add('hidden'); s.style.display = 'none'; } }
  function open() {
    if (role() !== 'admin') return;
    Array.prototype.forEach.call($('adminView').children, function (el) { if (el.tagName === 'SECTION' && el.id !== SEC) { el.classList.add('hidden'); el.style.display = 'none'; } });
    document.querySelectorAll('.admin-section-btn').forEach(function (x) { x.classList.remove('bg-slate-900', 'text-white'); x.classList.add('bg-white', 'border'); });
    var b = $(BTN); b.classList.remove('bg-white', 'border'); b.classList.add('bg-slate-900', 'text-white');
    var s = $(SEC); s.classList.remove('hidden'); s.style.display = 'block';
    start(); fillForm();
  }

  /* ---------------- on/off switch ---------------- */
  function isOn() { return S.cfg.enabled !== false; }
  function paintSwitch() {
    var sw = $('cbaSwitch'), st = $('cbaState'); if (!sw || !st) return;
    sw.setAttribute('aria-checked', String(isOn())); sw.disabled = switchBusy;
    sw.style.background = isOn() ? '#10b981' : '#cbd5e1';
    sw.firstChild.style.transform = isOn() ? 'translateX(22px)' : 'translateX(0)';
    st.textContent = switchBusy ? 'Saving…' : (isOn() ? 'ON for all users' : 'OFF for all users (button hidden)');
  }
  function flip() {
    var d = db(); if (!d || switchBusy) return;
    var prev = isOn(), next = !prev;
    switchBusy = true; S.cfg.enabled = next; paintSwitch();
    d.collection('chatbotConfig').doc('settings').set({ enabled: next, updatedAt: ts() }, { merge: true })
      .then(function () { toast(next ? 'Chatbot is ON for everyone.' : 'Chatbot is OFF for everyone.'); })
      .catch(function (e) { S.cfg.enabled = prev; alert(errText(e)); })
      .then(function () { switchBusy = false; paintSwitch(); });
  }

  /* ---------------- settings form + icon ---------------- */
  function paintPreview() { var p = $('cbaPreview'); if (p) p.innerHTML = iconTag(iconDraft); }
  function fillForm() {
    if (!$('cbaName') || dirty) return;
    var c = S.cfg || {};
    $('cbaName').value = c.name || ''; $('cbaGreet').value = c.greeting || ''; $('cbaFallback').value = c.fallback || '';
    iconDraft = (c.iconType === 'image' && c.icon) ? { type: 'image', icon: c.icon } : { type: 'emoji', icon: c.icon || '💬' };
    $('cbaEmoji').value = (iconDraft.type === 'emoji' && PRESETS.indexOf(iconDraft.icon) < 0) ? iconDraft.icon : '';
    paintPreview();
  }
  function pickImage(file) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) return alert('Please choose a PNG, JPG, WEBP or GIF picture.');
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var out = null, tries = [[128, .85], [96, .75], [64, .7]];
      var m = Math.min(img.width, img.height), sx = (img.width - m) / 2, sy = (img.height - m) / 2;
      for (var i = 0; i < tries.length && !out; i++) {
        var c = document.createElement('canvas'); c.width = c.height = tries[i][0];
        c.getContext('2d').drawImage(img, sx, sy, m, m, 0, 0, c.width, c.height);
        var data = c.toDataURL('image/webp', tries[i][1]);              // browsers without WEBP return PNG instead
        if (data.length <= 45000 && /^data:image\/(png|jpeg|webp);base64,/.test(data)) out = data;
      }
      if (!out) return alert('That picture is too detailed. Try a simpler or smaller one.');
      iconDraft = { type: 'image', icon: out }; dirty = true; $('cbaEmoji').value = ''; paintPreview();
    };
    img.onerror = function () { URL.revokeObjectURL(url); alert('Could not read that picture.'); };
    img.src = url;
  }
  function saveCfg(btn) {
    var d = db(); if (!d) return;
    var data = { name: $('cbaName').value.trim().slice(0, 40), greeting: $('cbaGreet').value.trim().slice(0, 300), fallback: $('cbaFallback').value.trim().slice(0, 400), iconType: iconDraft.type, icon: iconDraft.icon, updatedAt: ts() };
    btn.disabled = true;
    d.collection('chatbotConfig').doc('settings').set(data, { merge: true })
      .then(function () { dirty = false; toast('Chatbot settings saved for everyone.'); })
      .catch(function (e) { alert(errText(e)); })
      .then(function () { btn.disabled = false; });
  }

  /* ---------------- training ---------------- */
  function clearForm() {
    editId = ''; teachId = '';
    $('cbaTrig').value = ''; $('cbaReply').value = ''; $('cbaAud').value = 'all'; $('cbaChip').checked = false;
    $('cbaFormTitle').textContent = 'New answer'; $('cbaAdd').textContent = 'Add answer'; $('cbaCancel').classList.add('hidden');
  }
  function saveTrain(btn) {
    var d = db(); if (!d) return;
    var seen = {}, trig = $('cbaTrig').value.split('\n').map(function (x) { return x.trim().slice(0, 80); }).filter(function (x) { var k = x.toLowerCase(); if (!x || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 20);
    var reply = $('cbaReply').value.trim();
    if (!trig.length) return alert('Add at least one trigger (a word, a phrase or a /command).');
    if (!reply) return alert('Type the reply the bot should send.');
    if (reply.length > 1000) return alert('The reply is too long (max 1000 characters).');
    var data = { triggers: trig, reply: reply, audience: $('cbaAud').value, chip: $('cbaChip').checked, updatedAt: ts() };
    var col = d.collection('chatbotTraining'), p;
    if (editId) p = col.doc(editId).set(data, { merge: true });
    else { data.active = true; data.createdAt = ts(); p = col.add(data); }
    var tid = teachId; btn.disabled = true;
    p.then(function () {
      if (tid) d.collection('chatbotUnanswered').doc(tid).delete().catch(function () {});
      toast(editId ? 'Answer updated.' : 'Answer added. The bot knows it now.'); clearForm();
    }).catch(function (e) { alert(errText(e)); }).then(function () { btn.disabled = false; });
  }
  function find(id) { return S.train.filter(function (t) { return t.id === id; })[0]; }
  function edit(id) {
    var t = find(id); if (!t) return;
    editId = id; teachId = '';
    $('cbaTrig').value = (t.triggers || []).join('\n'); $('cbaReply').value = t.reply || '';
    $('cbaAud').value = t.audience || 'all'; $('cbaChip').checked = !!t.chip;
    $('cbaFormTitle').textContent = 'Edit answer'; $('cbaAdd').textContent = 'Update answer'; $('cbaCancel').classList.remove('hidden');
    $('cbaTrig').scrollIntoView({ block: 'center', behavior: 'smooth' }); $('cbaTrig').focus();
  }
  function del(id) {
    var d = db(); if (!d || !confirm('Delete this answer? The bot will forget it.')) return;
    d.collection('chatbotTraining').doc(id).delete().then(function () { if (editId === id) clearForm(); }).catch(function (e) { alert(errText(e)); });
  }
  function toggleEntry(id) {
    var d = db(), t = find(id); if (!d || !t) return;
    d.collection('chatbotTraining').doc(id).update({ active: t.active === false, updatedAt: ts() }).catch(function (e) { alert(errText(e)); });
  }
  function renderTrain() {
    var el = $('cbaList'); if (!el) return;
    var list = S.train.slice().sort(function (a, b) { return String((a.triggers || [])[0] || '').toLowerCase() < String((b.triggers || [])[0] || '').toLowerCase() ? -1 : 1; });
    $('cbaCount').textContent = list.length ? '(' + list.length + ')' : '';
    if (!list.length) { el.innerHTML = '<p class="text-center text-slate-400 py-4">Nothing taught yet. Add your first answer above.</p>'; return; }
    el.innerHTML = list.map(function (t) {
      var off = t.active === false;
      return '<div class="border rounded-2xl p-3' + (off ? ' opacity-60' : '') + '"><div class="flex flex-wrap items-start justify-between gap-2"><div class="min-w-0">'
        + '<div class="flex flex-wrap gap-1 mb-1">' + (t.triggers || []).map(function (x) { return '<span class="px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 text-xs font-bold">' + esc(x) + '</span>'; }).join('') + '</div>'
        + '<p class="text-sm text-slate-600 whitespace-pre-line break-words">' + esc(String(t.reply || '').slice(0, 220)) + (String(t.reply || '').length > 220 ? '…' : '') + '</p>'
        + '<p class="text-[11px] text-slate-400 mt-1">' + esc(AUD[t.audience] || 'Everyone') + (t.chip ? ' • quick button' : '') + (off ? ' • paused' : '') + '</p></div>'
        + '<div class="flex gap-2 shrink-0"><button type="button" data-toggle="' + esc(t.id) + '" class="px-3 py-1.5 rounded-lg bg-slate-100 font-bold text-xs">' + (off ? 'Resume' : 'Pause') + '</button>'
        + '<button type="button" data-edit="' + esc(t.id) + '" class="px-3 py-1.5 rounded-lg bg-slate-100 font-bold text-xs">Edit</button>'
        + '<button type="button" data-del="' + esc(t.id) + '" class="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-bold text-xs">Delete</button></div></div></div>';
    }).join('');
  }

  /* ---------------- unanswered questions ---------------- */
  function renderUnans() {
    var el = $('cbaUnans'); if (!el) return;
    if (!S.unans.length) { el.innerHTML = '<p class="text-center text-slate-400 py-4">No unanswered questions. 🎉</p>'; return; }
    el.innerHTML = S.unans.map(function (u) {
      return '<div class="border rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2"><div class="min-w-0"><b class="break-words">' + esc(u.text) + '</b>'
        + '<span class="text-xs text-slate-400 ml-2">asked ' + esc(u.count || 1) + '×</span></div>'
        + '<div class="flex gap-2"><button type="button" data-teach="' + esc(u.id) + '" class="px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 font-bold text-xs">Teach</button>'
        + '<button type="button" data-dismiss="' + esc(u.id) + '" class="px-3 py-1.5 rounded-lg bg-slate-100 font-bold text-xs">Dismiss</button></div></div>';
    }).join('');
  }
  function teach(id) {
    var u = S.unans.filter(function (x) { return x.id === id; })[0]; if (!u) return;
    clearForm(); teachId = id; $('cbaTrig').value = u.text;
    $('cbaTrig').scrollIntoView({ block: 'center', behavior: 'smooth' }); $('cbaReply').focus();
  }
  function dismiss(id) {
    var d = db(); if (!d) return;
    d.collection('chatbotUnanswered').doc(id).delete().catch(function (e) { alert(errText(e)); });
  }

  /* ---------------- test box ---------------- */
  function runTest() {
    var text = $('cbaTestIn').value.trim(), out = $('cbaTestOut'); if (!text) return;
    out.classList.remove('hidden');
    if (!window.CBChat) { out.textContent = 'chatbot.js is not loaded.'; return; }
    var r = null; try { r = CBChat.answer(text, $('cbaTestAs').value); } catch (e) { console.error(e); }
    out.innerHTML = r ? r.html + (r.trained ? '<div class="text-[11px] text-emerald-600 font-bold mt-2">✔ taught answer</div>' : '<div class="text-[11px] text-slate-400 mt-2">built-in answer</div>')
      : CBChat.fallbackHtml() + '<div class="text-[11px] text-red-500 font-bold mt-2">✖ no answer matched — this is the “don’t know” message</div>';
  }

  function sync() { mount(); if (role() === 'admin') start(); else if (liveFor) stop(); }
  function boot() {
    mount();
    ['loginView', 'logoutBtn'].forEach(function (id) { var el = $(id); if (el && window.MutationObserver) new MutationObserver(function () { setTimeout(sync, 60); }).observe(el, { attributes: true, attributeFilter: ['class'] }); });
    if (window.firebase && firebase.apps && firebase.apps.length) firebase.auth().onAuthStateChanged(function () { setTimeout(sync, 250); });
    setInterval(sync, 3000); sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.CBChatAdmin = { open: open };
})();
