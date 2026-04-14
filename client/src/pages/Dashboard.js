import { NoteStore } from '../store/NoteStore.js';
import { navigate } from '../utils/router.js';
import { formatTime, DANCER_RADIUS } from '../utils/constants.js';
import { t } from '../utils/i18n.js';

export async function renderDashboard(container) {
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'dashboard';

  const notes = await NoteStore.getAllNotes();

  div.innerHTML = `
    <div class="dashboard__header">
      <div id="dashboard-logo" style="cursor:pointer">
        <div class="dashboard__title">ChoreoNote</div>
        <div class="dashboard__subtitle">${t('backToLanding')}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <label class="sort-dropdown">
          <select id="sort-select">
            <option value="editedAt">${t('sortRecent')}</option>
            <option value="createdAt">${t('sortCreated')}</option>
            <option value="title">${t('sortName')}</option>
          </select>
        </label>
        <button class="btn btn--ghost" id="import-btn">${t('importBtn')}</button>
        <button class="btn btn--primary" id="create-btn">${t('newNote')}</button>
      </div>
    </div>
    <div class="storage-warning" id="storage-warning" style="display:none"></div>
    <div class="note-grid" id="note-grid"></div>
    <input type="file" id="import-file" accept=".json" style="display:none" />
  `;

  container.appendChild(div);

  const grid = div.querySelector('#note-grid');
  renderNoteCards(grid, notes);

  // Storage usage warning
  checkStorageUsage(div.querySelector('#storage-warning'));

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
      alert(t('importError') + ' ' + err.message);
    }
  });
}

function renderNoteCards(grid, notes) {
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

  grid.innerHTML = notes.map((note) => `
    <div class="note-card" data-id="${note.id}">
      <button class="note-card__delete" data-delete="${note.id}" title="${t('delete')}">✕</button>
      <div class="note-card__thumbnail">
        <canvas data-thumb="${note.id}" width="200" height="134"></canvas>
      </div>
      <div class="note-card__title">${escapeHtml(note.title)}</div>
      <div class="note-card__meta">
        ${t('created')} ${formatDate(note.createdAt)} · ${t('edited')} ${formatDate(note.editedAt)} · ${formatTime(note.duration)}
      </div>
    </div>
  `).join('');

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

async function renderThumbnail(canvas, noteId) {
  if (!canvas) return;
  const data = await NoteStore.getThumbnailData(noteId);
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Background
  const styles = getComputedStyle(document.documentElement);
  const stageBg = styles.getPropertyValue('--stage-bg').trim() || '#1a1a2e';
  const wingBg = styles.getPropertyValue('--stage-wing').trim() || '#0a0a15';

  const cardBg = styles.getPropertyValue('--bg-card').trim() || '#16213e';

  if (!data || data.positions.length === 0) {
    ctx.fillStyle = wingBg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = stageBg;
    const pad = 6;
    ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);
    return;
  }

  const { dancers, positions, stageWidth, stageHeight, dancerShape, dancerScale, showWings } = data;
  const halfW = stageWidth / 2;
  const halfH = stageHeight / 2;

  // Scale to fit canvas with wing margin
  const wingRatio = showWings ? 0.08 : 0;
  const stageX = w * wingRatio;
  const stageY = h * wingRatio;
  const stageW = w * (1 - wingRatio * 2);
  const stageH = h * (1 - wingRatio * 2);
  const scaleX = stageW / stageWidth;
  const scaleY = stageH / stageHeight;
  const scale = Math.min(scaleX, scaleY);

  // Wing background
  ctx.fillStyle = showWings ? wingBg : cardBg;
  ctx.fillRect(0, 0, w, h);

  // Stage background
  ctx.fillStyle = stageBg;
  ctx.fillRect(stageX, stageY, stageW, stageH);

  // Stage border
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 2]);
  ctx.strokeRect(stageX, stageY, stageW, stageH);
  ctx.setLineDash([]);

  // Draw dancers
  const r = DANCER_RADIUS * dancerScale * scale;
  for (const pos of positions) {
    const dancer = dancers.find(d => d.id === pos.dancerId);
    if (!dancer) continue;

    const cx = stageX + stageW / 2 + pos.x * scale;
    const cy = stageY + stageH / 2 + pos.y * scale;
    const isOffstage = Math.abs(pos.x) > halfW || Math.abs(pos.y) > halfH;
    ctx.globalAlpha = isOffstage ? 0.4 : 1.0;

    const angle = (pos.angle || 0) * Math.PI / 180;

    // Shape
    ctx.beginPath();
    drawThumbnailShape(ctx, cx, cy, r, angle, dancerShape);
    ctx.fillStyle = dancer.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;
}

function drawThumbnailShape(ctx, cx, cy, r, rotation, shape) {
  if (shape === 'circle') {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    return;
  }
  if (shape === 'heart') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation + Math.PI);
    const hw = r * 1.2, hh = r * 1.05;
    ctx.moveTo(0, hh);
    ctx.bezierCurveTo(hw * 0.3, hh * 0.6, hw, hh * 0.1, hw, -hh * 0.35);
    ctx.bezierCurveTo(hw, -hh * 0.85, hw * 0.5, -hh, 0, -hh * 0.5);
    ctx.bezierCurveTo(-hw * 0.5, -hh, -hw, -hh * 0.85, -hw, -hh * 0.35);
    ctx.bezierCurveTo(-hw, hh * 0.1, -hw * 0.3, hh * 0.6, 0, hh);
    ctx.closePath();
    ctx.restore();
    return;
  }
  // Default: pentagon
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.95, -r * 0.2);
  ctx.lineTo(r * 0.95, r * 0.8);
  ctx.lineTo(-r * 0.95, r * 0.8);
  ctx.lineTo(-r * 0.95, -r * 0.2);
  ctx.closePath();
  ctx.restore();
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
