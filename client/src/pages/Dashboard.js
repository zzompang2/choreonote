import { NoteStore } from '../store/NoteStore.js';
import { db } from '../store/db.js';
import { navigate } from '../utils/router.js';
import { formatTime } from '../utils/constants.js';
import { t } from '../utils/i18n.js';
import { renderFormationThumbnail } from '../utils/thumbnail.js';
import { getCurrentUser, signInWithGoogle, signOut } from '../utils/auth.js';
import { getSyncStatus, fetchCloudNotes, downloadCloudNote } from '../utils/cloudSync.js';
import { showToast } from '../utils/toast.js';

export async function renderDashboard(container) {
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'dashboard';

  // Purge notes deleted more than 30 days ago
  await NoteStore.purgeExpiredNotes(30);

  const notes = await NoteStore.getAllNotes();
  const deletedNotes = await NoteStore.getDeletedNotes();
  const user = await getCurrentUser();

  const userBtnHTML = user
    ? `<button class="btn btn--ghost btn--sm" id="dashboard-user-btn" title="${user.email}">${user.user_metadata?.name || user.email?.split('@')[0] || '유저'}</button>
       <button class="btn btn--ghost btn--sm" id="dashboard-logout-btn">${t('marketLogout')}</button>`
    : `<button class="btn btn--ghost btn--sm" id="dashboard-login-btn">${t('marketLoginGoogle')}</button>`;

  div.innerHTML = `
    <div class="dashboard__header">
      <div id="dashboard-logo" style="cursor:pointer">
        <div class="dashboard__title">ChoreoNote</div>
        <div class="dashboard__subtitle">${t('backToLanding')}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${userBtnHTML}
        <label class="sort-dropdown">
          <select id="sort-select">
            <option value="editedAt">${t('sortRecent')}</option>
            <option value="createdAt">${t('sortCreated')}</option>
            <option value="title">${t('sortName')}</option>
          </select>
        </label>
        <button class="btn btn--ghost btn--icon" id="view-toggle-btn" title="${t('viewToggle')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
        <button class="btn btn--ghost" id="market-btn">${t('market')}</button>
        <button class="btn btn--ghost" id="import-btn">${t('importBtn')}</button>
        <button class="btn btn--primary" id="create-btn">${t('newNote')}</button>
      </div>
    </div>
    <div class="dashboard__body">
      <div class="storage-warning" id="storage-warning" style="display:none"></div>
      <div class="note-grid" id="note-grid"></div>
      <div id="cloud-section"></div>
      ${deletedNotes.length > 0 ? `
        <details class="trash-section">
          <summary class="trash-section__toggle">
            ${t('trash')} (${deletedNotes.length})
            <button class="btn btn--ghost btn--sm btn--danger trash-empty-btn" id="trash-empty-btn">${t('trashEmpty')}</button>
          </summary>
          <div class="note-grid" id="trash-grid"></div>
        </details>
      ` : ''}
      <input type="file" id="import-file" accept=".json" style="display:none" />
    </div>
  `;

  container.appendChild(div);

  const grid = div.querySelector('#note-grid');
  renderNoteCards(grid, notes, user);

  // 클라우드 노트 섹션 (로그인 시)
  renderCloudSection(div.querySelector('#cloud-section'), notes, user, container);

  // Render trash grid
  const trashGrid = div.querySelector('#trash-grid');
  if (trashGrid) {
    if (localStorage.getItem('choreonote-list-view') === '1') trashGrid.classList.add('note-grid--list');
    renderTrashCards(trashGrid, deletedNotes, div);
  }

  // Storage usage warning
  checkStorageUsage(div.querySelector('#storage-warning'));

  div.querySelector('#dashboard-logo').addEventListener('click', () => navigate('/'));

  // 로그인/로그아웃
  const loginBtn = div.querySelector('#dashboard-login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => signInWithGoogle('/dashboard'));
  }
  const logoutBtn = div.querySelector('#dashboard-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await signOut();
      renderDashboard(container);
    });
  }

  div.querySelector('#market-btn').addEventListener('click', () => navigate('/market'));

  div.querySelector('#create-btn').addEventListener('click', async () => {
    const noteId = await NoteStore.createNote();
    navigate(`/edit/${noteId}`);
  });

  div.querySelector('#sort-select').addEventListener('change', async (e) => {
    const sorted = await NoteStore.getAllNotes(e.target.value);
    renderNoteCards(grid, sorted, user);
  });

  // View toggle (grid / list)
  const viewToggleBtn = div.querySelector('#view-toggle-btn');
  let isListView = localStorage.getItem('choreonote-list-view') === '1';
  if (isListView) grid.classList.add('note-grid--list');
  viewToggleBtn.addEventListener('click', () => {
    isListView = !isListView;
    localStorage.setItem('choreonote-list-view', isListView ? '1' : '0');
    grid.classList.toggle('note-grid--list', isListView);
    const trashG = div.querySelector('#trash-grid');
    if (trashG) trashG.classList.toggle('note-grid--list', isListView);
  });

  // Empty trash
  const trashEmptyBtn = div.querySelector('#trash-empty-btn');
  if (trashEmptyBtn) {
    trashEmptyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(t('confirmEmptyTrash'))) return;
      for (const note of deletedNotes) {
        await NoteStore.permanentlyDeleteNote(note.id);
      }
      renderDashboard(container);
    });
  }

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

