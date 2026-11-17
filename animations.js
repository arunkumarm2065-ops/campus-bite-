/* ==========================================================================
   CampusBite Motion — animations.js
   Interactive animations for the CampusBite app. Drop-in, no dependencies.

   Add this just before </body>, AFTER all the other <script> blocks:
       <script src="animations.js"></script>

   It only OBSERVES the page (clicks + DOM changes). It never reads or writes
   Firebase / Firestore, so login, live sync and security rules are untouched.

   What it adds
     • New menu cards slide in one-by-one (never replays on live updates)
     • Fly-to-cart bubble, cart wiggle, card flash
     • Heart burst when you favourite a dish
     • Ripple on every button, 3D tilt + glare on cards (mouse only)
     • Smooth screen / tab transitions
     • Count-up numbers on owner & admin dashboards
     • Bell wiggle on new notification, login-error shake
     • Confetti + animated tick on the order pickup pass
     • Floating food + parallax in the student hero (tap one!)
     • FRONT PAGE: living food scene on the login screen (touch / drag / tap to play)

   Turn off:  CampusBiteMotion.setEnabled(false)   (remembered in this browser)
              Also off automatically if the device asks for reduced motion.
   ========================================================================== */
(function () {
  'use strict';
  if (window.CampusBiteMotion) return;                       // never run twice

  var doc = document, root = doc.documentElement;
  var $ = function (id) { return doc.getElementById(id); };
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var userOff = false;
  try { userOff = localStorage.getItem('cb_motion') === 'off'; } catch (e) {}
  if (userOff) root.classList.add('cb-off');

  function on() { return !mqReduce.matches && !userOff; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function canAnimate() { return typeof Element !== 'undefined' && !!Element.prototype.animate; }

  /* Restart a CSS class animation, then clean it up. */
  function retrigger(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;                                     // force reflow so it replays
    el.classList.add(cls);
    clearTimeout(el['__cbt_' + cls]);
    el['__cbt_' + cls] = setTimeout(function () { el.classList.remove(cls); }, ms || 700);
  }
  function center(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }
  function cartQty() { var n = parseInt(($('cartCount') || {}).textContent, 10); return isNaN(n) ? 0 : n; }
  function keyOf(card) {
    var h = card && card.querySelector('h4,h3,h2');
    return h ? h.textContent.trim() : '';
  }
  function findCard(key) {
    var cards = doc.querySelectorAll('#menu .food-card');
    for (var i = 0; i < cards.length; i++) if (keyOf(cards[i]) === key) return cards[i];
    return null;
  }

  /* ------------------------------------------------------------------
     Mobile gestures: pull to refresh and swipe menu categories
     ------------------------------------------------------------------ */
  (function initMobileGestures() {
    var menu = $('menu');
    var ptr = doc.createElement('div');
    ptr.className = 'cb-ptr';
    ptr.setAttribute('role', 'status');
    ptr.setAttribute('aria-live', 'polite');
    ptr.innerHTML = '<span class="cb-ptr-icon" aria-hidden="true">↻</span><span class="cb-ptr-label">Pull to refresh</span>';
    doc.body.appendChild(ptr);

    var startX = 0, startY = 0, deltaX = 0, deltaY = 0;
    var gestureActive = false, gestureAxis = null, menuSwipe = false, refreshPull = false, refreshing = false;
    var refreshTimer = 0;
    var pullThreshold = 76, swipeThreshold = 64;

    function isLoggedIn() {
      var loginView = $('loginView'), logoutBtn = $('logoutBtn');
      return loginView && loginView.classList.contains('hidden') &&
        logoutBtn && !logoutBtn.classList.contains('hidden');
    }

    function isInteractive(target) {
      return !!(target && target.closest &&
        target.closest('button, input, select, textarea, a, [contenteditable="true"]'));
    }

    function isAtTop() {
      return window.scrollY <= 0 && doc.documentElement.scrollTop <= 0;
    }

    function hasOpenModal() {
      return Array.prototype.some.call(doc.querySelectorAll('.modal-backdrop:not(.hidden)'), function (backdrop) {
        return !backdrop.closest('.hidden');
      });
    }

    function hidePullIndicator() {
      ptr.classList.remove('cb-ptr-active', 'cb-ptr-ready', 'cb-ptr-spin');
      ptr.style.transform = '';
      ptr.style.opacity = '';
    }

    function clearGesture() {
      gestureActive = false;
      gestureAxis = null;
      menuSwipe = false;
      refreshPull = false;
      deltaX = 0;
      deltaY = 0;
    }

    function renderCategorySwipe(direction) {
      if (!menu || !menu.offsetParent) return;
      var categories = Array.prototype.slice.call(doc.querySelectorAll('.cat-btn'));
      if (categories.length < 2) return;
      var current = categories.findIndex(function (button) { return button.classList.contains('bg-slate-900'); });
      if (current < 0) current = 0;
      var next = (current + direction + categories.length) % categories.length;
      if (on()) retrigger(menu, direction > 0 ? 'cb-menu-slide-left' : 'cb-menu-slide-right', 350);
      categories[next].click();
    }

    async function refreshApp() {
      var hasFirebaseUser = false;
      if (window.firebase && typeof window.firebase.auth === 'function') {
        hasFirebaseUser = !!window.firebase.auth().currentUser;
      }
      if (hasFirebaseUser && typeof window.campusBiteStartSync === 'function') {
        await window.campusBiteStartSync();
      } else if (typeof window.renderAll === 'function') {
        window.renderAll();
      } else if (typeof window.renderMenu === 'function') {
        window.renderMenu();
      }
    }

    async function finishRefresh() {
      if (refreshing) return;
      refreshing = true;
      var refreshStartedAt = Date.now();
      ptr.classList.remove('cb-ptr-ready');
      ptr.classList.add('cb-ptr-active', 'cb-ptr-spin');
      ptr.style.transform = 'translate3d(-50%, 8px, 0)';
      ptr.querySelector('.cb-ptr-label').textContent = 'Refreshing…';
      try {
        await refreshApp();
        var remainingSpinnerTime = 350 - (Date.now() - refreshStartedAt);
        if (remainingSpinnerTime > 0) {
          await new Promise(function (resolve) { window.setTimeout(resolve, remainingSpinnerTime); });
        }
        ptr.querySelector('.cb-ptr-label').textContent = 'Updated';
      } catch (error) {
        console.error('Pull-to-refresh failed:', error);
        ptr.querySelector('.cb-ptr-label').textContent = 'Refresh failed';
      } finally {
        ptr.classList.remove('cb-ptr-spin');
        refreshTimer = window.setTimeout(function () {
          hidePullIndicator();
          refreshing = false;
          refreshTimer = 0;
        }, 700);
      }
    }

    doc.addEventListener('touchstart', function (e) {
      if (refreshing || e.touches.length !== 1 || !isLoggedIn()) {
        clearGesture();
        return;
      }
      var target = e.target;
      var drawer = $('cartDrawer');
      if ((drawer && !drawer.classList.contains('hidden')) ||
          hasOpenModal()) {
        clearGesture();
        return;
      }
      var interactive = isInteractive(target);
      menuSwipe = !!(menu && menu.offsetParent && menu.contains(target) && !interactive);
      refreshPull = isAtTop() && !interactive;
      if (!menuSwipe && !refreshPull) {
        clearGesture();
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      deltaX = 0;
      deltaY = 0;
      gestureAxis = null;
      gestureActive = true;
    }, { passive: true });

    doc.addEventListener('touchmove', function (e) {
      if (!gestureActive || e.touches.length !== 1) return;
      deltaX = e.touches[0].clientX - startX;
      deltaY = e.touches[0].clientY - startY;
      if (!gestureAxis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 8) {
        gestureAxis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      }
      if (gestureAxis === 'vertical' && refreshPull && deltaY > 0 && isAtTop()) {
        if (e.cancelable) e.preventDefault();
        var distance = Math.min(deltaY, 112);
        ptr.classList.add('cb-ptr-active');
        ptr.style.transform = 'translate3d(-50%, ' + (distance - 64) + 'px, 0)';
        ptr.style.opacity = String(Math.min(1, distance / 48));
        var ready = distance >= pullThreshold;
        ptr.classList.toggle('cb-ptr-ready', ready);
        ptr.querySelector('.cb-ptr-label').textContent = ready ? 'Release to refresh' : 'Pull to refresh';
      }
    }, { passive: false });

    doc.addEventListener('touchend', function (e) {
      if (!gestureActive) return;
      var touch = e.changedTouches && e.changedTouches[0];
      if (touch) {
        deltaX = touch.clientX - startX;
        deltaY = touch.clientY - startY;
      }
      var shouldRefresh = gestureAxis === 'vertical' && refreshPull && deltaY >= pullThreshold && isAtTop();
      var shouldSwipeMenu = gestureAxis === 'horizontal' && menuSwipe && Math.abs(deltaX) >= swipeThreshold;
      var swipeDirection = deltaX < 0 ? 1 : -1;
      clearGesture();
      if (shouldSwipeMenu) renderCategorySwipe(swipeDirection);
      if (shouldRefresh) finishRefresh();
      else if (!refreshing) hidePullIndicator();
    }, { passive: true });

    doc.addEventListener('touchcancel', function () {
      clearGesture();
      if (!refreshing) hidePullIndicator();
    }, { passive: true });

    window.addEventListener('scroll', function () {
      if (!isAtTop() && !refreshing) hidePullIndicator();
    }, { passive: true });
  })();

  /* ------------------------------------------------------------------
     Particles: hearts, emoji sparks (Web Animations API, self-cleaning)
     ------------------------------------------------------------------ */
  function burst(x, y, chars, count, spread) {
    if (!on() || !canAnimate() || !doc.body) return;
    var safeCount = Math.min(Math.max(1, count || 1), 12);
    for (var i = 0; i < safeCount; i++) {
      var p = doc.createElement('span');
      p.className = 'cb-p';
      p.setAttribute('aria-hidden', 'true');
      p.textContent = chars[i % chars.length];
      p.style.fontSize = rand(14, 24) + 'px';
      doc.body.appendChild(p);
      var a = (Math.PI * 2 * i) / safeCount + rand(-.3, .3), d = rand(spread * .5, spread);
      var dx = Math.cos(a) * d, dy = Math.sin(a) * d - 14;
      var anim = p.animate([
        { transform: 'translate(' + x + 'px,' + y + 'px) scale(.4)', opacity: 1 },
        { transform: 'translate(' + (x + dx) + 'px,' + (y + dy) + 'px) scale(1.15)', opacity: 1, offset: .55 },
        { transform: 'translate(' + (x + dx * 1.15) + 'px,' + (y + dy + 26) + 'px) scale(.7)', opacity: 0 }
      ], { duration: rand(600, 850), easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
      anim.onfinish = (function (el) { return function () { el.remove(); }; })(p);
    }
  }

  /* ------------------------------------------------------------------
     1. Menu cards — animate only cards that are genuinely new
     ------------------------------------------------------------------ */
  var seen = new Set();
  function stagger(menuEl) {
    if (!on() || !menuEl || !menuEl.offsetParent) return;   // hidden (e.g. before login) → don't burn the entrance
    var i = 0;
    menuEl.querySelectorAll('.food-card').forEach(function (card) {
      var k = keyOf(card) || ('#' + i);
      if (seen.has(k)) return;                               // already shown → stay still
      seen.add(k);
      card.style.setProperty('--cb-i', Math.min(i++, 14));
      card.classList.add('cb-enter');
      card.addEventListener('animationend', function () { card.classList.remove('cb-enter'); }, { once: true });
    });
  }
  var menuEl = $('menu');
  if (menuEl) {
    new MutationObserver(function () { stagger(menuEl); }).observe(menuEl, { childList: true });
    stagger(menuEl);
  }
  // Changing category or sort deserves a fresh entrance; typing in search does not.
  doc.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.cat-btn')) seen.clear();
    if (e.target.closest && e.target.closest('#logoutBtn')) seen.clear();
  }, true);
  var sortEl = $('menuSort');
  if (sortEl) sortEl.addEventListener('change', function () { seen.clear(); }, true);

  /* ------------------------------------------------------------------
     2. Fly-to-cart + favourite heart burst (capture phase: we read the
        card BEFORE the app re-renders it, then react after)
     ------------------------------------------------------------------ */
  doc.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var btn = t.closest('#menu button');
    if (!btn || btn.disabled) return;
    var card = btn.closest('.food-card'), key = keyOf(card);

    if (btn.getAttribute('aria-label') === 'Favourite') {    // ---- heart
      if (!on()) return;
      var wasFav = /text-red/.test(btn.className), c = center(btn);
      if (!wasFav) burst(c.x, c.y, ['♥', '♥', '💗', '♥'], 9, 54);
      setTimeout(function () {
        var c2 = findCard(key), b2 = c2 && c2.querySelector('[aria-label="Favourite"]');
        if (b2 && !wasFav) retrigger(b2, 'cb-heart-pop', 600);
      }, 30);
      return;
    }

    if (!/\badd\(/.test(btn.getAttribute('onclick') || '')) return;   // only "Add" and "+"
    if (!on() || !canAnimate()) return;
    var before = cartQty();
    var srcEl = card && (card.querySelector('img') || card.querySelector('.relative > div'));
    var from = center(srcEl || btn);
    var visual = srcEl && srcEl.tagName === 'IMG'
      ? { img: srcEl.currentSrc || srcEl.src }
      : { emoji: srcEl ? srcEl.textContent.trim() : '🍽️' };
    setTimeout(function () {                                 // after the app's own handler ran
      if (cartQty() > before) fly(from, visual, key);        // only if the add really succeeded
    }, 40);
  }, true);

  function fly(from, visual, key) {
    var target = $('cartCount') && $('cartCount').offsetParent ? $('cartCount') : $('cartBtn');
    if (!target) return;
    var to = center(target);
    var ex = to.x, ey = Math.max(to.y, 14);
    var b = doc.createElement('div');
    b.className = 'cb-fly';
    b.setAttribute('aria-hidden', 'true');
    if (visual.img) { var im = doc.createElement('img'); im.src = visual.img; im.alt = ''; b.appendChild(im); }
    else b.textContent = visual.emoji || '🍽️';
    doc.body.appendChild(b);
    var mx = (from.x + ex) / 2, my = Math.min(from.y, ey) - 90;      // arc peak
    var a = b.animate([
      { transform: 'translate(' + from.x + 'px,' + from.y + 'px) scale(1)', opacity: 1 },
      { transform: 'translate(' + mx + 'px,' + my + 'px) scale(.8)', opacity: 1, offset: .5 },
      { transform: 'translate(' + ex + 'px,' + ey + 'px) scale(.25)', opacity: .35 }
    ], { duration: 720, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
    a.onfinish = function () {
      b.remove();
      retrigger($('cartBtn'), 'cb-wiggle', 700);
      var r = doc.createElement('div'); r.className = 'cb-ring';
      r.style.left = ex + 'px'; r.style.top = ey + 'px';
      doc.body.appendChild(r); setTimeout(function () { r.remove(); }, 650);
      var c = findCard(key); if (c) retrigger(c, 'cb-flash', 800);
    };
  }

  /* ------------------------------------------------------------------
     3. Ripple on every button
     ------------------------------------------------------------------ */
  doc.addEventListener('pointerdown', function (e) {
    if (!on() || (e.button && e.button > 0)) return;
    var b = e.target.closest && e.target.closest('button,[role="button"]');
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect();
    if (r.width < 24 || r.width > 1000) return;
    var x = e.clientX - r.left, y = e.clientY - r.top;
    var max = Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
    var wasStatic = getComputedStyle(b).position === 'static';
    if (wasStatic) b.style.position = 'relative';             // ::after needs a positioned parent
    b.style.setProperty('--cb-rx', x + 'px');
    b.style.setProperty('--cb-ry', y + 'px');
    b.style.setProperty('--cb-rmax', max + 'px');
    b.classList.remove('cb-rip'); void b.offsetWidth; b.classList.add('cb-rip');
    clearTimeout(b.__cbRipT);
    b.__cbRipT = setTimeout(function () { b.classList.remove('cb-rip'); if (wasStatic) b.style.position = ''; }, 650);
  }, { passive: true });

  /* ------------------------------------------------------------------
     4. Pointer effects: card tilt + hero parallax (mouse and touch)
     ------------------------------------------------------------------ */
  var tiltEl = null, raf = 0, lastEv = null;
  function resetTilt(c) {
    if (!c) return;
    c.classList.remove('cb-touching');
    ['--cb-rx', '--cb-ry', '--cb-gx', '--cb-gy'].forEach(function (p) { c.style.removeProperty(p); });
  }
  function frame() {
    raf = 0;
    var e = lastEv; if (!e) return;
    if (tiltEl) {
      var r = tiltEl.getBoundingClientRect();
      if (r.width && r.height) {
        var px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        var py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
        tiltEl.style.setProperty('--cb-ry', ((px - .5) * 12).toFixed(2) + 'deg');
        tiltEl.style.setProperty('--cb-rx', ((.5 - py) * 10).toFixed(2) + 'deg');
        tiltEl.style.setProperty('--cb-gx', (px * 100).toFixed(1) + '%');
        tiltEl.style.setProperty('--cb-gy', (py * 100).toFixed(1) + '%');
      }
    }
    var hero = heroEl();
    if (hero && hero.offsetParent) {
      var hr = hero.getBoundingClientRect();
      var nx = (e.clientX - hr.left) / hr.width - .5;
      var ny = (e.clientY - hr.top) / hr.height - .5;
      if (Math.abs(nx) < .9 && Math.abs(ny) < 1.6) {
        hero.querySelectorAll('.cb-floater').forEach(function (f) {
          var d = parseFloat(f.getAttribute('data-depth')) || 20;
          f.style.transform = 'translate3d(' + (-nx * d).toFixed(1) + 'px,' + (-ny * d).toFixed(1) + 'px,0)';
        });
      }
    }
  }

  doc.addEventListener('pointerdown', function (e) {
    if (!on() || e.pointerType === 'mouse') return;
    var card = e.target.closest ? e.target.closest('.food-card') : null;
    if (card) {
      if (tiltEl && tiltEl !== card) resetTilt(tiltEl);
      tiltEl = card;
      tiltEl.classList.add('cb-touching');
      lastEv = e;
      if (!raf) raf = requestAnimationFrame(frame);
    }
    if (card && !e.target.closest('button') && e.target.closest('.relative')) {
      burst(e.clientX, e.clientY, ['✨', '🧡'], 4, 38);
    }
  }, { passive: true });

  doc.addEventListener('pointermove', function (e) {
    if (!on()) return;
    var card = e.target.closest ? e.target.closest('.food-card') : null;
    if (e.pointerType === 'mouse') {
      if (tiltEl && tiltEl !== card) resetTilt(tiltEl);
      tiltEl = card;
    } else if (tiltEl && card !== tiltEl) {
      resetTilt(tiltEl);
      tiltEl = null;
      return;
    }
    lastEv = e;
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });

  function clearTouchTilt() {
    if (tiltEl) { resetTilt(tiltEl); tiltEl = null; }
  }
  doc.addEventListener('pointerup', clearTouchTilt, { passive: true });
  doc.addEventListener('pointercancel', clearTouchTilt, { passive: true });
  root.addEventListener('mouseleave', clearTouchTilt);

  /* ------------------------------------------------------------------
     5. Screen / tab transitions + count-up numbers
     ------------------------------------------------------------------ */
  var NUM_IDS = ['statItems', 'statStock', 'statLow', 'statOut', 'ownerOrders', 'ownerStock', 'ownerLow',
                 'ownerRevenue', 'pendingCount', 'readyCount'];

  function parseNum(s) { var m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; }
  function countTo(el) {
    var txt = el.textContent;
    if (txt === el.__cbWrote) return;                        // that was our own frame, ignore
    el.__cbFinal = txt;
    var to = parseNum(txt);
    cancelAnimationFrame(el.__cbRaf);
    if (to === null) { el.__cbShown = null; return; }
    var from = el.__cbShown == null ? 0 : el.__cbShown;
    el.__cbShown = to;
    if (!on() || from === to || !el.offsetParent) return;
    var m = txt.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)([\s\S]*)$/);
    var pre = m ? m[1] : '', suf = m ? m[3] : '', commas = m ? /,/.test(m[2]) : false;
    var t0 = performance.now(), D = 650;
    (function step(t) {
      var p = Math.min(1, (t - t0) / D), v = from + (to - from) * (1 - Math.pow(1 - p, 3));
      var s = p < 1 ? pre + (commas ? Math.round(v).toLocaleString('en-IN') : Math.round(v)) + suf : txt;
      el.__cbWrote = s; el.textContent = s;
      if (p < 1) el.__cbRaf = requestAnimationFrame(step);
    })(t0);
  }
  NUM_IDS.forEach(function (id) {
    var el = $(id); if (!el) return;
    el.classList.add('cb-num');
    el.__cbShown = parseNum(el.textContent);
    new MutationObserver(function () { countTo(el); }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  function replayNumbers(view) {
    view.querySelectorAll('.cb-num').forEach(function (el) {
      var txt = el.__cbFinal || el.textContent;
      el.__cbShown = 0; el.__cbWrote = undefined; el.textContent = txt; countTo(el);
    });
  }

  function enterView(v) {
    if (!on()) return;
    Array.prototype.forEach.call(v.children, function (c, i) { c.style.setProperty('--cb-k', Math.min(i, 8)); });
    retrigger(v, 'cb-view-in', 900);
    replayNumbers(v);
    if (v.id === 'studentView') { seen.clear(); setTimeout(function () { stagger($('menu')); }, 350); }
  }
  doc.querySelectorAll('#studentView,#studentOrdersView,#kitchenView,#ownerView,#adminView,#reportView,[id^="admin"][id$="Section"]')
    .forEach(function (v) {
      v.__cbHidden = v.classList.contains('hidden');
      new MutationObserver(function () {
        var h = v.classList.contains('hidden');
        if (v.__cbHidden === true && !h) enterView(v);
        v.__cbHidden = h;
      }).observe(v, { attributes: true, attributeFilter: ['class'] });
    });

  // The student screen sits *under* the login overlay, so it is never "hidden" itself.
  // When the overlay goes away (login succeeded) give the page its entrance.
  var lv = $('loginView');
  if (lv) {
    var lvHidden = lv.classList.contains('hidden');
    new MutationObserver(function () {
      var h = lv.classList.contains('hidden');
      if (lvHidden && !h) seen.clear();                      // back at login (logout): next login re-animates
      if (!lvHidden && h) {                                  // logged in
        var sv = $('studentView');
        seen.clear();
        if (sv && sv.offsetParent) { enterView(sv); }
      }
      lvHidden = h;
    }).observe(lv, { attributes: true, attributeFilter: ['class'] });
  }

  /* ------------------------------------------------------------------
     6. Bell wiggle on new notification
     ------------------------------------------------------------------ */
  var nb = $('notificationBadge');
  if (nb) {
    var lastN = parseInt(nb.textContent, 10) || 0;
    new MutationObserver(function () {
      var n = parseInt(nb.textContent, 10) || 0;
      if (n > lastN && on()) retrigger($('notificationBtn'), 'cb-wiggle', 700);
      lastN = n;
    }).observe(nb, { childList: true, characterData: true, subtree: true });
  }

  /* ------------------------------------------------------------------
     7. Login error shake
     ------------------------------------------------------------------ */
  var le = $('loginError');
  if (le) {
    new MutationObserver(function () {
      if (!on() || le.classList.contains('hidden') || !le.textContent.trim()) return;
      var card = le.closest('.rounded-3xl,.rounded-2xl') || $('loginForm') || le.parentElement;
      retrigger(card, 'cb-shake', 600);
    }).observe(le, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  /* ------------------------------------------------------------------
     8. Order confirmed: confetti + animated tick
     ------------------------------------------------------------------ */
  function confetti() {
    if (!on()) return;
    var W = innerWidth, H = innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cv = doc.createElement('canvas');
    cv.width = W * dpr; cv.height = H * dpr;
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:9998;pointer-events:none';
    doc.body.appendChild(cv);
    var g = cv.getContext('2d'); if (!g) { cv.remove(); return; }
    g.scale(dpr, dpr);
    var colors = ['#f97316', '#fb923c', '#fbbf24', '#10b981', '#0f172a', '#38bdf8', '#f43f5e'];
    var ps = [], N = Math.min(150, Math.round(W / 7));
    for (var i = 0; i < N; i++) ps.push({
      x: W / 2 + rand(-50, 50), y: H * .38, vx: rand(-7.5, 7.5), vy: rand(-15, -4),
      w: rand(6, 11), h: rand(8, 16), r: rand(0, 6.28), vr: rand(-.3, .3),
      c: colors[(Math.random() * colors.length) | 0], life: rand(90, 150)
    });
    var f = 0;
    (function tick() {
      g.clearRect(0, 0, W, H);
      var alive = 0;
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        p.vy += .35; p.vx *= .992; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
        if (p.life > 0 && p.y < H + 30) {
          alive++;
          g.save(); g.translate(p.x, p.y); g.rotate(p.r);
          g.globalAlpha = Math.min(1, p.life / 40); g.fillStyle = p.c;
          g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
        }
      }
      if (alive && f++ < 260) requestAnimationFrame(tick); else cv.remove();
    })();
  }
  var tm = $('tokenModal');
  if (tm) {
    var tmHidden = tm.classList.contains('hidden');
    new MutationObserver(function () {
      var h = tm.classList.contains('hidden');
      if (tmHidden && !h && on()) {
        confetti();
        retrigger(tm.querySelector('.rounded-full'), 'cb-check', 1200);
      }
      tmHidden = h;
    }).observe(tm, { attributes: true, attributeFilter: ['class'] });
  }

  /* ------------------------------------------------------------------
     9. Student hero: floating food with parallax (tap one to pop it)
     ------------------------------------------------------------------ */
  function heroEl() { return doc.querySelector('#studentView > section'); }
  function mountHero() {
    var hero = heroEl();
    if (!hero || hero.querySelector('.cb-floaters')) return;
    var items = [['🍛', 6, 10, 6.5, 26], ['🥟', 24, 58, 7.5, 18], ['☕', 3, 60, 5.8, 32],
                 ['🍟', 30, 6, 8, 14], ['🥪', 15, 34, 6.8, 22], ['🍜', 38, 62, 7.2, 12]];   // emoji, right%, top%, seconds, depth
    var wrap = doc.createElement('div');
    wrap.className = 'cb-floaters';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = items.map(function (it, i) {
      return '<div class="cb-floater" data-depth="' + it[4] + '" style="right:' + it[1] + '%;top:' + it[2] + '%">' +
             '<span style="--cb-dur:' + it[3] + 's;--cb-del:-' + (i * 1.1).toFixed(1) + 's">' + it[0] + '</span></div>';
    }).join('');
    hero.insertBefore(wrap, hero.firstChild);                // behind the headline
    wrap.addEventListener('click', function (e) {
      var f = e.target.closest('.cb-floater'); if (!f || !on()) return;
      var s = f.firstElementChild, c = center(f);
      retrigger(s, 'cb-hop', 750);
      burst(c.x, c.y, [s.textContent.trim(), '✨'], 8, 70);
    });
  }
  mountHero();

  /* ------------------------------------------------------------------
     10. FRONT PAGE (login screen): living food scene, touch + mouse
         • Food drifts around behind the login card
         • Touch / mouse pushes the food away; tap = shockwave + sparkles
         • Tap a food item to pop it; drag to leave a sparkle trail
         • Tap the logo for a little bounce
         Only runs while the login screen is visible (no battery drain).
     ------------------------------------------------------------------ */
  var scn = { fl: [], W: 0, H: 0, running: false, last: 0, ptr: { x: 0, y: 0, active: false, down: false, tx: 0, ty: 0 } };
  var FOODS = ['🍛', '🥟', '☕', '🍟', '🥪', '🍜', '🍕', '🧃', '🍩', '🌮', '🥤', '🍔', '🍪', '🍉'];
  var loginEl = $('loginView'), sceneEl = null;

  function sceneSize() { scn.W = loginEl.clientWidth; scn.H = loginEl.clientHeight; }
  function spawnFloaters() {
    if (!sceneEl) return;
    if (scn.fl.length) {
      scn.fl.forEach(function (f) { if (f && f.el) f.el.remove(); });
      scn.fl = [];
    }
    var n = scn.W < 640 ? 7 : 10;
    for (var i = 0; i < n; i++) {
      var s = rand(30, 56), el = doc.createElement('div'), sp = doc.createElement('span');
      el.className = 'cb-ff'; el.style.fontSize = s + 'px';
      sp.className = 'cb-in'; sp.style.setProperty('--i', i); sp.textContent = FOODS[i % FOODS.length];
      sp.addEventListener('animationend', function (e) { e.target.classList.remove('cb-in'); });
      el.appendChild(sp); sceneEl.appendChild(el);
      var ang = rand(0, 6.28), v = rand(12, 28);
      scn.fl.push({ el: el, sp: sp, s: s, x: rand(0, scn.W), y: rand(0, scn.H),
        bx: Math.cos(ang) * v, by: Math.sin(ang) * v - 6, vx: 0, vy: 0,
        rot: rand(-30, 30), br: rand(-12, 12), vr: 0, ph: rand(0, 6.28), fs: rand(.6, 1.1) });
      scn.fl[i].vx = scn.fl[i].bx; scn.fl[i].vy = scn.fl[i].by;
    }
  }
  function sceneStep(dt) {
    var W = scn.W, H = scn.H, p = scn.ptr, R = 140;
    for (var i = 0; i < scn.fl.length; i++) {
      var f = scn.fl[i], m = f.s;
      f.vx += (f.bx - f.vx) * 1.4 * dt; f.vy += (f.by - f.vy) * 1.4 * dt;     // settle back to a lazy drift
      f.vr += (f.br - f.vr) * 1.2 * dt;
      if (p.active) {                                                         // finger / cursor pushes food away
        var dx = f.x - p.x, dy = f.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 1) {
          var d = Math.sqrt(d2), k = 1 - d / R;
          f.vx += dx / d * k * 1100 * dt; f.vy += dy / d * k * 1100 * dt;
          f.vr += (dx > 0 ? 1 : -1) * k * 420 * dt;
        }
      }
      var sp = Math.hypot(f.vx, f.vy); if (sp > 650) { f.vx *= 650 / sp; f.vy *= 650 / sp; }
      f.ph += dt * f.fs;
      f.x += f.vx * dt; f.y += f.vy * dt + Math.sin(f.ph * 2) * 8 * dt;
      f.rot += f.vr * dt;
      if (f.x < -m) f.x = W + m; else if (f.x > W + m) f.x = -m;               // wrap around the screen
      if (f.y < -m) f.y = H + m; else if (f.y > H + m) f.y = -m;
      f.el.style.transform = 'translate3d(' + (f.x - m / 2).toFixed(1) + 'px,' + (f.y - m / 2).toFixed(1) + 'px,0) rotate(' + f.rot.toFixed(1) + 'deg)';
    }
  }
  function sceneLoop(t) {
    if (!scn.running) return;
    if (!on() || loginEl.classList.contains('hidden') || doc.hidden) { scn.running = false; return; }
    var dt = Math.min(.05, (t - scn.last) / 1000); scn.last = t;
    sceneStep(dt);
    requestAnimationFrame(sceneLoop);
  }
  function syncScene() {                                                      // start/stop depending on visibility
    if (!sceneEl) return;
    var show = on() && !loginEl.classList.contains('hidden') && !doc.hidden;
    if (!show) { scn.running = false; return; }
    if (scn.running) return;
    sceneSize(); if (!scn.fl.length) spawnFloaters();
    scn.running = true; scn.last = performance.now(); requestAnimationFrame(sceneLoop);
  }
  function nearestFloater(x, y) {
    var best = null, bd = 1e9;
    scn.fl.forEach(function (f) {
      var d = Math.hypot(f.x - x, f.y - y);
      if (d < f.s * .75 + 14 && d < bd) { best = f; bd = d; }                 // generous hit area for fingers
    });
    return best;
  }
  function sceneTap(x, y) {
    var hit = nearestFloater(x, y);
    scn.fl.forEach(function (f) {
      var dx = f.x - x, dy = f.y - y, d = Math.hypot(dx, dy) || 1;
      if (d < 220) { var k = 1 - d / 220; f.vx += dx / d * k * 620; f.vy += dy / d * k * 620; f.vr += (Math.random() - .5) * k * 500; }
    });
    var r = doc.createElement('div'); r.className = 'cb-ring';
    r.style.left = x + 'px'; r.style.top = y + 'px'; doc.body.appendChild(r);
    setTimeout(function () { r.remove(); }, 650);
    if (hit) {
      retrigger(hit.sp, 'cb-pop', 750);
      burst(hit.x, hit.y, [hit.sp.textContent.trim(), '✨', '⭐'], 6, 90);
      hit.vy -= 260; hit.vr += (Math.random() - .5) * 700;
    } else {
      burst(x, y, [FOODS[(Math.random() * FOODS.length) | 0], '✨', FOODS[(Math.random() * FOODS.length) | 0]], 5, 80);
    }
  }
  function mountLoginScene() {
    if (!loginEl || loginEl.__cbSceneReady) return;
    loginEl.__cbSceneReady = true;
    sceneEl = doc.createElement('div');
    sceneEl.className = 'cb-scene'; sceneEl.setAttribute('aria-hidden', 'true');
    sceneEl.innerHTML = '<i class="cb-glow cb-glow-a"></i><i class="cb-glow cb-glow-b"></i>' +
                        '<p class="cb-hint">✨ Tap the food · drag to play</p>';
    loginEl.insertBefore(sceneEl, loginEl.firstChild);
    var card = loginEl.querySelector('.modal-shell'); if (card) card.classList.add('cb-card');

    function inCard(e) { return e.target.closest && e.target.closest('.modal-shell'); }
    function off() { sceneEl.classList.add('cb-hint-off'); }
    loginEl.addEventListener('pointerdown', function (e) {
      if (!on() || (e.button && e.button > 0)) return;
      var logo = e.target.closest && e.target.closest('.modal-shell .bg-orange-500.rounded-2xl');
      if (logo) { retrigger(logo, 'cb-heart-pop', 600); var c = center(logo); burst(c.x, c.y, ['🍴', '✨', '🧡'], 6, 60); off(); return; }
      if (inCard(e)) return;
      var p = scn.ptr; p.x = p.tx = e.clientX; p.y = p.ty = e.clientY; p.active = true; p.down = true;
      off(); sceneTap(e.clientX, e.clientY);
    }, { passive: true });
    loginEl.addEventListener('pointermove', function (e) {
      var p = scn.ptr; p.x = e.clientX; p.y = e.clientY;
      p.active = e.pointerType === 'mouse' ? true : p.down;
      if (p.down && on()) {
        var now = performance.now();
        if (now - (p.lastTrail || 0) > 90 && Math.hypot(p.x - p.tx, p.y - p.ty) > 20) {
          p.lastTrail = now; p.tx = p.x; p.ty = p.y; burst(p.x, p.y, ['✨', '·', '✦'], 1, 26);
        }
      }
    }, { passive: true });
    function release() { scn.ptr.down = false; scn.ptr.active = false; }
    loginEl.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') release(); else scn.ptr.down = false; }, { passive: true });
    loginEl.addEventListener('pointercancel', release, { passive: true });
    loginEl.addEventListener('pointerleave', release, { passive: true });

    new MutationObserver(syncScene).observe(loginEl, { attributes: true, attributeFilter: ['class'] });
    doc.addEventListener('visibilitychange', syncScene);
    window.addEventListener('resize', function () {
      sceneSize();
      if (!scn.fl.length) spawnFloaters();
    });
    syncScene();
  }
  mountLoginScene();

  /* ------------------------------------------------------------------
     11A. Haptic feedback (supported mobile browsers)
     ------------------------------------------------------------------ */
  var HAPTICS = {
    tap: 12,
    heart: [12, 30, 18],
    success: [18, 40, 28],
    warning: [30, 40, 30],
    error: [45, 35, 45, 35, 60]
  };
  function vibe(pattern) {
    if (!on() || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) {}
  }

  doc.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var favBtn = t.closest('[aria-label="Favourite"]');
    if (favBtn) { vibe(HAPTICS.heart); return; }

    var cartAction = t.closest('#menu button, #cartItems button');
    if (cartAction && !cartAction.disabled) {
      vibe(HAPTICS.tap);
      return;
    }

    if (t.closest('.cat-btn, .student-order-filter, .admin-section-btn, header button')) {
      vibe(HAPTICS.tap);
      return;
    }

    if (t.closest('.review-star')) {
      vibe(15);
      return;
    }

    var actionBtn = t.closest('#placeOrder, [data-ready-index], #saveFood, #saveParcelFee, #submitReview, #submitReport, #saveStudent, #saveOwner, #saveAdmin, #addSpecialServiceBtn, button[onclick*="completeOrder"]');
    if (actionBtn && !actionBtn.disabled) {
      vibe(HAPTICS.success);
      return;
    }

    var dangerBtn = t.closest('button');
    if (dangerBtn && /cancel|refund|remove/i.test(dangerBtn.textContent)) {
      vibe(HAPTICS.warning);
    }
  }, true);

  var loginErrEl = $('loginError');
  if (loginErrEl) {
    new MutationObserver(function () {
      if (!loginErrEl.classList.contains('hidden') && loginErrEl.textContent.trim()) {
        vibe(HAPTICS.error);
      }
    }).observe(loginErrEl, { attributes: true, attributeFilter: ['class'], childList: true });
  }

  var tokenModalEl = $('tokenModal');
  if (tokenModalEl) {
    var wasTokenHidden = tokenModalEl.classList.contains('hidden');
    new MutationObserver(function () {
      var isTokenHidden = tokenModalEl.classList.contains('hidden');
      if (wasTokenHidden && !isTokenHidden) vibe([25, 45, 35, 45, 50]);
      wasTokenHidden = isTokenHidden;
    }).observe(tokenModalEl, { attributes: true, attributeFilter: ['class'] });
  }

  var notificationList = $('notificationList');
  if (notificationList) {
    var latestNotification = notificationList.firstElementChild ? notificationList.firstElementChild.textContent.trim() : '';
    new MutationObserver(function () {
      var nextNotification = notificationList.firstElementChild ? notificationList.firstElementChild.textContent.trim() : '';
      if (nextNotification && nextNotification !== latestNotification) vibe(HAPTICS.tap);
      latestNotification = nextNotification;
    }).observe(notificationList, { childList: true, subtree: true, characterData: true });
  }

  /* ------------------------------------------------------------------
     Public switch
     ------------------------------------------------------------------ */
  window.CampusBiteMotion = {
    enabled: on,
    setEnabled: function (v) {
      userOff = !v;
      try { localStorage.setItem('cb_motion', v ? 'on' : 'off'); } catch (e) {}
      root.classList.toggle('cb-off', userOff);
      syncScene();
    },
    confetti: confetti,
    vibe: vibe
  };
})();
