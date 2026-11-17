(function enforceRoleAccess() {
  'use strict';

  // This guards client-side navigation; Firestore rules must protect the data.
  const ROLE_VIEWS = {
    student: ['studentView', 'studentOrdersView', 'reportView'],
    owner: ['ownerView', 'kitchenView', 'reportView'],
    admin: ['adminView']
  };

  const ROLE_TABS = {
    student: ['studentTab', 'myOrdersTab', 'reportTab', 'cartBtn'],
    owner: ['foodMenuTab', 'vendorTab', 'reportTab'],
    admin: ['adminTab']
  };

  const ALL_VIEWS = [
    'studentView', 'studentOrdersView', 'kitchenView',
    'ownerView', 'adminView', 'reportView'
  ];
  const ALL_TABS = [
    'studentTab', 'myOrdersTab', 'vendorTab', 'foodMenuTab',
    'adminTab', 'reportTab', 'cartBtn'
  ];
  const _originalShowOnly = window.showOnly;
  const loginView = document.getElementById('loginView');

  function getRole() {
    if (!loginView || !loginView.classList.contains('hidden')) return '';
    return typeof currentRole === 'string' ? currentRole : '';
  }

  function hideAllViews() {
    ALL_VIEWS.forEach(id => document.getElementById(id)?.classList.add('hidden'));
  }

  function lockSignedOutUI() {
    ALL_TABS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('hidden');
      el.disabled = true;
      el.setAttribute('aria-hidden', 'true');
    });
    document.getElementById('kitchenMenuShortcut')?.classList.add('hidden');
    hideAllViews();
  }

  window.applyRoleTabs = function (role) {
    const allowed = ROLE_TABS[role] || [];
    ALL_TABS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const canSee = allowed.includes(id);
      el.classList.toggle('hidden', !canSee);
      el.disabled = !canSee;
      el.setAttribute('aria-hidden', String(!canSee));
    });
    document.getElementById('kitchenMenuShortcut')
      ?.classList.toggle('hidden', role !== 'owner');
  };

  window.showOnly = function (viewId) {
    const role = getRole();
    if (!role || !ROLE_VIEWS[role]) {
      lockSignedOutUI();
      if (loginView) loginView.classList.remove('hidden');
      return false;
    }

    if (!ROLE_VIEWS[role].includes(viewId)) {
      alert('Access denied: This page is restricted to another portal.');
      const fallback = ROLE_VIEWS[role][0];
      return _originalShowOnly ? _originalShowOnly(fallback) : false;
    }

    window.applyRoleTabs(role);
    return _originalShowOnly ? _originalShowOnly(viewId) : false;
  };

  const tabRoles = {
    studentTab: ['student'],
    myOrdersTab: ['student'],
    vendorTab: ['owner'],
    foodMenuTab: ['owner'],
    adminTab: ['admin'],
    reportTab: ['student', 'owner'],
    cartBtn: ['student']
  };

  document.addEventListener('click', event => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const tab = target.closest('#' + ALL_TABS.join(', #'));
    if (!tab) return;
    const role = getRole();
    if (!role || !(tabRoles[tab.id] || []).includes(role)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  function syncRoleAccess() {
    const role = getRole();
    if (!role || !ROLE_VIEWS[role]) {
      lockSignedOutUI();
      return;
    }

    window.applyRoleTabs(role);
    const activeView = ALL_VIEWS.find(id =>
      !document.getElementById(id)?.classList.contains('hidden')
    );
    if (!activeView || !ROLE_VIEWS[role].includes(activeView)) {
      window.showOnly(ROLE_VIEWS[role][0]);
    }
  }

  if (loginView) {
    new MutationObserver(syncRoleAccess)
      .observe(loginView, { attributes: true, attributeFilter: ['class'] });
  }
  syncRoleAccess();
})();