function renderNoteCards(grid, notes, user) {
  if (notes.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state__icon">🎵</div>
        <p>${t('emptyTitle')}</p>
        <p style="margin-top:8px;font-size:14px">${t('emptyDesc')}</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = notes.map((note) => {
    const syncBadge = user ? renderSyncBadge(note) : '';
    return `
      <div class="note-card" data-id="${note.id}">
        <button class="note-card__delete" data-delete="${note.id}" title="${t('delete')}">✕</button>
        <div class="note-card__thumbnail">
          <canvas data-thumb="${note.id}" width="200" height="134"></canvas>
        </div>
        <div class="note-card__title">${escapeHtml(note.title)}</div>
        <div class="note-card__meta">
          ${t('created')} ${formatDate(note.createdAt)} · ${t('edited')} ${formatDate(note.editedAt)} · ${formatTime(note.duration)}
        </div>
        ${syncBadge}
      </div>
    `;
  }).join('');

  // Render thumbnails asynchronously
  for (const note of notes) {
    renderThumbnail(grid.querySelector(`canvas[data-thumb="${note.id}"]`), note.id);
  }

  grid.querySelectorAll('.note-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.note-card__delete')) return;
      navigate(`/edit/${card.dataset.id}`);
    });
  });

  grid.querySelectorAll('.note-card__delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(t('confirmDeleteNote'))) return;
      await NoteStore.deleteNote(Number(btn.dataset.delete));
      const updated = await NoteStore.getAllNotes();
      if (updated.length === 0) {
        localStorage.removeItem('choreonote-onboarding-done');
        localStorage.removeItem('choreonote-unlocked-features');
      }
      renderNoteCards(grid, updated);
    });
  });
}

