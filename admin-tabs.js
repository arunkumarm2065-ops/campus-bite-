/* CampusBite — horizontally scrollable admin tabs */
(function () {
  'use strict';
  if (window.CBAdminTabs) return;

  var css = ''
    + '#adminView>.flex:first-child{width:100%;max-width:100%;min-width:0;overflow:visible}'
    + '#cbAdminTabStrip{display:flex!important;flex-wrap:nowrap!important;min-width:0!important;'
    + 'width:100%!important;max-width:100%!important;overflow-x:auto!important;overflow-y:hidden!important;'
    + '-webkit-overflow-scrolling:touch!important;overscroll-behavior-x:contain!important;'
    + 'scroll-behavior:smooth!important;scrollbar-width:thin!important;scrollbar-color:#94a3b8 transparent!important;'
    + 'touch-action:pan-x!important;padding:4px 2px 10px!important}'
    + '#cbAdminTabStrip>button{flex:0 0 auto!important;white-space:nowrap!important}'
    + '#cbAdminTabStrip::-webkit-scrollbar{height:8px}'
    + '#cbAdminTabStrip::-webkit-scrollbar-track{background:transparent}'
    + '#cbAdminTabStrip::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:9999px}'
    + '@media (min-width:768px){'
    + '#adminView>.flex:first-child>div:first-child{flex:0 0 min(320px,32%)}'
    + '#cbAdminTabStrip{flex:1 1 0!important;width:0!important}}'
    + '@media (prefers-reduced-motion:reduce){#cbAdminTabStrip{scroll-behavior:auto}}';

  function getStrip() {
    var admin = document.getElementById('adminView');
    if (!admin) return null;
    var buttons = admin.querySelectorAll('.admin-section-btn');
    var candidate = null;
    for (var i = 0; i < buttons.length; i++) {
      var parent = buttons[i].parentElement;
      if (parent && parent.parentElement &&
          parent.parentElement.parentElement === admin) {
        candidate = parent;
        break;
      }
    }
    if (!candidate) {
      var row = admin.firstElementChild;
      candidate = row ? row.querySelector('div:last-child') : null;
    }
    if (candidate) candidate.id = 'cbAdminTabStrip';
    return candidate;
  }

  function boot() {
    var style = document.getElementById('cbAdminTabsCss');
    if (!style) {
      style = document.createElement('style');
      style.id = 'cbAdminTabsCss';
      style.textContent = css;
      document.head.appendChild(style);
    }

    var strip = getStrip();
    if (!strip) return;
    if (!strip.__cbTabs) {
      strip.__cbTabs = true;
      strip.addEventListener('wheel', function (e) {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || strip.scrollWidth <= strip.clientWidth) return;
        var atStart = strip.scrollLeft <= 0;
        var atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
        if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
        strip.scrollLeft += e.deltaY;
        e.preventDefault();
      }, { passive: false });

      strip.addEventListener('click', function (e) {
        var button = e.target.closest && e.target.closest('.admin-section-btn');
        if (!button) return;
        setTimeout(function () {
          var bounds = strip.getBoundingClientRect();
          var buttonBounds = button.getBoundingClientRect();
          if (buttonBounds.left < bounds.left) {
            strip.scrollLeft -= bounds.left - buttonBounds.left + 8;
          } else if (buttonBounds.right > bounds.right) {
            strip.scrollLeft += buttonBounds.right - bounds.right + 8;
          }
        }, 0);
      });
    }

    if (!boot.__observing && window.MutationObserver) {
      boot.__observing = true;
      var admin = document.getElementById('adminView');
      new MutationObserver(function () { setTimeout(boot, 20); })
        .observe(admin || document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  window.CBAdminTabs = { refresh: boot };
})();
