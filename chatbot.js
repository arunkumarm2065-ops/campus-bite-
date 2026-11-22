/* ==========================================================================
   CampusBite Chatbot — chatbot.js
   A floating 💬 assistant on every page. It works out of the box (no server, free) and answers
   from your live data: menu, prices, stock, canteen timings, the student's wallet, orders and rewards.
   Optional AI: set AI_ENABLED = true after deploying the askCampusBite Cloud Function and it will
   answer everything else with Claude (the API key stays on the server, never in this file).
   Load last, after wallet.js, rewards.js and cb-functions.js.
   ========================================================================== */
(function () {
  'use strict';
  if (window.CBChat) return;

  var AI_ENABLED = false;          // true = unknown questions go to the askCampusBite Cloud Function
  var BOT_NAME = 'CampusBite Assistant';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rs(n) { return '₹' + (Math.round(Number(n || 0) * 100) / 100); }
  function role() { try { return typeof currentRole === 'string' ? currentRole : ''; } catch (e) { return ''; } }
  function G(name) { try { return (0, eval)('typeof ' + name + '!=="undefined"?' + name + ':undefined'); } catch (e) { return undefined; } }
  function arr(name) { var v = G(name); return Array.isArray(v) ? v : []; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9₹ ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function has(q, words) { return words.some(function (w) { return (' ' + q + ' ').indexOf(' ' + w + ' ') >= 0 || (w.length > 4 && q.indexOf(w) >= 0); }); }

  /* ---------------- knowledge from the live page ---------------- */
  function foods() { return arr('menu').filter(function (m) { return m && m.name; }); }
  function inStock(m) { return Number(m.qty || 0) > 0; }
  function findFood(q) {
    var best = null, bestScore = 0;
    foods().forEach(function (m) {
      var n = norm(m.name), score = 0;
      if (q.indexOf(n) >= 0) score = 100 + n.length;
      else n.split(' ').forEach(function (w) { if (w.length > 2 && q.split(' ').some(function (t) { return t === w || (t.length > 3 && (w.indexOf(t) === 0 || t.indexOf(w) === 0)); })) score += w.length; });
      if (score > bestScore) { best = m; bestScore = score; }
    });
    return bestScore >= 3 ? best : null;
  }
  function foodLine(m) { return esc(m.name) + ' — ' + rs(m.price) + (inStock(m) ? '' : ' (sold out)') + (m.shopName && foods().some(function (x) { return x.shopName && x.shopName !== m.shopName; }) ? ' • ' + esc(m.shopName) : ''); }

  function timings() {
    try {
      var w = typeof allServiceWindows === 'function' ? allServiceWindows() : [];
      var open = typeof isCanteenOpenNow === 'function' ? isCanteenOpenNow() : null;
      var fmt = function (t) { return esc(String(t)); };
      var times = w.map(function (x) { return fmt(x.start) + ' – ' + fmt(x.end) + (x.label ? ' (' + esc(x.label) + ')' : ''); }).join('<br>');
      return (open === null ? '' : (open ? '🟢 The canteen is <b>open now</b>.' : '🔴 The canteen is <b>closed</b> right now.')) + (times ? '<br>Ordering times:<br>' + times : '');
    } catch (e) { return 'Please check the banner at the top of the menu for today\'s ordering times.'; }
  }
  function myOrders() {
    var uid = G('currentUser') && G('currentUser').uid;
    return arr('myPurchases').filter(function (o) { return o && (!uid || o.studentId === uid); }).sort(function (a, b) {
      var t = function (o) { var v = o.createdAt; var d = v && v.toDate ? v.toDate() : (v ? new Date(v) : null); return d ? d.getTime() : 0; };
      return t(b) - t(a);
    });
  }

  /* ---------------- intents ---------------- */
  var CHIPS = ['What is on the menu?', 'Cheapest item', 'Is the canteen open?', 'Where is my order?', 'My wallet balance', 'My rewards'];

  function answer(raw) {
    var q = norm(raw), r = role();
    if (!q) return { html: 'Type a question and I will help!' };

    if (has(q, ['hi', 'hello', 'hey', 'hii', 'namaste', 'vanakkam', 'good morning', 'good afternoon', 'good evening']) && q.split(' ').length <= 4)
      return { html: 'Hi! 👋 I am the ' + BOT_NAME + '. Ask me about food, prices, your orders or your wallet.' };
    if (has(q, ['thanks', 'thank you', 'thx', 'nandri'])) return { html: 'Happy to help! 😊 Enjoy your meal.' };
    if (has(q, ['bye', 'goodbye'])) return { html: 'Bye! See you at the canteen. 👋' };

    if (has(q, ['wallet', 'balance']) && !has(q, ['add', 'top up', 'topup', 'recharge', 'load'])) {
      if (r !== 'student') return { html: 'Wallet balances are shown to students after they sign in.' };
      return { html: 'Your Campus Wallet balance is <b>' + rs(window.CBWallet ? CBWallet.balance : 0) + '</b>. Tap the 👛 button at the top to see your history.' };
    }
    if (has(q, ['add money', 'top up', 'topup', 'recharge', 'load money', 'add balance', 'add cash']))
      return { html: window.CBWallet && CBWallet.allowTopUp === false
        ? 'To add money, visit the canteen counter. The admin will credit your wallet and it appears instantly.'
        : 'Tap the 👛 balance button at the top, enter an amount (or pick a quick amount) and press <b>Add</b>. If you are stuck, the canteen counter can add money for you.' };

    if (has(q, ['reward', 'milestone', 'bonus', 'offer'])) {
      var ms = window.CBRewards ? CBRewards.milestones.filter(function (m) { return m.active; }) : [];
      if (!ms.length) return { html: 'There are no milestone rewards running right now. Check again soon! 🏆' };
      return { html: 'Current rewards 🏆<br>' + ms.map(function (m) {
        var line = '• <b>' + esc(m.title) + '</b>: ' + esc(CBRewards.describe(m)) + ' → +' + rs(m.bonus);
        if (r === 'student') { var p = CBRewards.progress(m); line += p.claimed ? ' ✅ claimed' : ' (' + Math.min(p.value, m.target) + '/' + m.target + (m.metric === 'spend' ? ' ₹' : '') + ')'; }
        return line;
      }).join('<br>') + (r === 'student' ? '<br>Open the 🏆 button to claim.' : '') };
    }

    if (has(q, ['order', 'token', 'track', 'status', 'ready', 'preparing', 'my food'])) {
      if (r !== 'student') return { html: 'Students can track their orders in the <b>My Orders</b> tab. Owners see incoming orders in the Kitchen view.' };
      var o = myOrders();
      if (!o.length) return { html: 'You have no orders yet. Pick something from the menu and place your first order! 🍽️' };
      var active = o.filter(function (x) { return ['Preparing', 'Ready', 'Confirmed', 'Accepted'].indexOf(x.status) >= 0; });
      var show = (active.length ? active : o.slice(0, 1)).slice(0, 3);
      return { html: (active.length ? 'Your active order' + (active.length > 1 ? 's' : '') + ':' : 'Your latest order:') + '<br>' + show.map(function (x) {
        return '• <b>' + esc(x.token) + '</b> — ' + esc(x.status) + (x.status === 'Ready' ? ' 🔔 collect from ' + esc(x.counter || 'the counter') : '') + ' • ' + rs(x.total);
      }).join('<br>') };
    }
    if (has(q, ['cancel']) ) return { html: 'To cancel an order, please ask at the canteen counter as soon as possible. If it was paid from your wallet, the admin refunds the money back to your wallet.' };
    if (has(q, ['refund', 'money back'])) return { html: 'Refunds for cancelled wallet orders go back to your Campus Wallet — you will see a “Refund” line in your wallet history.' };

    if (has(q, ['open', 'close', 'closed', 'timing', 'timings', 'time', 'hours', 'when'])) return { html: timings() };

    if (has(q, ['cheapest', 'lowest price', 'budget', 'cheap', 'under'])) {
      var cap = (raw.match(/(\d{2,4})/) || [])[1];
      var list = foods().filter(inStock).sort(function (a, b) { return a.price - b.price; });
      if (cap) list = list.filter(function (m) { return Number(m.price) <= Number(cap); });
      if (!list.length) return { html: cap ? 'I could not find in-stock items under ' + rs(cap) + '.' : 'Nothing is in stock right now.' };
      return { html: (cap ? 'In stock under ' + rs(cap) + ':' : 'Cheapest items right now:') + '<br>' + list.slice(0, 5).map(function (m) { return '• ' + foodLine(m); }).join('<br>') };
    }
    if (has(q, ['recommend', 'suggest', 'popular', 'best', 'what should i eat', 'hungry'])) {
      var picks = foods().filter(inStock);
      if (!picks.length) return { html: 'Everything is sold out at the moment. Please check again later.' };
      picks = picks.sort(function () { return Math.random() - 0.5; }).slice(0, 3);
      return { html: 'How about one of these? 😋<br>' + picks.map(function (m) { return '• ' + foodLine(m); }).join('<br>') };
    }

    var f = findFood(q);
    if (f && !has(q, ['menu', 'all items', 'everything']))
      return { html: '<b>' + esc(f.name) + '</b> costs <b>' + rs(f.price) + '</b>' + (inStock(f) ? ' and is <b>in stock</b>' + (Number(f.qty) <= 10 ? ' (only ' + Number(f.qty) + ' left!)' : '') + '.' : ' but is <b>sold out</b> right now.') + (f.shopName ? '<br>Canteen: ' + esc(f.shopName) : '') };

    if (has(q, ['menu', 'food', 'eat', 'available', 'items', 'snacks', 'drinks', 'lunch', 'breakfast', 'what do you have', 'what do you sell'])) {
      var av = foods().filter(inStock);
      if (!av.length) return { html: 'The menu is empty or sold out right now. Please check again later.' };
      return { html: 'Available now (' + av.length + ' items):<br>' + av.slice(0, 12).map(function (m) { return '• ' + foodLine(m); }).join('<br>') + (av.length > 12 ? '<br>…and ' + (av.length - 12) + ' more on the menu page.' : '') };
    }

    if (has(q, ['coupon', 'promo', 'discount', 'code'])) return { html: 'Have a coupon? Enter it in the coupon box in your cart before placing the order. Active coupons are also shown there as tap-to-apply chips.' };
    if (has(q, ['pay', 'payment', 'upi', 'cash'])) return { html: 'You can pay with your <b>Campus Wallet</b> or <b>UPI / Net Banking</b> at checkout.' };
    if (has(q, ['parcel', 'takeaway', 'take away', 'dine'])) return { html: 'At checkout choose <b>Dine-in</b> (small express fee) or <b>Parcel</b> (a parcel charge may apply).' };
    if (has(q, ['password', 'login', 'sign in', 'forgot'])) return { html: 'If you cannot sign in, please contact the canteen admin to reset your account. Never share your password with anyone — including me. 🔒' };
    if (has(q, ['help', 'problem', 'complaint', 'report', 'issue', 'contact', 'support']))
      return { html: 'Use the <b>Help / Report</b> tab to send a ticket to the admin. Include your order number so it is solved faster.' };
    if (has(q, ['who are you', 'your name', 'what can you do']))
      return { html: 'I am the ' + BOT_NAME + ' 🤖. I can tell you the menu, prices, stock, canteen timings, your order status, wallet balance and rewards.' };
    return null;
  }

  function aiContext() {
    var parts = [];
    var f = foods().slice(0, 60).map(function (m) { return m.name + ' ' + rs(m.price) + (inStock(m) ? ' in stock' : ' sold out') + (m.shopName ? ' (' + m.shopName + ')' : ''); });
    if (f.length) parts.push('MENU: ' + f.join('; '));
    try { parts.push('TIMINGS: ' + timings().replace(/<br>/g, ' ').replace(/<[^>]+>/g, '')); } catch (e) {}
    if (role() === 'student') {
      if (window.CBWallet && CBWallet.loaded) parts.push('STUDENT WALLET BALANCE: ' + rs(CBWallet.balance));
      var o = myOrders().slice(0, 3).map(function (x) { return x.token + ' ' + x.status + ' ' + rs(x.total); });
      if (o.length) parts.push('STUDENT RECENT ORDERS: ' + o.join('; '));
    }
    parts.push('PAYMENTS: Campus Wallet or UPI. Dine-in has a small express fee; parcel may have a charge. Cancellations are handled at the counter; wallet orders are refunded to the wallet. Problems: Help / Report tab.');
    return parts.join('\n');
  }

  /* ---------------- widget ---------------- */
  var launcher, panel, log, input, hist = [], busy = false;
  function css() {
    if ($('cbChatCss')) return;
    var st = document.createElement('style'); st.id = 'cbChatCss';
    st.textContent = '#cbChatBtn{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:9990;width:56px;height:56px;border-radius:9999px;border:0;background:#f97316;color:#fff;font-size:26px;box-shadow:0 10px 30px rgba(249,115,22,.45);cursor:pointer;transition:transform .2s}'
      + '#cbChatBtn:hover{transform:scale(1.07)}#cbChatBtn:focus-visible{outline:3px solid #0f172a;outline-offset:3px}'
      + '#cbChat{position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:9991;width:min(380px,calc(100vw - 32px));height:min(540px,calc(100vh - 120px));background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:20px;box-shadow:0 24px 60px rgba(15,23,42,.25);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,Arial,sans-serif}'
      + '#cbChat.open{display:flex;animation:cbChatIn .25s cubic-bezier(.22,1,.36,1)}@keyframes cbChatIn{from{opacity:0;transform:translateY(14px) scale(.97)}}'
      + '#cbChat header{background:#0f172a;color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px}#cbChat header b{font-size:14px}#cbChat header small{display:block;font-size:11px;color:#94a3b8}'
      + '#cbChat header button{margin-left:auto;background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:10px;width:30px;height:30px;font-size:18px;cursor:pointer}'
      + '#cbChatLog{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f8fafc}'
      + '.cbc-m{max-width:86%;padding:9px 12px;border-radius:16px;font-size:14px;line-height:1.4;word-wrap:break-word}.cbc-b{background:#fff;border:1px solid #e2e8f0;align-self:flex-start;border-bottom-left-radius:4px}.cbc-u{background:#f97316;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}'
      + '.cbc-chips{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border-top:1px solid #e2e8f0;background:#fff;max-height:92px;overflow-y:auto}.cbc-chips button{border:1px solid #fed7aa;background:#fff7ed;color:#c2410c;font-weight:700;font-size:12px;padding:6px 10px;border-radius:9999px;cursor:pointer}'
      + '#cbChat form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e2e8f0;background:#fff}#cbChat input{flex:1;border:1px solid #cbd5e1;border-radius:12px;padding:9px 12px;font-size:14px;min-width:0;color:#0f172a;background:#fff}#cbChat form button{border:0;background:#0f172a;color:#fff;font-weight:800;border-radius:12px;padding:0 14px;cursor:pointer}'
      + '.cbc-dots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#94a3b8;animation:cbcD 1s infinite}.cbc-dots span:nth-child(2){animation-delay:.15s}.cbc-dots span:nth-child(3){animation-delay:.3s}@keyframes cbcD{50%{transform:translateY(-4px);opacity:.5}}'
      + '@media (prefers-reduced-motion:reduce){#cbChat.open,.cbc-dots span{animation:none}}';
    document.head.appendChild(st);
  }
  function mount() {
    if ($('cbChatBtn')) return;
    css();
    launcher = document.createElement('button');
    launcher.id = 'cbChatBtn'; launcher.type = 'button'; launcher.setAttribute('aria-label', 'Open chat assistant'); launcher.setAttribute('aria-expanded', 'false'); launcher.textContent = '💬';
    panel = document.createElement('div');
    panel.id = 'cbChat'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', BOT_NAME);
    panel.innerHTML = '<header><span style="font-size:22px">🤖</span><div><b>' + BOT_NAME + '</b><small>Ask about food, orders & wallet</small></div><button type="button" id="cbChatX" aria-label="Close chat">×</button></header>'
      + '<div id="cbChatLog" aria-live="polite"></div><div class="cbc-chips" id="cbChatChips"></div>'
      + '<form id="cbChatForm" autocomplete="off"><input id="cbChatIn" maxlength="300" placeholder="Type your question…" aria-label="Your message"><button type="submit">Send</button></form>';
    document.body.appendChild(launcher); document.body.appendChild(panel);
    log = $('cbChatLog'); input = $('cbChatIn');
    launcher.addEventListener('click', toggle);
    $('cbChatX').addEventListener('click', toggle);
    $('cbChatForm').addEventListener('submit', function (e) { e.preventDefault(); send(input.value); input.value = ''; });
    $('cbChatChips').addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button'); if (b) send(b.textContent); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) toggle(); });
    add('bot', 'Hi! 👋 I am the ' + BOT_NAME + '. What would you like to know?');
    chips();
  }
  function chips() {
    var el = $('cbChatChips'); if (!el) return;
    var list = role() === 'student' ? CHIPS : ['What is on the menu?', 'Cheapest item', 'Is the canteen open?', 'How do I pay?', 'Need help'];
    el.innerHTML = list.map(function (c) { return '<button type="button">' + esc(c) + '</button>'; }).join('');
  }
  function toggle() {
    var open = !panel.classList.contains('open');
    panel.classList.toggle('open', open); launcher.setAttribute('aria-expanded', String(open)); launcher.textContent = open ? '×' : '💬';
    if (open) { chips(); setTimeout(function () { input.focus(); }, 50); }
  }
  function add(who, html) {
    var d = document.createElement('div'); d.className = 'cbc-m ' + (who === 'bot' ? 'cbc-b' : 'cbc-u');
    if (who === 'bot') d.innerHTML = html; else d.textContent = html;
    log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
  }
  function send(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    add('user', text); hist.push({ role: 'user', text: text });
    var local = null;
    try { local = answer(text); } catch (e) { console.error('Chatbot error', e); }
    if (local) { add('bot', local.html); hist.push({ role: 'assistant', text: local.html.replace(/<[^>]+>/g, ' ') }); return; }
    if (AI_ENABLED && window.CBFn && role()) {
      busy = true; var wait = add('bot', '<span class="cbc-dots"><span></span><span></span><span></span></span>');
      CBFn.call('askCampusBite', { message: text, history: hist.slice(-7, -1), context: aiContext() })
        .then(function (r) { wait.innerHTML = esc(r.reply).replace(/\n/g, '<br>'); hist.push({ role: 'assistant', text: r.reply }); })
        .catch(function (e) { wait.innerHTML = esc(e.message || 'Sorry, I could not answer that.'); })
        .then(function () { busy = false; log.scrollTop = log.scrollHeight; });
      return;
    }
    add('bot', 'I am not sure about that one 🤔. Try asking about the <b>menu</b>, a food\'s <b>price</b>, <b>canteen timings</b>, your <b>order</b> or <b>wallet</b> — or use the <b>Help / Report</b> tab to reach the admin.');
  }

  function boot() { mount(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.CBChat = { open: function () { mount(); if (!panel.classList.contains('open')) toggle(); }, answer: answer };
})();
