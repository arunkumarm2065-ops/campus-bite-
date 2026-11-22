/* ==========================================================================
   CampusBite Mascots — mascot.js   (v2)
   A crew of funny 3D cartoon characters (pure CSS 3D, no images/libraries):
     🥟 Sammy the Samosa   🐱 Whiskers the Cat   🐶 Buddy the Dog   🐕 Spotty the Dalmatian
   • A DIFFERENT character appears every time (shuffled, never the same twice in a row).
   • They pop up rarely, stay brief, and pause while users are busy.
   • REAL-TIME: they watch the live menu + orders and announce changes the moment
     they happen (stock dropping, low stock, sold out, restock, new item, price change,
     new orders, order Ready/Completed/Cancelled, cart updates). Between events they
     share live facts ("3 orders cooking", "Only 6 Masala Sandwich left").
   • Click / tap a character: flip + joke. Eyes follow your pointer.

   Install: in index.html, right after animations.js:   <script src="mascot.js"></script>
   Console: CampusBiteMascot.show('run'|'peek'|'spin'[, 'cat'|'dog'|'dalmatian'|'samosa'])
            CampusBiteMascot.setEnabled(false)   (remembered)
   Honors prefers-reduced-motion and html.cb-off.
   ========================================================================== */
(function () {
  'use strict';
  var KEY = 'campusbite_mascot_off';
  var MIN_GAP = 45000, MAX_GAP = 90000, FIRST_DELAY = 12000, LOGIN_FIRST_DELAY = 6000, POLL = 1500;
  var MAX_SESSION = 12, LIVE_GAP = 20000, QUIET_MS = 3000, ACTIVITY_DELAY = 6000;
  var READ_BASE = 3800, READ_PER_CHAR = 70, READ_MAX = 14000;   // reading time: base + per character
  var holding = false, holdTimer = 0;                             // pointer on the mascot = stay until released
  var ADMIN_KEY = 'campusbite_mascot_admin';

  /* ---------------- characters ---------------- */
  var CHARS = {
    samosa: { name: 'Sammy', emoji: '🥟', type: 'tri', color: '#f59e0b', sound: '',
      jokes: ["I'm 100% samosa, 0% calories! 🤥", "Warning: I'm too hot to handle 🔥", "I'm not fried, I'm just crispy 😎", "Order me! I'm triangle-tastic!", "Bro, who ate my chutney?!"] },
    cat: { name: 'Whiskers', emoji: '🐱', type: 'round', color: '#fb923c', ear: 'point', sound: 'Meow! ',
      jokes: ["I knocked the menu off the table. Again.", "Is that tuna on the menu? No? Disappointing.", "I'm not lazy, I'm in power-saving mode 😴", "Feed me first, then ask questions.", "Purrfect timing for a snack!"] },
    dog: { name: 'Buddy', emoji: '🐶', type: 'round', color: '#d6a36b', ear: 'floppy', earColor: '#8b5a2b', sound: 'Woof! ',
      jokes: ["I can smell the samosas from here! 👃", "Throw me a snack, not a stick!", "Who's a good student? YOU are!", "Tail wagging at max speed 🐕", "I only bark for good food. Woof!"] },
    dalmatian: { name: 'Spotty', emoji: '🐕', type: 'round', color: '#f8fafc', ear: 'floppy', earColor: '#1f2937', spots: true, sound: 'Arf! ',
      jokes: ["I have 99 spots but no table booked!", "Count my spots, then order lunch!", "Chai break? I'm in! ☕", "I'm not fat, I'm fluffy and well-fed.", "Sit. Stay. Order. Good human!"] }
  };
  var ORDER = Object.keys(CHARS), lastChar = '';
  var LOGIN_LINES = [
    'Choose Student, Shop Owner, or Admin before signing in.',
    'Use the Campus ID or email and password assigned to you.',
    'Make sure the selected portal matches your account.',
    'Forgot your password? Use the reset link on this page.',
    'A samosa says: choose your role first, snack next!',
    'I never share passwords. Not even with the chutney!',
    'I came for a samosa and got promoted to login helper. 🥟',
    'Pick your portal, captain. The snack ship is ready! 🚀',
    'If signing in were a snack, I would order extra crispy.',
    'I can guard the chutney, but your password is your job!',
    'Portal picked? Great! My samosa senses are tingling.',
    'Your account is the VIP. I am just here for the snacks. 😄'
  ];

  var userOff = false, adminOn = true, randomVisits = 0, lastLive = 0, lastInput = 0;
  try {
    userOff = localStorage.getItem(KEY) === '1';
    adminOn = localStorage.getItem(ADMIN_KEY) !== '0';
  } catch (e) {}
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var timer = null, liveTimer = null, activityTimer = null, busy = false, root, wrap, body, bubble, pupils = [], cur = 'samosa';
  var showSource = 'random';
  var queue = [], annDone = {};   // annDone: callbacks fired when an announcement line is actually spoken

  /* ---------------- styles ---------------- */
  var css = '\
.cbm{position:fixed;left:0;top:0;width:110px;height:130px;z-index:9998;pointer-events:none;perspective:600px;will-change:transform;display:none}\
.cbm.on{display:block}\
.cbm-hit{position:absolute;inset:0;pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent}\
.cbm-wrap{position:absolute;inset:0;transform-style:preserve-3d}\
.cbm-body{position:absolute;inset:0;transform-style:preserve-3d;transform-origin:50% 60%}\
.cbm-hold{position:absolute;left:50%;top:50%;transform-style:preserve-3d;pointer-events:auto;cursor:pointer}\
.cbm-hold.tri{width:96px;height:112px;margin:-56px 0 0 -48px}\
.cbm-hold.round{width:90px;height:86px;margin:-40px 0 0 -45px}\
.cbm-layer{position:absolute;inset:0;background:var(--c)}\
.tri .cbm-layer{clip-path:polygon(50% 0,100% 100%,0 100%);border-radius:8px}\
.round .cbm-layer{border-radius:50% 50% 46% 46%}\
.cbm-spot{position:absolute;background:#1f2937;border-radius:50%;transform:translateZ(9px)}\
.cbm-ear{position:absolute;transform-style:preserve-3d}\
.cbm-ear.pt{top:-16px;width:30px;height:34px;background:var(--c);clip-path:polygon(50% 0,100% 100%,0 100%);transform:translateZ(2px)}\
.cbm-ear.pt::after{content:"";position:absolute;left:8px;top:12px;width:14px;height:20px;background:#f9a8d4;clip-path:polygon(50% 0,100% 100%,0 100%)}\
.cbm-ear.pt.l{left:4px;transform:translateZ(2px) rotate(-12deg)}.cbm-ear.pt.r{right:4px;transform:translateZ(2px) rotate(12deg)}\
.cbm-ear.fl{top:4px;width:24px;height:46px;background:var(--e);border-radius:50% 50% 55% 55%;border:2px solid rgba(0,0,0,.18);transform-origin:50% 0;animation:cbmEar .7s ease-in-out infinite alternate}\
.cbm-ear.fl.l{left:-14px;transform:translateZ(6px) rotate(14deg)}.cbm-ear.fl.r{right:-14px;transform:translateZ(6px) rotate(-14deg);animation-delay:.3s}\
@keyframes cbmEar{from{transform:translateZ(6px) rotate(10deg)}to{transform:translateZ(6px) rotate(24deg)}}\
.cbm-ear.fl.r{animation-name:cbmEarR}@keyframes cbmEarR{from{transform:translateZ(6px) rotate(-10deg)}to{transform:translateZ(6px) rotate(-24deg)}}\
.cbm-face{position:absolute;inset:0;transform:translateZ(14px);transform-style:preserve-3d}\
.cbm-eye{position:absolute;width:20px;height:24px;background:#fff;border-radius:50%;border:2px solid #451a03;overflow:hidden;animation:cbmBlink 4s infinite}\
.tri .cbm-eye{top:50px;width:22px;height:26px}.tri .cbm-eye.l{left:20px}.tri .cbm-eye.r{right:20px}\
.round .cbm-eye{top:22px}.round .cbm-eye.l{left:16px}.round .cbm-eye.r{right:16px}\
.cbm-pupil{position:absolute;left:50%;top:50%;width:10px;height:12px;margin:-6px 0 0 -5px;background:#111;border-radius:50%}\
.cbm-pupil::after{content:"";position:absolute;left:2px;top:2px;width:3px;height:3px;background:#fff;border-radius:50%}\
@keyframes cbmBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}\
.cbm-brow{position:absolute;top:42px;width:20px;height:4px;background:#451a03;border-radius:3px}\
.cbm-brow.l{left:19px;transform:rotate(-14deg)}.cbm-brow.r{right:19px;transform:rotate(14deg)}\
.cbm-mouth{position:absolute;left:50%;width:30px;height:15px;margin-left:-15px;background:#7f1d1d;border-radius:0 0 30px 30px;overflow:hidden;border:2px solid #451a03;border-top-width:1px}\
.tri .cbm-mouth{top:84px}\
.cbm-mouth::after{content:"";position:absolute;left:6px;bottom:-4px;width:14px;height:9px;background:#f87171;border-radius:50%}\
.cbm-cheek{position:absolute;width:11px;height:7px;background:#f87171;opacity:.55;border-radius:50%}\
.tri .cbm-cheek{top:74px}.tri .cbm-cheek.l{left:9px}.tri .cbm-cheek.r{right:9px}\
.round .cbm-cheek{top:52px}.round .cbm-cheek.l{left:6px}.round .cbm-cheek.r{right:6px}\
.cbm-snout{position:absolute;left:50%;top:44px;width:44px;height:32px;margin-left:-22px;background:#fef3c7;border-radius:50%;transform:translateZ(5px);box-shadow:inset 0 -3px 0 rgba(0,0,0,.08)}\
.cbm-nose{position:absolute;left:50%;margin-left:-7px;width:14px;height:10px;background:#1f2937;border-radius:50% 50% 60% 60%}\
.cbm-nose.cat{top:48px;background:#f472b6;border-radius:30% 30% 70% 70%;width:11px;margin-left:-5px;height:8px}\
.cbm-nose.dog{top:4px}\
.cbm-mouth.dog{top:62px;width:22px;height:12px;margin-left:-11px}\
.cbm-mouth.cat{top:58px;width:18px;height:9px;margin-left:-9px}\
.cbm-whisk{position:absolute;top:56px;width:26px;height:2px;background:#78350f;opacity:.7;border-radius:2px}\
.cbm-whisk.l{left:-8px}.cbm-whisk.r{right:-8px}\
.cbm-paw{position:absolute;top:74px;width:14px;height:14px;background:var(--pc,#fcd34d);border:2px solid rgba(0,0,0,.28);border-radius:50%;transform:translateZ(18px);animation:cbmArm .5s ease-in-out infinite alternate}\
.tri .cbm-paw{top:84px}.cbm-paw.l{left:-8px}.cbm-paw.r{right:-8px;animation-delay:.25s}\
@keyframes cbmArm{from{transform:translateZ(18px) translateY(0)}to{transform:translateZ(18px) translateY(-9px)}}\
.cbm-shadow{position:absolute;left:50%;bottom:-6px;width:70px;height:12px;margin-left:-35px;background:rgba(0,0,0,.25);border-radius:50%;filter:blur(3px)}\
.cbm-bubble{position:absolute;left:50%;bottom:100%;width:max-content;max-width:220px;transform:translate(-50%,6px) scale(.6);transform-origin:50% 100%;opacity:0;background:#fff;color:#1e293b;font:700 13px/1.3 system-ui,Arial,sans-serif;padding:8px 12px;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.2);transition:all .3s cubic-bezier(.34,1.56,.64,1);text-align:center;margin-bottom:4px;pointer-events:none}\
.cbm-bubble small{display:block;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#f97316;margin-bottom:2px}\
.cbm-bubble.live{border:2px solid #10b981}.cbm-bubble.live small{color:#10b981}\
.cbm-bubble::after{content:"";position:absolute;left:50%;top:100%;margin-left:-6px;border:6px solid transparent;border-top-color:#fff}\
.cbm-bubble.on{opacity:1;transform:translate(-50%,0) scale(1)}\
.cbm-bounce{animation:cbmBounce .45s ease-in-out infinite alternate}\
@keyframes cbmBounce{from{transform:translateY(0) rotateY(-18deg) rotateZ(-5deg)}to{transform:translateY(-16px) rotateY(18deg) rotateZ(5deg)}}\
.cbm-spin{animation:cbmSpin 1.6s cubic-bezier(.34,1.2,.64,1)}\
@keyframes cbmSpin{0%{transform:rotateY(0) scale(1)}50%{transform:rotateY(540deg) scale(1.25)}100%{transform:rotateY(720deg) scale(1)}}\
.cbm-flip{animation:cbmFlip .8s cubic-bezier(.34,1.3,.64,1)}\
@keyframes cbmFlip{0%{transform:translateY(0) rotateX(0)}40%{transform:translateY(-50px) rotateX(200deg) scale(1.2)}100%{transform:translateY(0) rotateX(360deg)}}\
.cbm-sway{animation:cbmSway 1.2s ease-in-out infinite alternate}\
@keyframes cbmSway{from{transform:rotateY(-25deg) rotateZ(-4deg)}to{transform:rotateY(25deg) rotateZ(4deg)}}\
html.cb-off .cbm{display:none!important}\
@media (prefers-reduced-motion:reduce){.cbm{display:none!important}}\
@media (max-width:640px){.cbm{width:90px;height:108px}.cbm-bubble{font-size:12px;max-width:170px}}';

  /* ---------------- build ---------------- */
  function shell() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    root = document.createElement('div');
    root.className = 'cbm'; root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<div class="cbm-shadow"></div><div class="cbm-wrap"><div class="cbm-body"></div></div><div class="cbm-bubble"></div>';
    document.body.appendChild(root);
    wrap = root.querySelector('.cbm-wrap'); body = root.querySelector('.cbm-body'); bubble = root.querySelector('.cbm-bubble');
    body.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.cbm-hold')) onPoke();
    });
    ['pointerdown', 'keydown', 'input', 'wheel', 'touchmove', 'scroll'].forEach(function (ev) {
      addEventListener(ev, function (e) {
        if (!(e.target && root.contains(e.target))) {
          lastInput = Date.now();
          clearTimeout(activityTimer);
          activityTimer = setTimeout(activityVisit, ACTIVITY_DELAY);
        }
      }, { passive: true, capture: true });
    });
    root.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') holding = true; });
    root.addEventListener('pointerleave', function () { holding = false; });
    root.addEventListener('pointerdown', function () {
      holding = true; clearTimeout(holdTimer); holdTimer = setTimeout(function () { holding = false; }, 5000);
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        schedule(randomVisits === 0 ? (loggedIn() ? FIRST_DELAY : LOGIN_FIRST_DELAY) : undefined);
        requestLive();
      }
    });
    addEventListener('pointermove', function (e) {
      if (!root.classList.contains('on')) return;
      var r = root.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      var d = Math.hypot(dx, dy) || 1, k = Math.min(3.5, d / 40);
      pupils.forEach(function (p) { p.style.transform = 'translate(' + (dx / d * k) + 'px,' + (dy / d * k) + 'px)'; });
    }, { passive: true });
  }

  function dress(key) {
    var c = CHARS[key]; cur = key;
    var L = '';
    for (var i = 0; i < 6; i++) L += '<div class="cbm-layer" style="transform:translateZ(' + (i * 4 - 12) + 'px);filter:brightness(' + (0.72 + i * 0.07).toFixed(2) + ')"></div>';
    var eyes = '<div class="cbm-eye l"><div class="cbm-pupil"></div></div><div class="cbm-eye r"><div class="cbm-pupil"></div></div>';
    var cheeks = '<div class="cbm-cheek l"></div><div class="cbm-cheek r"></div>';
    var paws = '<div class="cbm-paw l"></div><div class="cbm-paw r"></div>';
    var extra = '', face = '';
    if (c.type === 'tri') {
      face = '<div class="cbm-brow l"></div><div class="cbm-brow r"></div>' + eyes + cheeks + '<div class="cbm-mouth"></div>' + paws;
    } else {
      if (c.ear === 'point') extra = '<div class="cbm-ear pt l"></div><div class="cbm-ear pt r"></div>';
      else extra = '<div class="cbm-ear fl l"></div><div class="cbm-ear fl r"></div>';
      if (c.spots) extra += '<div class="cbm-spot" style="left:10px;top:8px;width:16px;height:14px"></div><div class="cbm-spot" style="right:12px;top:30px;width:12px;height:12px"></div><div class="cbm-spot" style="left:30px;top:2px;width:10px;height:9px"></div><div class="cbm-spot" style="left:6px;top:50px;width:11px;height:10px"></div>';
      if (c.ear === 'point') {
        face = eyes + cheeks + '<div class="cbm-nose cat"></div><div class="cbm-mouth cat"></div>' +
          '<div class="cbm-whisk l" style="transform:rotate(8deg)"></div><div class="cbm-whisk l" style="top:62px;transform:rotate(-8deg)"></div>' +
          '<div class="cbm-whisk r" style="transform:rotate(-8deg)"></div><div class="cbm-whisk r" style="top:62px;transform:rotate(8deg)"></div>' + paws;
      } else {
        face = eyes + cheeks + '<div class="cbm-snout"><div class="cbm-nose dog"></div></div><div class="cbm-mouth dog" style="z-index:2"></div>' + paws;
      }
    }
    body.innerHTML = '<div class="cbm-hold ' + c.type + '" style="--c:' + c.color + ';--e:' + (c.earColor || c.color) + '">' + L + extra + '<div class="cbm-face">' + face + '</div></div>';
    pupils = [].slice.call(body.querySelectorAll('.cbm-pupil'));
    if (c.spots) body.querySelectorAll('.cbm-paw').forEach(function (p) { p.style.setProperty('--pc', '#fff'); });
  }

  function nextChar() {
    var pool = ORDER.filter(function (k) { return k !== lastChar; });
    lastChar = pool[Math.floor(Math.random() * pool.length)];
    return lastChar;
  }

  /* ---------------- helpers ---------------- */
  function allowed() { return adminOn && !userOff && !reduce && !document.documentElement.classList.contains('cb-off') && !document.hidden; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function calm() {
    if (Date.now() - lastInput < QUIET_MS) return false;
    var dialogs = document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog[open]');
    for (var i = 0; i < dialogs.length; i++) {
      var style = getComputedStyle(dialogs[i]);
      if (style.display !== 'none' && style.visibility !== 'hidden' && dialogs[i].getClientRects().length) return false;
    }
    return true;
  }
  function say(text, ms, live) {
    var c = CHARS[cur];
    bubble.className = 'cbm-bubble' + (live ? ' live' : '');
    bubble.textContent = '';
    var s = document.createElement('small'); s.textContent = c.emoji + ' ' + c.name + (live ? (String(text).indexOf('📢') === 0 ? ' • announcement' : ' • live update') : '');
    bubble.appendChild(s); bubble.appendChild(document.createTextNode(text));
    void bubble.offsetWidth; bubble.classList.add('on');
    var dur = Math.min(READ_MAX, Math.max(ms || 0, READ_BASE + String(text).length * READ_PER_CHAR));
    return wait(dur).then(function holdOn() { return holding ? wait(400).then(holdOn) : 0; })
      .then(function () { bubble.classList.remove('on'); });
  }
  function setAnim(cls) { body.className = 'cbm-body' + (cls ? ' ' + cls : ''); }
  function place(x, y) { root.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }
  function move(x, y, ms, ease) {
    var from = root.style.transform || 'translate(0px,0px)';
    return root.animate([{ transform: from }, { transform: 'translate(' + x + 'px,' + y + 'px)' }],
      { duration: ms, easing: ease || 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }).finished
      .then(function () { place(x, y); });
  }
  function W() { return innerWidth; } function H() { return innerHeight; } function SZ() { return root.offsetWidth || 110; }
  function safeX() { var s = SZ(), m = Math.min(110, Math.max(10, (W() - s) / 2)); return rnd(m, W() - s - m); }

  /* what the mascot says: a pending live update, or a live fact, or a joke */
  function line() {
    if (showSource === 'live' && queue.length) { var qm = queue.shift(); if (annDone[qm]) { var cbf = annDone[qm]; delete annDone[qm]; try { cbf(); } catch (e) {} } return { t: qm, live: true }; }
    if (!loggedIn()) return { t: pick(LOGIN_LINES), live: false };
    if (Math.random() < 0.6) { var f = liveFact(); if (f) return { t: f, live: true }; }
    var c = CHARS[cur];
    return { t: (Math.random() < .35 ? c.sound : '') + pick(c.jokes), live: false };
  }
  function speak(ms) { var l = line(); return say(l.t, ms || (l.live ? 3200 : 2400), l.live); }

  /* ---------------- routines ---------------- */
  var routines = {
    peek: function () {
      var s = SZ(), x = safeX();
      place(x, H() + 10); setAnim('cbm-sway');
      return move(x, H() - s * 0.75, 600, 'cubic-bezier(.34,1.56,.64,1)')
        .then(function () { return speak(); })
        .then(function more() { return (showSource === 'live' && queue.length) ? speak().then(more) : 0; })
        .then(function () { return move(x, H() + 10, 450, 'ease-in'); });
    },
    run: function () {
      var s = SZ(), ltr = Math.random() > .5, y = H() - s - rnd(10, 60);
      var x0 = ltr ? -s - 10 : W() + 10, x1 = ltr ? W() + 10 : -s - 10, mid = (W() - s) / 2;
      place(x0, y); setAnim('cbm-bounce'); wrap.style.transform = ltr ? '' : 'scaleX(-1)';
      return move(mid, y, 2600, 'linear')
        .then(function () { setAnim('cbm-flip'); wrap.style.transform = ''; return speak(); })
        .then(function () { setAnim('cbm-bounce'); wrap.style.transform = ltr ? '' : 'scaleX(-1)'; return move(x1, y, 2600, 'linear'); });
    },
    spin: function () {
      var s = SZ(), x = safeX(), y = rnd(120, Math.max(160, H() - s - 100));
      place(x, y + 40); setAnim('cbm-spin');
      return move(x, y, 500, 'cubic-bezier(.34,1.56,.64,1)')
        .then(function () { return wait(1400); })
        .then(function () { return speak(); })
        .then(function () { return move(x, y - 30, 300).then(function () { return move(x, H() + 20, 500, 'ease-in'); }); });
    }
  };

  function show(kind, who, source) {
    source = source || 'random';
    if (busy || !root || !allowed() || (source === 'live' && !loggedIn()) || (source === 'random' && randomVisits >= MAX_SESSION)) return Promise.resolve(false);
    if (source !== 'admin' && !calm()) return Promise.resolve(false);
    busy = true;
    if (source === 'random') randomVisits++;
    showSource = source;
    dress(CHARS[who] ? who : nextChar());
    var name = routines[kind] ? kind : pick(Object.keys(routines));
    root.classList.add('on');
    return routines[name]().catch(function () {}).then(function () {
      root.classList.remove('on'); setAnim(''); wrap.style.transform = ''; bubble.classList.remove('on'); busy = false;
      if (queue.length) requestLive();
      return true;
    });
  }
  function onPoke() {
    if (!root.classList.contains('on')) return;
    setAnim(''); void body.offsetWidth; setAnim('cbm-flip');
    say((Math.random() < .5 ? CHARS[cur].sound : '') + pick(CHARS[cur].jokes), 2000);
  }
  function schedule(delay) {
    clearTimeout(timer);
    if (!adminOn || userOff || reduce || document.documentElement.classList.contains('cb-off') || randomVisits >= MAX_SESSION) return;
    timer = setTimeout(function () {
      show(undefined, undefined, 'random').then(function () { schedule(); });
    }, delay == null ? rnd(MIN_GAP, MAX_GAP) : delay);
  }

  function activityVisit() {
    if (!calm()) {
      activityTimer = setTimeout(activityVisit, ACTIVITY_DELAY);
      return;
    }
    show(undefined, undefined, 'random').then(function (shown) {
      if (shown) schedule();
    });
  }

  function requestLive() {
    clearTimeout(liveTimer);
    if (!queue.length || busy || !loggedIn() || !adminOn || userOff || reduce || document.documentElement.classList.contains('cb-off')) return;
    if (document.hidden) return;
    var waitFor = LIVE_GAP - (Date.now() - lastLive);
    if (waitFor > 0) {
      liveTimer = setTimeout(requestLive, waitFor);
      return;
    }
    if (!calm()) {
      liveTimer = setTimeout(requestLive, 1000);
      return;
    }
    lastLive = Date.now();
    show('peek', undefined, 'live').then(function () {
      if (queue.length) requestLive();
    });
  }

  /* ---------------- REAL-TIME WATCHER ---------------- */
  function g(name) { try { return (0, eval)(name); } catch (e) { return undefined; } }
  function loggedIn() { var r = g('typeof currentRole!=="undefined"?currentRole:null'); return !!r; }
  function firstDelay() { return loggedIn() ? FIRST_DELAY : LOGIN_FIRST_DELAY; }
  function menuList() { var m = g('typeof menu!=="undefined"?menu:null'); return Array.isArray(m) ? m : []; }
  function orderList() { var o = g('typeof orders!=="undefined"?orders:null'); return Array.isArray(o) ? o : []; }

  var base = null, baseAt = 0, wasIn = false;
  function snap() {
    var m = {}, o = {};
    var os = {}, tk = {}, r = role();
    menuList().forEach(function (x) {
      var own = r === 'owner' ? ownsItem(x) : true;
      m[x.id] = { n: x.name, q: Number(x.qty || 0), p: x.price, a: x.active !== false, e: x.emoji || '🍽️', sn: x.shopName || 'Main Canteen', own: own };
    });
    orderList().forEach(function (x) { if (x && x.token) { o[x.token] = x.status || ''; os[x.token] = x; } });
    (g('typeof reports!=="undefined"?reports:null') || []).forEach(function (t) { if (t && t.id != null) tk[t.id] = { no: t.no || t.id, sub: t.subject || '', pr: t.priority || '', st: t.status || '' }; });
    return { m: m, o: o, os: os, tk: tk };
  }
  function push(msg) { if (queue.indexOf(msg) < 0 && queue.length < 3) queue.push(msg); }

  function role() { return g('typeof currentRole!=="undefined"?currentRole:null') || ''; }
  function lowLevel() { try { return window.CBMaster ? CBMaster.lowStock() : 10; } catch (e) { return 10; } }
  function ownsItem(x) {
    try { if (typeof isCurrentOwnersItem === 'function' && isCurrentOwnersItem(x)) return true; } catch (e) {}
    var u = g('typeof currentUser!=="undefined"?currentUser:null') || {};
    return !u.shopId && !x.shopId && !x.ownerId;        // simple/local setups with no shop IDs: one shared canteen
  }
  function ownsOrder(o) {
    if (role() !== 'owner') return true;
    var u = g('typeof currentUser!=="undefined"?currentUser:null') || {};
    try { if (typeof isCurrentOwnersOrder === 'function') return !!isCurrentOwnersOrder(o); } catch (e) {}
    return !u.shopId || o.shopId === u.shopId;
  }
  /* Shop owner: only THEIR canteen.  Admin: every canteen + tickets + cancellations. */
  function staffPoll(now) {
    var admin = role() === 'admin', th = lowLevel(), msgs = [];
    Object.keys(now.m).forEach(function (id) {
      var a = now.m[id], b = base.m[id]; if (!b || !a.own) return;
      var where = admin ? ' (' + a.sn + ')' : '';
      if (a.q <= 0 && b.q > 0) msgs.push('😱 ' + a.n + ' is SOLD OUT' + where + '!');
      else if (a.q > 0 && a.q <= th && b.q > th) msgs.push('⚠️ Low stock: only ' + a.q + ' ' + a.n + ' left' + where + '.');
      else if (a.q > 0 && a.q <= th && a.q < b.q) msgs.push('📉 ' + a.n + ' down to ' + a.q + where + ' — restock soon.');
      else if (a.q > b.q && b.q <= th) msgs.push('📦 ' + a.n + ' restocked: ' + a.q + where + '.');
      if (admin && b.a && !a.a) msgs.push('🚫 ' + a.n + ' was switched off' + where + '.');
    });
    Object.keys(now.o).forEach(function (t) {
      var ord = now.os[t]; if (!ord || !ownsOrder(ord)) return;
      var where = admin && ord.shopName ? ' at ' + ord.shopName : '';
      if (!(t in base.o)) { if (!admin) msgs.push('🧾 New order ' + t + ' just came in!'); }
      else if (now.o[t] !== base.o[t]) {
        var st = now.o[t];
        if (st === 'Cancelled') msgs.push('❌ Order ' + t + ' was cancelled' + where + '.');
        else if (st === 'Refunded') msgs.push('💸 Order ' + t + ' was refunded' + where + '.');
        else if (!admin && st === 'Ready') msgs.push('🔔 Order ' + t + ' marked Ready.');
      }
    });
    if (admin) Object.keys(now.tk).forEach(function (id) {
      var t = now.tk[id];
      if (!(id in base.tk)) msgs.push((/high|crit|urgent/i.test(t.pr) ? '🚨 ' : '🎫 ') + 'New ticket ' + t.no + (t.pr ? ' (' + t.pr + ')' : '') + ': ' + t.sub);
    });
    msgs.slice(0, 3).forEach(push);
    if (msgs.length) requestLive();
  }
  function staffFact() {
    var admin = role() === 'admin', th = lowLevel(), facts = [];
    var items = menuList().filter(function (x) {
      if (x.active === false) return false;
      return admin ? true : ownsItem(x);
    });
    var low = items.filter(function (x) { return x.qty > 0 && x.qty <= th; }).sort(function (a, b) { return a.qty - b.qty; });
    var out = items.filter(function (x) { return !(x.qty > 0); });
    var lab = function (x) { return x.name + ' (' + x.qty + (admin ? ', ' + (x.shopName || 'Main Canteen') : '') + ')'; };
    if (low.length) facts.push('⚠️ Low stock (' + low.length + '): ' + low.slice(0, 3).map(lab).join(', ') + (low.length > 3 ? ' …' : ''));
    if (out.length) facts.push('😢 Sold out: ' + out.slice(0, 3).map(function (x) { return x.name + (admin ? ' (' + (x.shopName || 'Main Canteen') + ')' : ''); }).join(', ') + (out.length > 3 ? ' …' : ''));
    var cooking = orderList().filter(function (x) { return x && /prepar/i.test(x.status || '') && ownsOrder(x); }).length;
    if (cooking) facts.push('👨‍🍳 ' + cooking + ' order' + (cooking > 1 ? 's' : '') + ' cooking right now.');
    if (admin) {
      var open = (g('typeof reports!=="undefined"?reports:null') || []).filter(function (r) { return r && r.status !== 'Closed' && r.status !== 'Resolved'; }).length;
      if (open) facts.push('🎫 ' + open + ' open ticket' + (open > 1 ? 's' : '') + ' need attention.');
      try {
        var c = window.CBMaster && CBMaster.config;
        if (c && c.ordering.enabled === false) facts.push('⏸️ Ordering is PAUSED for everyone.');
        var closed = c ? Object.keys(c.closedShops || {}).length : 0;
        if (closed) facts.push('🏪 ' + closed + ' canteen' + (closed > 1 ? 's are' : ' is') + ' closed by admin.');
      } catch (e) {}
    }
    if (!facts.length) facts.push('✅ All stock levels look healthy.');
    return facts[Math.floor(Math.random() * facts.length)];
  }

  function poll() {
    adminSetup();
    var inNow = loggedIn();
    if (inNow && !wasIn) {
      base = null;
      baseAt = Date.now() + 2500;
      if (!timer) schedule(FIRST_DELAY);
    }
    if (!inNow && wasIn) {
      clearTimeout(liveTimer);
      queue.length = 0;
      base = null;
      if (root) { root.classList.remove('on'); bubble.classList.remove('on'); }
      schedule(LOGIN_FIRST_DELAY);
    }
    wasIn = inNow;
    if (!inNow) return;
    if (!allowed()) return;
    var now = snap();
    if (!base || Date.now() < baseAt) { base = now; return; }
    if (role() === 'owner' || role() === 'admin') { staffPoll(now); base = now; return; }   // students keep the original live-menu updates below
    var msgs = [], changed = 0, i;
    Object.keys(now.m).forEach(function (id) {
      var a = now.m[id], b = base.m[id];
      if (!b) { changed++; msgs.push('🆕 New on the menu: ' + a.e + ' ' + a.n + ' for ₹' + a.p + '!'); return; }
      if (a.q !== b.q || a.p !== b.p || a.a !== b.a) changed++;
      if (b.a && !a.a) msgs.push('🚫 ' + a.n + ' is no longer available.');
      else if (!b.a && a.a) msgs.push('✅ ' + a.n + ' is back on the menu!');
      else if (a.q <= 0 && b.q > 0) msgs.push('😱 ' + a.n + ' just SOLD OUT!');
      else if (a.q > b.q && b.q <= 0) msgs.push('🎉 ' + a.n + ' is back in stock (' + a.q + ')!');
      else if (a.q <= 10 && a.q > 0 && b.q > 10) msgs.push('⚠️ Low stock! Only ' + a.q + ' ' + a.n + ' left.');
      else if (a.q < b.q) msgs.push('🔥 Someone just grabbed ' + a.n + '! ' + a.q + ' left.');
      else if (a.q > b.q) msgs.push('📦 ' + a.n + ' restocked: ' + a.q + ' available.');
      if (a.p !== b.p) msgs.push('💰 ' + a.n + ' price changed: ₹' + b.p + ' → ₹' + a.p + '.');
    });
    Object.keys(base.m).forEach(function (id) { if (!now.m[id]) { changed++; msgs.push('🗑️ ' + base.m[id].n + ' was removed from the menu.'); } });
    Object.keys(now.o).forEach(function (t) {
      if (!(t in base.o)) msgs.push('🧾 New order ' + t + ' just came in!');
      else if (now.o[t] !== base.o[t]) {
        var s = now.o[t];
        msgs.push((s === 'Ready' ? '🔔 Order ' + t + ' is READY for pickup!' : s === 'Completed' ? '✅ Order ' + t + ' completed. Enjoy!' : s === 'Cancelled' ? '❌ Order ' + t + ' was cancelled.' : '👨‍🍳 Order ' + t + ' is now ' + s + '.'));
      }
    });
    base = now;
    if (!msgs.length) return;
    if (changed > 4) msgs = ['📢 Menu updated live: ' + changed + ' items changed!'];
    msgs.slice(0, 3).forEach(push);
    requestLive();
  }

  function liveFact() {
    if (role() === 'owner' || role() === 'admin') return staffFact();
    var m = menuList().filter(function (x) { return x.active !== false; }), o = orderList();
    var cooking = o.filter(function (x) { return x && /prepar/i.test(x.status || ''); }).length;
    var ready = o.filter(function (x) { return x && x.status === 'Ready'; }).length;
    var low = m.filter(function (x) { return x.qty > 0 && x.qty <= 10; });
    var out = m.filter(function (x) { return !(x.qty > 0); });
    var facts = [];
    if (m.length) {
      var f = pick(m); facts.push((f.emoji || '🍽️') + ' ' + f.name + ': ₹' + f.price + ', ' + (f.qty > 0 ? f.qty + ' left' : 'sold out') + '.');
      var cheap = m.slice().sort(function (a, b) { return a.price - b.price; })[0];
      facts.push('💸 Cheapest bite right now: ' + cheap.name + ' at ₹' + cheap.price + '.');
      facts.push('📋 ' + m.length + ' items live on the menu.');
    }
    if (cooking) facts.push('👨‍🍳 ' + cooking + ' order' + (cooking > 1 ? 's' : '') + ' cooking right now!');
    if (ready) facts.push('🔔 ' + ready + ' order' + (ready > 1 ? 's' : '') + ' ready for pickup!');
    if (low.length) { var l = pick(low); facts.push('⚠️ Hurry! Only ' + l.qty + ' ' + l.name + ' left.'); }
    if (out.length) facts.push('😢 Sold out: ' + out.slice(0, 2).map(function (x) { return x.name; }).join(', ') + '.');
    return facts.length ? pick(facts) : null;
  }

  var fsHooked = false, card = null, saveInProgress = false, cardMessage = '';
  function mascotDoc() {
    try {
      if (!window.firebase || !firebase.firestore) return null;
      return firebase.firestore().collection('campusbite').doc('mascot');
    } catch (error) {
      console.error('Could not access the mascot setting in Firestore:', error);
      return null;
    }
  }
  function setCardMessage(message) {
    cardMessage = message || '';
    paintCard();
  }
  function paintCard() {
    if (!card) return;
    var toggle = card.querySelector('#cbMascotSwitch');
    var status = card.querySelector('#cbMascotState');
    if (!toggle || !status) return;
    toggle.setAttribute('aria-checked', String(adminOn));
    toggle.disabled = saveInProgress;
    toggle.style.background = adminOn ? '#10b981' : '#cbd5e1';
    toggle.firstChild.style.transform = adminOn ? 'translateX(22px)' : 'translateX(0)';
    status.textContent = saveInProgress ? 'Saving…' : (cardMessage || (adminOn ? 'ON for all users' : 'OFF for all users'));
  }
  function applyAdmin(on) {
    var changed = adminOn !== (on !== false);
    adminOn = on !== false;
    try { localStorage.setItem(ADMIN_KEY, adminOn ? '1' : '0'); } catch (error) {
      console.warn('Could not remember the mascot setting in this browser:', error);
    }
    if (!adminOn) {
      clearTimeout(timer);
      clearTimeout(liveTimer);
      queue.length = 0;
      if (root) { root.classList.remove('on'); bubble.classList.remove('on'); }
    } else if (changed) {
      schedule(firstDelay());
      requestLive();
    }
    paintCard();
  }
  function connectAdminSetting() {
    if (fsHooked) return;
    var ref = mascotDoc();
    if (!ref) {
      setCardMessage('Cloud setting unavailable; using this browser’s setting.');
      return;
    }
    fsHooked = true;
    ref.onSnapshot(function (snapshot) {
      if (!snapshot.exists) {
        setCardMessage('Using this browser setting until an admin saves one.');
        return;
      }
      var setting = snapshot.data();
      if (!setting || typeof setting.enabled !== 'boolean') {
        console.error('Invalid mascot setting in Firestore: expected a boolean "enabled" value.');
        setCardMessage('Cloud setting is invalid; using this browser’s setting.');
        return;
      }
      cardMessage = '';
      applyAdmin(setting.enabled);
    }, function (error) {
      console.error('Could not read the shared mascot setting from Firestore:', error);
      setCardMessage('Cloud setting unavailable; using this browser’s setting.');
    });
  }
  function adminSetup() {
    var role = g('typeof currentRole!=="undefined"?currentRole:null');
    var view = document.getElementById('adminView');
    if (role !== 'admin' || !view) {
      if (card && card.parentNode) card.remove();
      card = null;
      return;
    }
    if (card && card.parentNode === view) return;

    card = document.createElement('section');
    card.id = 'cbMascotCard';
    card.className = 'bg-white rounded-2xl border border-slate-200 p-4 shadow-sm mb-4 flex flex-wrap items-center gap-3 justify-between';
    card.innerHTML = '<div><h3 class="font-black">🐾 Fun Mascots</h3><p class="text-xs text-slate-500">Sammy, Whiskers, Buddy &amp; Spotty pop up briefly with live food updates. Status: <b id="cbMascotState"></b></p></div>' +
      '<div class="flex items-center gap-3"><button type="button" id="cbMascotTest" class="px-3 py-2 rounded-xl bg-slate-100 font-bold text-sm">Test now</button>' +
      '<button type="button" id="cbMascotSwitch" role="switch" aria-label="Turn mascots on or off" style="position:relative;width:52px;height:30px;border-radius:9999px;border:0;cursor:pointer;transition:background .2s"><span style="position:absolute;left:4px;top:4px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .2s"></span></button></div>';
    view.insertBefore(card, view.firstChild);
    card.querySelector('#cbMascotSwitch').addEventListener('click', function () {
      if (saveInProgress) return;
      var ref = mascotDoc();
      if (!ref) {
        alert('Could not save the mascot setting. Check Firebase configuration and Firestore rules.');
        return;
      }
      var previous = adminOn, next = !adminOn;
      saveInProgress = true;
      cardMessage = '';
      applyAdmin(next);
      paintCard();
      try {
        ref.set({ enabled: next, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
          .then(function () { cardMessage = 'Saved for all users.'; })
          .catch(function (error) {
            console.error('Could not save the shared mascot setting:', error);
            cardMessage = '';
            applyAdmin(previous);
            alert('Could not save the mascot setting. Check that Firestore rules allow admins to update it.');
          })
          .finally(function () {
            saveInProgress = false;
            paintCard();
          });
      } catch (error) {
        console.error('Could not save the shared mascot setting:', error);
        saveInProgress = false;
        cardMessage = '';
        applyAdmin(previous);
        paintCard();
        alert('Could not save the mascot setting. Check that Firestore rules allow admins to update it.');
      }
    });
    card.querySelector('#cbMascotTest').addEventListener('click', function () {
      if (!adminOn) { alert('Mascots are OFF. Turn the switch on first.'); return; }
      if (userOff) { alert('Mascots are disabled in this browser.'); return; }
      show('peek', pick(ORDER), 'admin');
    });
    paintCard();
  }

  /* ---------------- init ---------------- */
  function init() {
    shell();
    connectAdminSetting();
    adminSetup();
    schedule(firstDelay());
    setInterval(poll, POLL);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();

  window.CampusBiteMascot = {
    /* Make a mascot read an announcement aloud (front of the live queue).
       onSpoken() fires once the mascot has really said it. Returns false if it could not be queued. */
    announce: function (text, onSpoken) {
      text = String(text || '').trim();
      if (!text) return false;
      var msg = '📢 ' + text.slice(0, 160);
      if (queue.indexOf(msg) < 0) queue.unshift(msg);
      if (queue.length > 4) queue.length = 4;
      if (typeof onSpoken === 'function') annDone[msg] = onSpoken;
      requestLive();
      return true;
    },
    show: function (kind, who) { return show(kind, who, 'random'); },
    setEnabled: function (v) {
      userOff = !v; try { localStorage.setItem(KEY, v ? '0' : '1'); } catch (e) {}
      if (v) { schedule(); requestLive(); }
      else {
        clearTimeout(timer);
        clearTimeout(liveTimer);
        if (root) { root.classList.remove('on'); bubble.classList.remove('on'); }
      }
    }
  };
})();
/* ==========================================================================
   CampusBite Mascot — mascot.js
   "Sammy the Samosa": a funny 3D cartoon character (pure CSS 3D, no images,
   no libraries) that randomly pops up on the page.

   Install: add ONE line in index.html, right after animations.js:
     <script src="mascot.js"></script>

   Behaviours (picked at random every 8-20 seconds):
     peek   - pokes up from the bottom edge, looks around, hides
     run    - sprints across the screen, bouncing and flipping
     spin   - appears mid-screen, spins in 3D, says a joke, vanishes
   Click / tap him: he does a flip and says something silly.
   Tip: his eyes follow your mouse / finger.

   Turn off:  CampusBiteMascot.setEnabled(false)   (remembered in browser)
   Force one: CampusBiteMascot.show('run')
   Honors prefers-reduced-motion and the page's html.cb-off setting.
   ========================================================================== */
(function () {
  'use strict';
  if (window.CampusBiteMascot) return;

  var KEY = 'campusbite_mascot_off';
  var MIN_GAP = 8000, MAX_GAP = 20000;
  var MAX_PER_LOGIN = 4;
  var JOKES = [
    "I'm 100% samosa, 0% calories! 🤥",
    "Don't skip the queue... I'm already in it!",
    "Warning: I'm too hot to handle 🔥",
    "Roses are red, samosas are fried 🎵",
    "Order me! I'm triangle-tastic!",
    "Exams are tough. Chai is tougher ☕",
    "Hey! Eyes up here, not at the menu 👀",
    "I did 3 flips for this order!",
    "Bro, who ate my chutney?!",
    "Studying on an empty stomach? Never!",
    "I'm not fried, I'm just crispy 😎",
    "Free hugs! (Not free samosas.)"
  ];

  var userOff = false;
  try { userOff = localStorage.getItem(KEY) === '1'; } catch (e) {}

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var timer = null, busy = false, root, el, bubble, pupils = [];
  var signedIn = false, shownThisLogin = 0;

  /* ---------------- styles ---------------- */
  var css = '\
.cbm{position:fixed;left:0;top:0;width:110px;height:130px;z-index:9998;pointer-events:none;\
 perspective:600px;will-change:transform;display:none}\
.cbm.on{display:block}\
.cbm-hit{position:absolute;inset:0;pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent}\
.cbm-body{position:absolute;inset:0;transform-style:preserve-3d;transform-origin:50% 60%}\
.cbm-layer{position:absolute;left:50%;top:50%;width:96px;height:112px;margin:-56px 0 0 -48px;\
 clip-path:polygon(50% 0,100% 100%,0 100%);border-radius:8px}\
.cbm-l0{background:#b45309;transform:translateZ(-12px)}\
.cbm-l1{background:#c2680c;transform:translateZ(-8px)}\
.cbm-l2{background:#d97706;transform:translateZ(-4px)}\
.cbm-l3{background:#e68a12;transform:translateZ(0)}\
.cbm-l4{background:#f59e0b;transform:translateZ(4px)}\
.cbm-l5{background:linear-gradient(160deg,#fcd34d,#f59e0b 60%,#d97706);transform:translateZ(8px)}\
.cbm-face{position:absolute;left:50%;top:50%;width:96px;height:112px;margin:-56px 0 0 -48px;\
 transform:translateZ(14px);transform-style:preserve-3d}\
.cbm-eye{position:absolute;top:50px;width:22px;height:26px;background:#fff;border-radius:50%;\
 border:2px solid #451a03;overflow:hidden;animation:cbmBlink 4s infinite}\
.cbm-eye.l{left:20px}.cbm-eye.r{right:20px}\
.cbm-pupil{position:absolute;left:50%;top:50%;width:10px;height:12px;margin:-6px 0 0 -5px;\
 background:#111;border-radius:50%}\
.cbm-pupil::after{content:"";position:absolute;left:2px;top:2px;width:3px;height:3px;background:#fff;border-radius:50%}\
@keyframes cbmBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}\
.cbm-brow{position:absolute;top:42px;width:20px;height:4px;background:#451a03;border-radius:3px}\
.cbm-brow.l{left:19px;transform:rotate(-14deg)}.cbm-brow.r{right:19px;transform:rotate(14deg)}\
.cbm-mouth{position:absolute;left:50%;top:84px;width:30px;height:15px;margin-left:-15px;\
 background:#7f1d1d;border-radius:0 0 30px 30px;overflow:hidden;border:2px solid #451a03;border-top-width:1px}\
.cbm-mouth::after{content:"";position:absolute;left:6px;bottom:-4px;width:14px;height:9px;background:#f87171;border-radius:50%}\
.cbm-cheek{position:absolute;top:74px;width:11px;height:7px;background:#f87171;opacity:.55;border-radius:50%}\
.cbm-cheek.l{left:9px}.cbm-cheek.r{right:9px}\
.cbm-arm{position:absolute;top:84px;width:14px;height:14px;background:#fcd34d;border:2px solid #92400e;\
 border-radius:50%;transform:translateZ(18px);animation:cbmArm .5s ease-in-out infinite alternate}\
.cbm-arm.l{left:-8px}.cbm-arm.r{right:-8px;animation-delay:.25s}\
@keyframes cbmArm{from{transform:translateZ(18px) translateY(0)}to{transform:translateZ(18px) translateY(-9px)}}\
.cbm-shadow{position:absolute;left:50%;bottom:-6px;width:70px;height:12px;margin-left:-35px;\
 background:rgba(0,0,0,.25);border-radius:50%;filter:blur(3px)}\
.cbm-bubble{position:absolute;left:50%;bottom:100%;width:max-content;max-width:210px;\
 transform:translate(-50%,6px) scale(.6);transform-origin:50% 100%;opacity:0;\
 background:#fff;color:#1e293b;font:700 13px/1.3 system-ui,Arial,sans-serif;padding:8px 12px;\
 border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.2);transition:all .3s cubic-bezier(.34,1.56,.64,1);\
 text-align:center;margin-bottom:4px;pointer-events:none}\
.cbm-bubble::after{content:"";position:absolute;left:50%;top:100%;margin-left:-6px;border:6px solid transparent;border-top-color:#fff}\
.cbm-bubble.on{opacity:1;transform:translate(-50%,0) scale(1)}\
.cbm-bounce{animation:cbmBounce .45s ease-in-out infinite alternate}\
@keyframes cbmBounce{from{transform:translateY(0) rotateY(-18deg) rotateZ(-5deg)}to{transform:translateY(-16px) rotateY(18deg) rotateZ(5deg)}}\
.cbm-spin{animation:cbmSpin 1.6s cubic-bezier(.34,1.2,.64,1)}\
@keyframes cbmSpin{0%{transform:rotateY(0) scale(1)}50%{transform:rotateY(540deg) scale(1.25)}100%{transform:rotateY(720deg) scale(1)}}\
.cbm-flip{animation:cbmFlip .8s cubic-bezier(.34,1.3,.64,1)}\
@keyframes cbmFlip{0%{transform:translateY(0) rotateX(0)}40%{transform:translateY(-50px) rotateX(200deg) scale(1.2)}100%{transform:translateY(0) rotateX(360deg)}}\
.cbm-sway{animation:cbmSway 1.2s ease-in-out infinite alternate}\
@keyframes cbmSway{from{transform:rotateY(-25deg) rotateZ(-4deg)}to{transform:rotateY(25deg) rotateZ(4deg)}}\
html.cb-off .cbm{display:none!important}\
@media (prefers-reduced-motion:reduce){.cbm{display:none!important}}\
@media (max-width:640px){.cbm{width:84px;height:100px}.cbm-bubble{font-size:12px;max-width:170px}}';

  /* ---------------- build DOM ---------------- */
  function build() {
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    root = document.createElement('div');
    root.className = 'cbm';
    root.setAttribute('aria-hidden', 'true');
    var layers = '';
    for (var i = 0; i < 6; i++) layers += '<div class="cbm-layer cbm-l' + i + '"></div>';
    root.innerHTML =
      '<div class="cbm-shadow"></div>' +
      '<div class="cbm-body">' + layers +
        '<div class="cbm-face">' +
          '<div class="cbm-brow l"></div><div class="cbm-brow r"></div>' +
          '<div class="cbm-eye l"><div class="cbm-pupil"></div></div>' +
          '<div class="cbm-eye r"><div class="cbm-pupil"></div></div>' +
          '<div class="cbm-cheek l"></div><div class="cbm-cheek r"></div>' +
          '<div class="cbm-mouth"></div>' +
          '<div class="cbm-arm l"></div><div class="cbm-arm r"></div>' +
        '</div>' +
      '</div>' +
      '<div class="cbm-bubble"></div>' +
      '<div class="cbm-hit"></div>';
    document.body.appendChild(root);

    el = root.querySelector('.cbm-body');
    bubble = root.querySelector('.cbm-bubble');
    pupils = [].slice.call(root.querySelectorAll('.cbm-pupil'));

    root.querySelector('.cbm-hit').addEventListener('click', onPoke);

    var look = function (x, y) {
      var r = root.getBoundingClientRect();
      var dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
      var d = Math.hypot(dx, dy) || 1, k = Math.min(3.5, d / 40);
      pupils.forEach(function (p) {
        p.style.transform = 'translate(' + (dx / d * k) + 'px,' + (dy / d * k) + 'px)';
      });
    };
    addEventListener('pointermove', function (e) { if (root.classList.contains('on')) look(e.clientX, e.clientY); }, { passive: true });
  }

  /* ---------------- helpers ---------------- */
  function isLoggedIn() {
    var loginView = document.getElementById('loginView');
    var logoutBtn = document.getElementById('logoutBtn');
    return !!(loginView && loginView.classList.contains('hidden') &&
      logoutBtn && !logoutBtn.classList.contains('hidden'));
  }
  function allowed() {
    return signedIn && !userOff && !reduce && !document.documentElement.classList.contains('cb-off') && !document.hidden;
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function say(text, ms) {
    bubble.textContent = text;
    bubble.classList.add('on');
    return wait(ms || 2200).then(function () { bubble.classList.remove('on'); });
  }
  function setAnim(cls) {
    el.className = 'cbm-body' + (cls ? ' ' + cls : '');
  }
  function move(x, y, rot, ms, ease) {
    return root.animate(
      [{ transform: root.style.transform || 'translate(0,0)' },
       { transform: 'translate(' + x + 'px,' + y + 'px) rotate(' + (rot || 0) + 'deg)' }],
      { duration: ms, easing: ease || 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }
    ).finished.then(function () {
      root.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + (rot || 0) + 'deg)';
    });
  }
  function place(x, y, rot) {
    root.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + (rot || 0) + 'deg)';
  }

  /* ---------------- routines ---------------- */
  var W = function () { return innerWidth; }, H = function () { return innerHeight; };
  var SZ = function () { return root.offsetWidth || 110; };

  var routines = {
    peek: function () {
      var s = SZ(), x = rnd(20, W() - s - 20);
      place(x, H() + 10, 0);
      root.classList.add('on'); setAnim('cbm-sway');
      return move(x, H() - s * 0.75, 0, 600, 'cubic-bezier(.34,1.56,.64,1)')
        .then(function () { return say(pick(JOKES), 2400); })
        .then(function () { return move(x, H() + 10, 0, 450, 'ease-in'); });
    },
    run: function () {
      var s = SZ(), ltr = Math.random() > .5, y = H() - s - rnd(10, 60);
      var x0 = ltr ? -s - 10 : W() + 10, x1 = ltr ? W() + 10 : -s - s;
      place(x0, y, 0);
      root.classList.add('on'); setAnim('cbm-bounce');
      root.style.scale = ltr ? '1' : '-1 1';
      bubble.style.transform = '';
      var mid = (x0 + x1) / 2;
      return move(mid, y, 0, 1800, 'linear')
        .then(function () { setAnim('cbm-flip'); root.style.scale = '1'; return say(pick(JOKES), 1700); })
        .then(function () { setAnim('cbm-bounce'); root.style.scale = ltr ? '1' : '-1 1'; return move(x1, y, 0, 1800, 'linear'); })
        .then(function () { root.style.scale = '1'; });
    },
    spin: function () {
      var s = SZ(), x = rnd(40, W() - s - 40), y = rnd(100, Math.max(140, H() - s - 100));
      place(x, y + 40, 0);
      root.classList.add('on'); setAnim('cbm-spin');
      return move(x, y, 0, 500, 'cubic-bezier(.34,1.56,.64,1)')
        .then(function () { return wait(1100); })
        .then(function () { return say(pick(JOKES), 2200); })
        .then(function () { return move(x, y - 30, 0, 300).then(function () { return move(x, H() + 20, 0, 500, 'ease-in'); }); });
    }
  };

  function show(kind) {
    if (busy || !root || !allowed() || shownThisLogin >= MAX_PER_LOGIN) return Promise.resolve();
    busy = true;
    shownThisLogin++;
    var name = routines[kind] ? kind : pick(Object.keys(routines));
    return routines[name]().catch(function () {}).then(function () {
      root.classList.remove('on'); setAnim('');
      bubble.classList.remove('on');
      busy = false;
    });
  }

  function onPoke() {
    if (!root.classList.contains('on')) return;
    setAnim('');
    void el.offsetWidth;
    setAnim('cbm-flip');
    say(pick(JOKES), 2000);
  }

  function schedule() {
    clearTimeout(timer);
    if (!signedIn || shownThisLogin >= MAX_PER_LOGIN) return;
    timer = setTimeout(function () {
      show().then(schedule);
    }, rnd(MIN_GAP, MAX_GAP));
  }

  /* ---------------- init ---------------- */
  function syncLoginState() {
    var nextSignedIn = isLoggedIn();
    if (nextSignedIn === signedIn) return;
    signedIn = nextSignedIn;
    clearTimeout(timer);
    if (signedIn) {
      shownThisLogin = 0;
      timer = setTimeout(function () { show('peek').then(schedule); }, 3500);
    } else {
      if (root) root.classList.remove('on');
      if (bubble) bubble.classList.remove('on');
    }
  }

  function init() {
    build();
    syncLoginState();
    ['loginView', 'logoutBtn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) new MutationObserver(syncLoginState).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.CampusBiteMascot = {
    show: show,
    setEnabled: function (v) {
      userOff = !v;
      try { localStorage.setItem(KEY, v ? '0' : '1'); } catch (e) {}
      if (v) schedule(); else { clearTimeout(timer); if (root) root.classList.remove('on'); }
    }
  };
})();