function renderTrashCards(grid, notes, dashboardDiv) {
  if (notes.length === 0) {
    grid.innerHTML = '';
    const section = grid.closest('.trash-section');
    if (section) section.remove();
    return;
  }

  grid.innerHTML = notes.map((note) => {
    const daysLeft = Math.max(0, 30 - Math.round((Date.now() - new Date(note.deletedAt)) / (24 * 60 * 60 * 1000)));
    return `
      <div class="note-card note-card--deleted" data-id="${note.id}">
        <div class="note-card__title">${escapeHtml(note.title)}</div>
        <div class="note-card__meta">${t('trashDaysLeft', { days: daysLeft })}</div>
        <div class="note-card__trash-actions">
          <button class="btn btn--ghost btn--sm" data-restore="${note.id}">${t('trashRestore')}</button>
          <button class="btn btn--ghost btn--sm btn--danger" data-purge="${note.id}">${t('trashDelete')}</button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-restore]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await NoteStore.restoreNote(Number(btn.dataset.restore));
      renderDashboard(dashboardDiv.parentElement);
    });
  });

  grid.querySelectorAll('[data-purge]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(t('confirmPermanentDelete'))) return;
      await NoteStore.permanentlyDeleteNote(Number(btn.dataset.purge));
      renderDashboard(dashboardDiv.parentElement);
    });
  });
}

async function renderThumbnail(canvas, noteId) {
  if (!canvas) return;
  const data = await NoteStore.getThumbnailData(noteId);
  if (!data) {
    renderFormationThumbnail(canvas, { dancers: [], positions: [], stageWidth: 600, stageHeight: 400, dancerShape: 'pentagon', dancerScale: 1, showWings: false });
    return;
  }
  renderFormationThumbnail(canvas, data);
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (y === now.getFullYear()) return `${m}/${day}`;
  return `${y}.${m}.${day}`;
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

// ── 클라우드 동기화 뱃지 ──

function renderSyncBadge(note) {
  const status = getSyncStatus(note);
  if (status === 'synced') {
    return `<div class="note-card__sync note-card__sync--synced"><span class="note-card__sync-icon">☁</span>${t('cloudSynced')}</div>`;
  }
  if (status === 'unsynced') {
    return `<div class="note-card__sync note-card__sync--unsynced"><span class="note-card__sync-icon">☁</span>${t('cloudUnsynced')}</div>`;
  }
  return `<div class="note-card__sync"><span class="note-card__sync-icon">💾</span>${t('cloudLocal')}</div>`;
}

// ── 클라우드 노트 섹션 (이 기기에 없는 노트) ──

async function renderCloudSection(el, localNotes, user, dashboardContainer) {
  if (!el || !user) return;

  try {
    const cloudNotes = await fetchCloudNotes();
    // 로컬에 이미 있는 cloudId 목록
    const localCloudIds = new Set();
    const allLocalNotes = await db.notes.toArray();
    for (const n of allLocalNotes) {
      if (n.cloudId) localCloudIds.add(n.cloudId);
    }

    // 로컬에 없는 클라우드 노트만 필터
    const missingNotes = cloudNotes.filter(cn => !localCloudIds.has(cn.id));
    if (missingNotes.length === 0) return;

    el.innerHTML = `
      <div class="cloud-section">
        <div class="cloud-section__title">☁ ${t('cloudSection')}</div>
        <div class="note-grid" id="cloud-grid">
          ${missingNotes.map(cn => {
            const noteJson = cn.note_json;
            const dancerCount = noteJson.dancers?.length || 0;
            const formationCount = noteJson.formations?.length || 0;
            return `
              <div class="cloud-note-card" data-cloud-id="${cn.id}">
                <div class="cloud-note-card__title">${escapeHtml(cn.title)}</div>
                <div class="cloud-note-card__meta">
                  ${t('marketDancerCount', { count: dancerCount })} · ${t('marketFormationCount', { count: formationCount })} · ${formatDate(cn.updated_at)}
                </div>
                <button class="cloud-note-card__download" data-cloud-download="${cn.id}">${t('cloudDownload')}</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // 리스트뷰 적용
    const cloudGrid = el.querySelector('#cloud-grid');
    if (localStorage.getItem('choreonote-list-view') === '1') {
      cloudGrid.classList.add('note-grid--list');
    }

    // 다운로드 버튼 이벤트
    el.querySelectorAll('[data-cloud-download]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const cloudId = btn.dataset.cloudDownload;
        const cloudNote = missingNotes.find(cn => cn.id === cloudId);
        if (!cloudNote) return;

        btn.disabled = true;
        btn.textContent = '...';
        try {
          const newNoteId = await downloadCloudNote(cloudNote);
          // 음악 미포함 안내
          if (cloudNote.music_name) {
            showToast(t('cloudMusicNotice'), 5000);
          }
          renderDashboard(dashboardContainer);
        } catch (err) {
          console.error('Cloud download failed:', err);
          btn.disabled = false;
          btn.textContent = t('cloudDownload');
        }
      });
    });
  } catch (err) {
    console.warn('Failed to load cloud notes:', err);
  }
}
