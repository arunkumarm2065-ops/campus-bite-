(function () {
  const STORAGE_KEY = 'campusbite_theme';
  const toggleId = 'themeToggle';

  function bootstrapTheme(theme) {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    const toggle = document.getElementById(toggleId);
    if (!toggle) return;
    const icon = toggle.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    }
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  }

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (error) {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function syncToggleVisibility() {
    const toggle = document.getElementById(toggleId);
    if (!toggle) return;
    const logoutBtn = document.getElementById('logoutBtn');
    toggle.style.display = logoutBtn && !logoutBtn.classList.contains('hidden') ? '' : 'none';
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
      document.body.classList.toggle('theme-dark', nextTheme === 'dark');
      try { localStorage.setItem(STORAGE_KEY, nextTheme); } catch (error) {}
      bootstrapTheme(nextTheme);
    });
    navGroup.appendChild(toggle);
    syncToggleVisibility();
  }

  function initTheme() {
    attachThemeToggle();
    const initialTheme = getSavedTheme();
    bootstrapTheme(initialTheme);
    syncToggleVisibility();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      const observer = new MutationObserver(() => syncToggleVisibility());
      observer.observe(logoutBtn, { attributes: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme, { once: true });
  } else {
    initTheme();
  }
})();
