import { NoteStore } from '../store/NoteStore.js';
import { navigate } from '../utils/router.js';
import { formatTime } from '../utils/constants.js';
import { t } from '../utils/i18n.js';
import { renderFormationThumbnail } from '../utils/thumbnail.js';
import { getCurrentUser, wasSessionExpired, clearSessionExpired } from '../utils/auth.js';
import { moveNoteToCloud, moveNoteToLocal } from '../utils/cloudSync.js';
import { showToast } from '../utils/toast.js';
import { renderAppLayout } from '../components/AppLayout.js';

export async function renderDashboard(container) {
  await renderAppLayout(container, {
    active: 'notes',
    renderContent: async (content) => { await renderDashboardContent(content, container); },
  });
}

// 로그인 직후 자동 동기화 완료 시 대시보드 재렌더
let cloudUpdateListenerBound = false;

async function renderDashboardContent(content, rootContainer) {
  await NoteStore.purgeExpiredNotes(30);

  const notes = await NoteStore.getAllNotes();
  const user = await getCurrentUser();

  if (!cloudUpdateListenerBound) {
    cloudUpdateListenerBound = true;
    document.addEventListener('app:cloud-notes-updated', () => {
      renderDashboard(rootContainer);
    });
  }

  const div = document.createElement('div');
  div.className = 'dashboard';

  const showSessionExpired = !user && wasSessionExpired();

  div.innerHTML = `
    <div class="dashboard__header">
      <h1 class="dashboard__title">${t('navNotes')}</h1>
      <div class="dashboard__actions">
        <div class="dashboard__toolbar">
          <div class="sort-dropdown">
            <svg class="sort-dropdown__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h13M3 12h9M3 18h5"/><path d="M17 3v18M17 3l-3 3M17 3l3 3"/></svg>
            <select id="sort-select" aria-label="${t('sortRecent')}">
              <option value="editedAt">${t('sortRecent')}</option>
              <option value="createdAt">${t('sortCreated')}</option>
              <option value="title">${t('sortName')}</option>
            </select>
            <svg class="sort-dropdown__caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <button class="btn btn--ghost btn--icon" id="view-toggle-btn" title="${t('viewToggle')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
        </div>
        <button class="btn btn--ghost btn--icon" id="import-btn" title="${t('importBtn')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
        <button class="btn btn--primary" id="create-btn">${t('newNote')}</button>
      </div>
    </div>
    <div class="dashboard__body">
      <div class="storage-warning" id="storage-warning" style="display:none"></div>
      ${showSessionExpired ? `
        <div class="session-expired-banner" id="session-expired-banner">
          <span>${t('sessionExpiredBanner')}</span>
          <button class="session-expired-banner__dismiss" id="session-expired-dismiss">${t('sessionExpiredDismiss')}</button>
        </div>
      ` : ''}
      <div class="dashboard__folder-section" data-folder="local">
        <div class="dashboard__folder-header">💻 ${t('folderLocal')}</div>
        <div class="note-grid" id="local-grid"></div>
      </div>
      ${user ? `
        <div class="dashboard__folder-section" data-folder="cloud">
          <div class="dashboard__folder-header">☁ ${t('folderCloud')}</div>
          <div class="note-grid" id="cloud-grid"></div>
        </div>
      ` : ''}
      <input type="file" id="import-file" accept=".json" style="display:none" />
    </div>
  `;

  content.innerHTML = '';
  content.appendChild(div);

  if (showSessionExpired) {
    div.querySelector('#session-expired-dismiss').addEventListener('click', () => {
      clearSessionExpired();
      div.querySelector('#session-expired-banner').remove();
    });
  }

  const localGrid = div.querySelector('#local-grid');
  const cloudGrid = div.querySelector('#cloud-grid');

  const isListView = localStorage.getItem('choreonote-list-view') === '1';
  if (isListView) {
    localGrid.classList.add('note-grid--list');
    cloudGrid?.classList.add('note-grid--list');
  }

  renderFolderSection(localGrid, notes.filter(n => n.location !== 'cloud'), 'local', user, rootContainer);
  if (cloudGrid) {
    renderFolderSection(cloudGrid, notes.filter(n => n.location === 'cloud'), 'cloud', user, rootContainer);
  }

  checkStorageUsage(div.querySelector('#storage-warning'));

  div.querySelector('#create-btn').addEventListener('click', async () => {
    const noteId = await NoteStore.createNote();
    navigate(`/edit/${noteId}`);
  });

  div.querySelector('#sort-select').addEventListener('change', async (e) => {
    const sorted = await NoteStore.getAllNotes(e.target.value);
    renderFolderSection(localGrid, sorted.filter(n => n.location !== 'cloud'), 'local', user, rootContainer);
    if (cloudGrid) {
      renderFolderSection(cloudGrid, sorted.filter(n => n.location === 'cloud'), 'cloud', user, rootContainer);
    }
  });

  const viewToggleBtn = div.querySelector('#view-toggle-btn');
  viewToggleBtn.addEventListener('click', () => {
    const next = !localGrid.classList.contains('note-grid--list');
    localStorage.setItem('choreonote-list-view', next ? '1' : '0');
    localGrid.classList.toggle('note-grid--list', next);
    cloudGrid?.classList.toggle('note-grid--list', next);
  });

  const importFile = div.querySelector('#import-file');
  div.querySelector('#import-btn').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const noteId = await NoteStore.importJSON(text);
      navigate(`/edit/${noteId}`);
    } catch (err) {
      alert(t('importError') + ' ' + err.message);
    }
  });
}

