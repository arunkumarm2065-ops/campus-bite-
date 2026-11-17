(function () {
  const STORAGE_KEY = 'campusbite_theme';
  const toggleId = 'themeToggle';

  function bootstrapTheme(theme) {
    const loginView = document.getElementById('loginView');
    const logoutBtn = document.getElementById('logoutBtn');
    const isSignedIn = loginView && loginView.classList.contains('hidden') &&
      logoutBtn && !logoutBtn.classList.contains('hidden');
    const useDark = theme === 'dark' && isSignedIn;
    document.body.classList.toggle('theme-dark', useDark);
    const toggle = document.getElementById(toggleId);
    if (!toggle) return;
    const icon = toggle.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', useDark ? 'sun' : 'moon');
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    }
    toggle.setAttribute('aria-pressed', String(useDark));
  }

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (error) {}
    return 'light';
  }

  function syncToggleVisibility() {
    const toggle = document.getElementById(toggleId);
    if (!toggle) return;
    const loginView = document.getElementById('loginView');
    const logoutBtn = document.getElementById('logoutBtn');
    const isSignedIn = loginView && loginView.classList.contains('hidden') &&
      logoutBtn && !logoutBtn.classList.contains('hidden');
    toggle.style.display = isSignedIn ? '' : 'none';
  }

  function syncThemeContext() {
    bootstrapTheme(getSavedTheme());
    syncToggleVisibility();
  }

  function attachThemeToggle() {
    const navGroup = document.querySelector('header > div > div:last-child');
    if (!navGroup || document.getElementById(toggleId)) return;

    const toggle = document.createElement('button');
    toggle.id = toggleId;
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Toggle dark mode');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.className = 'w-10 h-10 rounded-xl bg-slate-100 text-slate-700 grid place-items-center';
    toggle.innerHTML = '<i data-lucide="moon" class="w-4 h-4"></i>';
    toggle.addEventListener('click', () => {
      const nextTheme = document.body.classList.contains('theme-dark') ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, nextTheme);
      } catch (error) {
        console.error('Unable to save the theme preference:', error);
      }
      bootstrapTheme(nextTheme);
    });
    navGroup.appendChild(toggle);
    syncToggleVisibility();
  }

  function initTheme() {
    attachThemeToggle();
    syncThemeContext();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      const observer = new MutationObserver(syncThemeContext);
      observer.observe(logoutBtn, { attributes: true, attributeFilter: ['class'] });
    }
    const loginView = document.getElementById('loginView');
    if (loginView) {
      const observer = new MutationObserver(syncThemeContext);
      observer.observe(loginView, { attributes: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme, { once: true });
  } else {
    initTheme();
  }
})();
