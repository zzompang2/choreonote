import { NoteStore } from '../store/NoteStore.js';
import { t } from '../utils/i18n.js';
import { renderAppLayout } from '../components/AppLayout.js';

export async function renderTrash(container) {
  await renderAppLayout(container, {
    active: 'trash',
    renderContent: async (content) => { await renderTrashContent(content); },
  });
}

async function renderTrashContent(content) {
  const deletedNotes = await NoteStore.getDeletedNotes();

  const wrap = document.createElement('div');
  wrap.className = 'trash-page';
  wrap.innerHTML = `
    <div class="trash-page__header">
      <h1 class="trash-page__title">${t('navTrash')}</h1>
      ${deletedNotes.length > 0
        ? `<button class="btn btn--ghost btn--sm btn--danger" id="trash-empty-btn">${t('trashEmpty')}</button>`
        : ''}
    </div>
    <div class="trash-page__body" id="trash-body"></div>
  `;
  content.innerHTML = '';
  content.appendChild(wrap);

  const body = wrap.querySelector('#trash-body');
  if (deletedNotes.length === 0) {
    body.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🗑</div>
        <p>${t('trashEmptyState') || '휴지통이 비어 있습니다'}</p>
      </div>
    `;
    return;
  }

  const listView = localStorage.getItem('choreonote-list-view') === '1';
  body.innerHTML = `<div class="note-grid${listView ? ' note-grid--list' : ''}" id="trash-grid"></div>`;
  renderTrashCards(body.querySelector('#trash-grid'), deletedNotes, content);

  const emptyBtn = wrap.querySelector('#trash-empty-btn');
  if (emptyBtn) {
    emptyBtn.addEventListener('click', async () => {
      if (!confirm(t('confirmEmptyTrash'))) return;
      for (const note of deletedNotes) {
        await NoteStore.permanentlyDeleteNote(note.id);
      }
      await renderTrashContent(content);
    });
  }
}

function renderTrashCards(grid, notes, content) {
  grid.innerHTML = notes.map((note) => {
    const daysLeft = Math.max(0, 30 - Math.round((Date.now() - new Date(note.deletedAt)) / (24 * 60 * 60 * 1000)));
    return `
      <div class="note-card note-card--deleted" data-id="${note.id}">
        <div class="note-card__body">
          <div class="note-card__title">${escapeHtml(note.title)}</div>
          <div class="note-card__meta">${t('trashDaysLeft', { days: daysLeft })}</div>
          <div class="note-card__trash-actions">
            <button class="btn btn--ghost btn--sm" data-restore="${note.id}">${t('trashRestore')}</button>
            <button class="btn btn--ghost btn--sm btn--danger" data-purge="${note.id}">${t('trashDelete')}</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-restore]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await NoteStore.restoreNote(Number(btn.dataset.restore));
      await renderTrashContent(content);
    });
  });

  grid.querySelectorAll('[data-purge]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(t('confirmPermanentDelete'))) return;
      await NoteStore.permanentlyDeleteNote(Number(btn.dataset.purge));
      await renderTrashContent(content);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