function renderFolderSection(grid, notes, folder, user, rootContainer) {
  if (notes.length === 0) {
    let hint;
    if (folder === 'local') hint = t('folderLocalEmpty');
    else hint = user ? t('folderCloudEmpty') : t('folderCloudLoginHint');
    grid.innerHTML = `
      <div class="empty-state empty-state--subtle" style="grid-column:1/-1">
        <p>${hint}</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = notes.map((note) => {
    const pendingBadge = note.cloudUploadPending ? `<span class="note-card__pending" title="${t('cloudUploadPending')}" aria-label="${t('cloudUploadPending')}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 10 15 10"/></svg></span>` : '';
    return `
    <div class="note-card" data-id="${note.id}" data-location="${note.location || 'local'}">
      <div class="note-card__thumbnail">
        <canvas data-thumb="${note.id}" width="200" height="134"></canvas>
        ${pendingBadge}
      </div>
      <div class="note-card__body">
        <div class="note-card__title">${escapeHtml(note.title)}</div>
        <div class="note-card__meta">
          <span>${formatDate(note.createdAt)}</span>
          <span class="note-card__dot"></span>
          <span>${formatTime(note.duration)}</span>
        </div>
      </div>
      <button class="note-card__more" data-more="${note.id}" title="${t('cardMoreMenu')}" aria-label="${t('cardMoreMenu')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
    </div>
  `;
  }).join('');

  for (const note of notes) {
    renderThumbnail(grid.querySelector(`canvas[data-thumb="${note.id}"]`), note.id);
  }

  grid.querySelectorAll('.note-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.note-card__more')) return;
      if (e.target.closest('.card-menu')) return;
      navigate(`/edit/${card.dataset.id}`);
    });
  });

  grid.querySelectorAll('.note-card__more').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCardMenu(btn, Number(btn.dataset.more), folder, user, rootContainer);
    });
  });
}

function openCardMenu(anchor, noteId, folder, user, rootContainer) {
  closeAnyCardMenu();

  const menu = document.createElement('div');
  menu.className = 'card-menu';

  const items = [];
  if (folder === 'local' && user) {
    items.push({ action: 'to-cloud', label: t('moveToCloud') });
  } else if (folder === 'cloud') {
    items.push({ action: 'to-local', label: t('moveToLocal') });
  }
  items.push({ action: 'delete', label: t('delete'), danger: true });

  menu.innerHTML = items.map(it =>
    `<button data-action="${it.action}"${it.danger ? ' class="card-menu__danger"' : ''}>${it.label}</button>`
  ).join('');

  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.right - 180}px`;
  menu.style.zIndex = '1000';
  document.body.appendChild(menu);

  menu.querySelectorAll('button[data-action]').forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = b.dataset.action;
      closeCardMenu(menu);
      if (action === 'to-cloud') {
        try {
          await moveNoteToCloud(noteId);
          showToast(t('moveToCloudSuccess'));
          renderDashboard(rootContainer);
        } catch (err) {
          console.error('moveToCloud failed:', err);
          showToast(t('moveFail'), 3000);
        }
      } else if (action === 'to-local') {
        if (!confirm(t('confirmMoveToLocal'))) return;
        try {
          await moveNoteToLocal(noteId);
          showToast(t('moveToLocalSuccess'));
          renderDashboard(rootContainer);
        } catch (err) {
          console.error('moveToLocal failed:', err);
          showToast(t('moveFail'), 3000);
        }
      } else if (action === 'delete') {
        if (!confirm(t('confirmDeleteNote'))) return;
        await NoteStore.deleteNote(noteId);
        const updated = await NoteStore.getAllNotes();
        if (updated.length === 0) {
          localStorage.removeItem('choreonote-onboarding-done');
          localStorage.removeItem('choreonote-unlocked-features');
        }
        renderDashboard(rootContainer);
      }
    });
  });

  const onDocClick = (e) => {
    if (!menu.contains(e.target) && e.target !== anchor) closeCardMenu(menu);
  };
  setTimeout(() => document.addEventListener('click', onDocClick, { once: true }), 0);
  menu.__onDocClick = onDocClick;
}

function closeCardMenu(menu) {
  if (!menu) return;
  if (menu.__onDocClick) document.removeEventListener('click', menu.__onDocClick);
  menu.remove();
}

function closeAnyCardMenu() {
  document.querySelectorAll('.card-menu').forEach(closeCardMenu);
}

async function renderThumbnail(canvas, noteId) {
  if (!canvas) return;
  const data = await NoteStore.getThumbnailData(noteId);
  if (!data) {
    renderFormationThumbnail(canvas, { dancers: [], positions: [], stageWidth: 600, stageHeight: 400, dancerShape: 'pentagon', dancerScale: 1, showWings: false });
    return;
  }
  renderFormationThumbnail(canvas, { ...data, showWings: false, hideOffstage: true });
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}. ${m}. ${day}.`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function checkStorageUsage(el) {
  if (!el || !navigator.storage?.estimate) return;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    const pct = usage / quota;
    if (pct < 0.8) return;
    const usedMB = (usage / 1024 / 1024).toFixed(1);
    const totalMB = (quota / 1024 / 1024).toFixed(0);
    el.style.display = '';
    el.textContent = t('storageWarning', { used: usedMB, total: totalMB, pct: Math.round(pct * 100) });
  } catch (_) {}
}
