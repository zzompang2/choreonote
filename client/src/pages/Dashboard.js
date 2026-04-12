import { NoteStore } from '../store/NoteStore.js';
import { navigate } from '../utils/router.js';
import { formatTime } from '../utils/constants.js';

export async function renderDashboard(container) {
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'dashboard';

  const notes = await NoteStore.getAllNotes();

  div.innerHTML = `
    <div class="dashboard__header">
      <div id="dashboard-logo" style="cursor:pointer">
        <div class="dashboard__title">ChoreoNote</div>
        <div class="dashboard__subtitle">당신의 멋진 무대를 위해</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <label class="sort-dropdown">
          <select id="sort-select">
            <option value="editedAt">최근 수정</option>
            <option value="createdAt">생성일</option>
            <option value="title">이름순</option>
          </select>
        </label>
        <button class="btn btn--ghost" id="import-btn">가져오기</button>
        <button class="btn btn--primary" id="create-btn">+ 새 노트</button>
      </div>
    </div>
    <div class="note-grid" id="note-grid"></div>
    <input type="file" id="import-file" accept=".json" style="display:none" />
  `;

  container.appendChild(div);

  const grid = div.querySelector('#note-grid');
  renderNoteCards(grid, notes);

  div.querySelector('#dashboard-logo').addEventListener('click', () => navigate('/'));

  div.querySelector('#create-btn').addEventListener('click', async () => {
    const noteId = await NoteStore.createNote();
    navigate(`/edit/${noteId}`);
  });

  div.querySelector('#sort-select').addEventListener('change', async (e) => {
    const sorted = await NoteStore.getAllNotes(e.target.value);
    renderNoteCards(grid, sorted);
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
      alert('파일을 불러올 수 없습니다: ' + err.message);
    }
  });
}

function renderNoteCards(grid, notes) {
  if (notes.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state__icon">🎵</div>
        <p>아직 노트가 없습니다</p>
        <p style="margin-top:8px;font-size:14px">+ 새 노트를 눌러 시작하세요</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = notes.map((note) => `
    <div class="note-card" data-id="${note.id}">
      <button class="note-card__delete" data-delete="${note.id}" title="삭제">✕</button>
      <div class="note-card__title">${escapeHtml(note.title)}</div>
      <div class="note-card__meta">
        ${formatDate(note.editedAt)} · ${formatTime(note.duration)}
        ${note.musicName ? ' · ' + escapeHtml(note.musicName) : ''}
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.note-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.note-card__delete')) return;
      navigate(`/edit/${card.dataset.id}`);
    });
  });

  grid.querySelectorAll('.note-card__delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('이 노트를 삭제할까요?')) return;
      await NoteStore.deleteNote(Number(btn.dataset.delete));
      const updated = await NoteStore.getAllNotes();
      renderNoteCards(grid, updated);
    });
  });
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
