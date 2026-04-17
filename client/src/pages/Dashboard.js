import { NoteStore } from '../store/NoteStore.js';
import { db } from '../store/db.js';
import { navigate } from '../utils/router.js';
import { formatTime } from '../utils/constants.js';
import { t } from '../utils/i18n.js';
import { renderFormationThumbnail } from '../utils/thumbnail.js';
import { getCurrentUser } from '../utils/auth.js';
import { getSyncStatus, fetchCloudNotes, downloadCloudNote } from '../utils/cloudSync.js';
import { showToast } from '../utils/toast.js';
import { renderAppLayout } from '../components/AppLayout.js';

export async function renderDashboard(container) {
  await renderAppLayout(container, {
    active: 'notes',
    renderContent: async (content) => { await renderDashboardContent(content, container); },
  });
}

async function renderDashboardContent(content, rootContainer) {
  // Purge notes deleted more than 30 days ago
  await NoteStore.purgeExpiredNotes(30);

  const notes = await NoteStore.getAllNotes();
  const user = await getCurrentUser();

  const div = document.createElement('div');
  div.className = 'dashboard';

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
      <div class="note-grid" id="note-grid"></div>
      <div id="cloud-section"></div>
      <input type="file" id="import-file" accept=".json" style="display:none" />
    </div>
  `;

  content.innerHTML = '';
  content.appendChild(div);

  const grid = div.querySelector('#note-grid');
  renderNoteCards(grid, notes, user);

  // 클라우드 노트 섹션 (로그인 시)
  renderCloudSection(div.querySelector('#cloud-section'), notes, user, rootContainer);

  // Storage usage warning
  checkStorageUsage(div.querySelector('#storage-warning'));

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
    const syncIcon = user ? renderSyncIcon(note) : '';
    return `
      <div class="note-card" data-id="${note.id}">
        <div class="note-card__thumbnail">
          <canvas data-thumb="${note.id}" width="200" height="134"></canvas>
          ${syncIcon}
          <button class="note-card__delete" data-delete="${note.id}" title="${t('delete')}" aria-label="${t('delete')}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg></button>
        </div>
        <div class="note-card__body">
          <div class="note-card__title">${escapeHtml(note.title)}</div>
          <div class="note-card__meta">
            <span>${formatDate(note.createdAt)}</span>
            <span class="note-card__dot"></span>
            <span>${formatTime(note.duration)}</span>
          </div>
        </div>
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
      renderNoteCards(grid, updated, user);
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

// ── 클라우드 동기화 아이콘 (썸네일 오버레이) ──

function renderSyncIcon(note) {
  const status = getSyncStatus(note);
  if (status === 'local') return '';
  const label = status === 'synced' ? t('cloudSynced') : t('cloudUnsynced');
  return `<span class="note-card__sync note-card__sync--${status}" title="${label}" aria-label="${label}">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
  </span>`;
}

// ── 클라우드 노트 섹션 (이 기기에 없는 노트) ──

async function renderCloudSection(el, localNotes, user, dashboardContainer) {
  if (!el || !user) return;

  try {
    const cloudNotes = await fetchCloudNotes();
    const localCloudIds = new Set();
    const allLocalNotes = await db.notes.toArray();
    for (const n of allLocalNotes) {
      if (n.cloudId) localCloudIds.add(n.cloudId);
    }

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

    const cloudGrid = el.querySelector('#cloud-grid');
    if (localStorage.getItem('choreonote-list-view') === '1') {
      cloudGrid.classList.add('note-grid--list');
    }

    el.querySelectorAll('[data-cloud-download]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const cloudId = btn.dataset.cloudDownload;
        const cloudNote = missingNotes.find(cn => cn.id === cloudId);
        if (!cloudNote) return;

        btn.disabled = true;
        btn.textContent = '...';
        try {
          await downloadCloudNote(cloudNote);
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
