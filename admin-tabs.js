/* ==========================================================================
   CampusBite Admin Tabs Scroll — admin-tabs.js
   Problem: the admin tab bar (Master Control, Menu & Stock, … Wallet, Rewards, Monthly Report,
   Chatbot …) has more buttons than fit on screen, so the last ones were cut off and could not be reached.
   Fix: the row of tab buttons now scrolls sideways (finger swipe, trackpad, mouse wheel or the thin
   scroll bar) and the tab you open is scrolled into view automatically.
   Load anywhere near the bottom of index.html:  <script src="admin-tabs.js"></script>
   ========================================================================== */
(function () {
  'use strict';
  if (window.CBAdminTabs) return;

  var css = ''
    /* the outer row must not clip or stretch past the page */
    + '#adminView>.flex:first-child{overflow:visible;min-width:0}'
    /* the group of tab buttons: one line, scrolls sideways */
    + '#adminView>.flex:first-child>div:last-child{min-width:0;max-width:100%;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;'
    + 'padding:4px 2px 10px;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;scroll-behavior:smooth;scrollbar-width:thin;scrollbar-color:#cbd5e1 transparent}'
    + '#adminView>.flex:first-child>div:last-child>button{flex:0 0 auto;white-space:nowrap}'
    + '#adminView>.flex:first-child>div:last-child::-webkit-scrollbar{height:6px}'
    + '#adminView>.flex:first-child>div:last-child::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:9999px}'
    /* on wide screens: title keeps a fixed width, the tab bar takes the rest */
    + '@media (min-width:768px){'
    + '#adminView>.flex:first-child>div:first-child{flex:0 0 min(320px,32%)}'
    + '#adminView>.flex:first-child>div:last-child{flex:1 1 0}}'
    + '@media (prefers-reduced-motion:reduce){#adminView>.flex:first-child>div:last-child{scroll-behavior:auto}}';

  function group() { return document.querySelector('#adminView>.flex:first-child>div:last-child'); }

  function boot() {
    if (!document.getElementById('cbAdminTabsCss')) {
      var st = document.createElement('style'); st.id = 'cbAdminTabsCss'; st.textContent = css; document.head.appendChild(st);
    }
    var g = group(); if (!g || g.__cbTabs) return; g.__cbTabs = true;

    /* mouse wheel (vertical) scrolls the tabs sideways while the pointer is over them */
    g.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || g.scrollWidth <= g.clientWidth) return;
      var atStart = g.scrollLeft <= 0, atEnd = g.scrollLeft + g.clientWidth >= g.scrollWidth - 1;
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;     // let the page scroll at the ends
      g.scrollLeft += e.deltaY; e.preventDefault();
    }, { passive: false });

    /* the tab you click is brought fully into view */
    g.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.admin-section-btn'); if (!b) return;
      setTimeout(function () { try { b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch (x) {} }, 0);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.CBAdminTabs = { refresh: boot };
})();
