import { navigate } from '../utils/router.js';
import { t } from '../utils/i18n.js';
import { getCurrentUser, signInWithGoogle, signOut } from '../utils/auth.js';

const NAV_ITEMS = [
  { key: 'notes', route: '/dashboard', labelKey: 'navNotes', icon: iconNotes },
  { key: 'market', route: '/market', labelKey: 'navMarket', icon: iconMarket },
  { key: 'community', route: null, labelKey: 'navCommunity', icon: iconCommunity, disabled: true },
  { key: 'trash', route: '/trash', labelKey: 'navTrash', icon: iconTrash },
];

export async function renderAppLayout(container, { active, renderContent }) {
  container.innerHTML = '';

  const user = await getCurrentUser();

  const shell = document.createElement('div');
  shell.className = 'app-shell';
  shell.innerHTML = `
    <aside class="app-sidebar" id="app-sidebar">
      <div class="app-sidebar__brand" id="app-sidebar-brand">
        <span class="app-sidebar__logo">ChoreoNote</span>
      </div>
      <nav class="app-sidebar__nav">
        ${NAV_ITEMS.map(item => renderNavItem(item, active)).join('')}
      </nav>
      <div class="app-sidebar__footer">
        ${renderUserSlot(user)}
      </div>
    </aside>

    <button class="app-sidebar__scrim" id="app-sidebar-scrim" aria-hidden="true" hidden></button>

    <div class="app-main">
      <header class="app-topbar">
        <button class="app-topbar__menu" id="app-topbar-menu" aria-label="${t('navMenu')}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div class="app-topbar__title">${activeLabel(active)}</div>
      </header>
      <div class="app-content" id="app-content"></div>
    </div>
  `;
  container.appendChild(shell);

  const content = shell.querySelector('#app-content');
  await renderContent(content);

  wireNav(shell, user);
}

function renderNavItem(item, active) {
  const isActive = item.key === active;
  const disabledAttr = item.disabled ? 'disabled' : '';
  const classes = [
    'app-sidebar__nav-item',
    isActive ? 'app-sidebar__nav-item--active' : '',
    item.disabled ? 'app-sidebar__nav-item--disabled' : '',
  ].filter(Boolean).join(' ');

  const badge = item.disabled
    ? `<span class="app-sidebar__nav-badge">${t('navCommunityComing')}</span>`
    : '';

  return `
    <button class="${classes}" data-nav="${item.key}" ${disabledAttr}>
      <span class="app-sidebar__nav-icon">${item.icon()}</span>
      <span class="app-sidebar__nav-label">${t(item.labelKey)}</span>
      ${badge}
    </button>
  `;
}

function renderUserSlot(user) {
  if (!user) {
    return `
      <button class="app-sidebar__signin" id="app-sidebar-signin">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
        <span class="app-sidebar__signin-text">
          <span class="app-sidebar__signin-title">${t('navLoginOptional')}</span>
          <span class="app-sidebar__signin-hint">${t('navLoginHint')}</span>
        </span>
      </button>
    `;
  }

  const name = user.user_metadata?.name || user.email?.split('@')[0] || '?';
  const initial = (name[0] || '?').toUpperCase();
  const avatarUrl = user.user_metadata?.avatar_url || '';
  const avatar = avatarUrl
    ? `<img src="${avatarUrl}" alt="" />`
    : `<span>${initial}</span>`;

  return `
    <div class="app-sidebar__user" id="app-sidebar-user">
      <button class="app-sidebar__user-btn" id="app-sidebar-user-btn" aria-haspopup="true">
        <span class="app-sidebar__user-avatar">${avatar}</span>
        <span class="app-sidebar__user-meta">
          <span class="app-sidebar__user-name">${escapeHtml(name)}</span>
          <span class="app-sidebar__user-email">${escapeHtml(user.email || '')}</span>
        </span>
        <svg class="app-sidebar__user-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
      <div class="app-sidebar__user-menu" id="app-sidebar-user-menu" hidden>
        <button class="app-sidebar__user-menu-item" id="app-sidebar-logout">${t('marketLogout')}</button>
      </div>
    </div>
  `;
}

function wireNav(shell, user) {
  shell.querySelector('#app-sidebar-brand').addEventListener('click', () => navigate('/'));

  shell.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.nav;
      const item = NAV_ITEMS.find(i => i.key === key);
      if (!item || item.disabled || !item.route) return;
      closeDrawer(shell);
      navigate(item.route);
    });
  });

  const menuBtn = shell.querySelector('#app-topbar-menu');
  const scrim = shell.querySelector('#app-sidebar-scrim');
  menuBtn.addEventListener('click', () => openDrawer(shell));
  scrim.addEventListener('click', () => closeDrawer(shell));

  const signinBtn = shell.querySelector('#app-sidebar-signin');
  if (signinBtn) {
    signinBtn.addEventListener('click', () => {
      const hash = window.location.hash.slice(1) || '/dashboard';
      signInWithGoogle(hash);
    });
  }

  const userBtn = shell.querySelector('#app-sidebar-user-btn');
  const userMenu = shell.querySelector('#app-sidebar-user-menu');
  if (userBtn && userMenu) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.hidden = !userMenu.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!userMenu.hidden && !e.target.closest('#app-sidebar-user')) {
        userMenu.hidden = true;
      }
    });
  }

  const logoutBtn = shell.querySelector('#app-sidebar-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (!confirm(t('logoutConfirm'))) return;
      await signOut();
      window.location.reload();
    });
  }
}

function openDrawer(shell) {
  shell.querySelector('#app-sidebar').classList.add('app-sidebar--open');
  const scrim = shell.querySelector('#app-sidebar-scrim');
  scrim.hidden = false;
}

function closeDrawer(shell) {
  shell.querySelector('#app-sidebar').classList.remove('app-sidebar--open');
  const scrim = shell.querySelector('#app-sidebar-scrim');
  scrim.hidden = true;
}

function activeLabel(active) {
  const item = NAV_ITEMS.find(i => i.key === active);
  return item ? t(item.labelKey) : '';
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function iconNotes() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`;
}
function iconMarket() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h9.2a2 2 0 0 0 2-1.6L23 6H6"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></svg>`;
}
function iconCommunity() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
}
function iconTrash() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`;
}
