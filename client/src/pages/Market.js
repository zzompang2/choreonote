import { navigate } from '../utils/router.js';
import { t } from '../utils/i18n.js';
import { showToast } from '../utils/toast.js';
import { renderFormationThumbnail } from '../utils/thumbnail.js';
import { fetchPresets, uploadPreset, incrementDownload, deletePreset, buildPresetData } from '../utils/market.js';
import { getCurrentUser, requireAuth, signOut } from '../utils/auth.js';
import { NoteStore } from '../store/NoteStore.js';

const PAGE_SIZE = 20;

// 인원수 필터 정의
const DANCER_FILTERS = [
  { label: () => t('marketFilterAll'), min: null, max: null },
  { label: () => t('marketFilter2to4'), min: 2, max: 4 },
  { label: () => t('marketFilter5to8'), min: 5, max: 8 },
  { label: () => t('marketFilter9plus'), min: 9, max: null },
];

export async function renderMarket(container) {
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'market';
  container.appendChild(div);

  let currentPage = 0;
  let sortBy = 'created_at';
  let filterIndex = 0;
  let currentUser = await getCurrentUser();

  async function loadAndRender() {
    const filter = DANCER_FILTERS[filterIndex];
    const result = await fetchPresets({
      page: currentPage,
      sortBy,
      dancerCountMin: filter.min,
      dancerCountMax: filter.max,
    });
    renderPage(result);
  }

  function renderPage({ data, totalCount, hasMore }) {
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    div.innerHTML = `
      <div class="market__header">
        <div style="display:flex;align-items:center;gap:12px">
          <button class="btn btn--ghost btn--sm" id="market-back">${t('marketBack')}</button>
          <h1 class="market__title">${t('market')}</h1>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn--primary btn--sm" id="market-upload-btn">${t('marketUpload')}</button>
          ${currentUser
            ? `<button class="btn btn--ghost btn--sm" id="market-logout-btn" title="${t('marketLogout')}">${currentUser.email?.split('@')[0] || '?'}</button>`
            : ''}
        </div>
      </div>

      <div class="market__filters">
        <div class="market__filter-group">
          ${DANCER_FILTERS.map((f, i) => `
            <button class="market__filter-chip${i === filterIndex ? ' market__filter-chip--active' : ''}" data-filter="${i}">${f.label()}</button>
          `).join('')}
        </div>
        <select class="market__sort" id="market-sort">
          <option value="created_at"${sortBy === 'created_at' ? ' selected' : ''}>${t('marketSortNewest')}</option>
          <option value="download_count"${sortBy === 'download_count' ? ' selected' : ''}>${t('marketSortPopular')}</option>
        </select>
      </div>

      <div class="market__body">
        ${data.length === 0
          ? `<div class="market__empty">
              <div class="market__empty-icon">🎭</div>
              <p>${t('marketEmpty')}</p>
              <p class="market__empty-sub">${t('marketEmptyDesc')}</p>
            </div>`
          : `<div class="market__grid">${data.map(preset => renderCard(preset)).join('')}</div>`
        }
      </div>

      ${totalCount > PAGE_SIZE ? `
        <div class="market__pagination">
          <button class="btn btn--ghost btn--sm" id="market-prev" ${currentPage === 0 ? 'disabled' : ''}>${t('marketPrev')}</button>
          <span class="market__page-info">${t('marketPage', { current: currentPage + 1, total: totalPages })}</span>
          <button class="btn btn--ghost btn--sm" id="market-next" ${!hasMore ? 'disabled' : ''}>${t('marketNext')}</button>
        </div>
      ` : ''}
    `;

    // 이벤트 바인딩
    div.querySelector('#market-back').addEventListener('click', () => navigate('/dashboard'));

    div.querySelector('#market-upload-btn').addEventListener('click', () => openUploadModal());

    const logoutBtn = div.querySelector('#market-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await signOut();
        currentUser = null;
        loadAndRender();
      });
    }

    div.querySelector('#market-sort').addEventListener('change', (e) => {
      sortBy = e.target.value;
      currentPage = 0;
      loadAndRender();
    });

    div.querySelectorAll('.market__filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        filterIndex = Number(btn.dataset.filter);
        currentPage = 0;
        loadAndRender();
      });
    });

    const prevBtn = div.querySelector('#market-prev');
    const nextBtn = div.querySelector('#market-next');
    if (prevBtn) prevBtn.addEventListener('click', () => { currentPage--; loadAndRender(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; loadAndRender(); });

    // 카드 클릭 → 상세 모달
    div.querySelectorAll('.market-card').forEach(card => {
      card.addEventListener('click', () => {
        const preset = data.find(p => p.id === card.dataset.id);
        if (preset) openDetailModal(preset);
      });
    });

    // 캔버스 썸네일 렌더링
    for (const preset of data) {
      const canvas = div.querySelector(`canvas[data-preset-thumb="${preset.id}"]`);
      renderPresetThumbnail(canvas, preset.preset_data);
    }
  }

  function renderCard(preset) {
    const isOwner = currentUser && preset.user_id === currentUser.id;
    return `
      <div class="market-card" data-id="${preset.id}">
        ${isOwner ? `<button class="market-card__delete" data-delete="${preset.id}" title="${t('delete')}">✕</button>` : ''}
        <div class="market-card__thumbnail">
          <canvas data-preset-thumb="${preset.id}" width="200" height="134"></canvas>
        </div>
        <div class="market-card__title">${escapeHtml(preset.title)}</div>
        <div class="market-card__meta">
          ${t('marketDancerCount', { count: preset.dancer_count })} · ${t('marketFormationCount', { count: preset.formation_count })} · ${t('marketDownloadCount', { count: preset.download_count || 0 })}
        </div>
      </div>
    `;
  }

  // --- 상세 모달 ---
  function openDetailModal(preset) {
    const pd = preset.preset_data;
    const overlay = document.createElement('div');
    overlay.className = 'market-modal';

    overlay.innerHTML = `
      <div class="market-modal__box market-modal__box--detail">
        <div class="market-modal__header">
          <h2>${escapeHtml(preset.title)}</h2>
          <button class="market-modal__close">✕</button>
        </div>
        ${preset.description ? `<p class="market-modal__desc">${escapeHtml(preset.description)}</p>` : ''}
        <div class="market-modal__meta">
          ${t('marketDancerCount', { count: preset.dancer_count })} · ${t('marketFormationCount', { count: preset.formation_count })} · ${t('marketDownloadCount', { count: preset.download_count || 0 })}
        </div>
        <div class="market-modal__previews">
          ${pd.formations.map((_, i) => `<canvas data-detail-thumb="${i}" width="160" height="107"></canvas>`).join('')}
        </div>
        <div class="market-modal__actions">
          <button class="btn btn--primary" id="modal-import-btn">${t('marketImportAsNote')}</button>
          <button class="btn btn--ghost" id="modal-cancel-btn">${t('cancel')}</button>
        </div>
      </div>
    `;

    const close = () => overlay.remove();

    overlay.querySelector('.market-modal__close').addEventListener('click', close);
    overlay.querySelector('#modal-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#modal-import-btn').addEventListener('click', async () => {
      const user = await requireAuth('/market');
      if (!user) return;

      try {
        const jsonStr = JSON.stringify(pd);
        const noteId = await NoteStore.importJSON(jsonStr);
        incrementDownload(preset.id);
        close();
        showToast(t('marketImportSuccess'));
        navigate(`/edit/${noteId}`);
      } catch (err) {
        showToast(err.message);
      }
    });

    document.body.appendChild(overlay);

    // 각 대형 미리보기 렌더링
    const dancers = pd.dancers.map((d, i) => ({ id: i, name: d.name, color: d.color }));
    pd.formations.forEach((f, i) => {
      const canvas = overlay.querySelector(`canvas[data-detail-thumb="${i}"]`);
      const positions = f.positions.map(p => ({
        dancerId: p.dancerIndex,
        x: p.x, y: p.y, angle: p.angle || 0,
      }));
      renderFormationThumbnail(canvas, {
        dancers, positions,
        stageWidth: pd.note.stageWidth || 600,
        stageHeight: pd.note.stageHeight || 400,
        dancerShape: pd.note.dancerShape || 'pentagon',
        dancerScale: pd.note.dancerScale || 1.0,
        showWings: pd.note.showWings || false,
      });
    });
  }

  // --- 업로드 모달 ---
  async function openUploadModal() {
    const user = await requireAuth('/market');
    if (!user) return;
    currentUser = user;

    const notes = await NoteStore.getAllNotes();
    if (notes.length === 0) {
      showToast(t('marketEmpty'));
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'market-modal';

    let step = 1; // 1: 노트 선택, 2: 대형 선택 + 정보 입력
    let selectedNoteId = null;
    let noteData = null;

    function renderStep1() {
      overlay.innerHTML = `
        <div class="market-modal__box">
          <div class="market-modal__header">
            <h2>${t('marketUploadTitle')}</h2>
            <button class="market-modal__close">✕</button>
          </div>
          <h3 class="market-modal__subtitle">${t('marketSelectNote')}</h3>
          <div class="market-upload__note-list">
            ${notes.map(n => `
              <div class="market-upload__note-item" data-note-id="${n.id}">
                <canvas data-upload-thumb="${n.id}" width="120" height="80"></canvas>
                <div>
                  <div class="market-upload__note-title">${escapeHtml(n.title)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      overlay.querySelector('.market-modal__close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      // 노트 썸네일
      for (const n of notes) {
        const canvas = overlay.querySelector(`canvas[data-upload-thumb="${n.id}"]`);
        NoteStore.getThumbnailData(n.id).then(data => {
          if (data) renderFormationThumbnail(canvas, data);
        });
      }

      // 노트 선택
      overlay.querySelectorAll('.market-upload__note-item').forEach(item => {
        item.addEventListener('click', async () => {
          selectedNoteId = Number(item.dataset.noteId);
          noteData = await NoteStore.loadNote(selectedNoteId);
          step = 2;
          renderStep2();
        });
      });
    }

    function renderStep2() {
      const formations = noteData.formations.sort((a, b) => a.order - b.order);
      const dancers = noteData.dancers;

      overlay.innerHTML = `
        <div class="market-modal__box">
          <div class="market-modal__header">
            <h2>${t('marketUploadTitle')}</h2>
            <button class="market-modal__close">✕</button>
          </div>

          <h3 class="market-modal__subtitle">${t('marketSelectFormations')}</h3>
          <div class="market-upload__formation-list">
            ${formations.map((f, i) => `
              <label class="market-upload__formation-item">
                <input type="checkbox" value="${f.id}" checked />
                <canvas data-formation-thumb="${f.id}" width="100" height="67"></canvas>
                <span>${i + 1}</span>
              </label>
            `).join('')}
          </div>

          <div class="market-upload__form">
            <label class="market-upload__label">
              ${t('marketPresetTitle')}
              <input type="text" id="upload-title" class="market-upload__input" value="${escapeHtml(noteData.note.title)}" />
            </label>
            <label class="market-upload__label">
              ${t('marketPresetDesc')}
              <textarea id="upload-desc" class="market-upload__input market-upload__textarea" rows="2"></textarea>
            </label>
          </div>

          <div class="market-modal__actions">
            <button class="btn btn--primary" id="upload-submit-btn">${t('marketUpload')}</button>
            <button class="btn btn--ghost" id="upload-cancel-btn">${t('cancel')}</button>
          </div>
        </div>
      `;

      overlay.querySelector('.market-modal__close').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#upload-cancel-btn').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      // 대형 썸네일
      for (const f of formations) {
        const canvas = overlay.querySelector(`canvas[data-formation-thumb="${f.id}"]`);
        const positions = f.positions.map(p => ({
          dancerId: p.dancerId,
          x: p.x, y: p.y, angle: p.angle || 0,
        }));
        renderFormationThumbnail(canvas, {
          dancers,
          positions,
          stageWidth: noteData.note.stageWidth || 600,
          stageHeight: noteData.note.stageHeight || 400,
          dancerShape: noteData.note.dancerShape || 'pentagon',
          dancerScale: noteData.note.dancerScale || 1.0,
          showWings: noteData.note.showWings || false,
        });
      }

      // 업로드 실행
      overlay.querySelector('#upload-submit-btn').addEventListener('click', async () => {
        const checked = overlay.querySelectorAll('.market-upload__formation-list input:checked');
        const selectedIds = Array.from(checked).map(c => Number(c.value));

        if (selectedIds.length === 0) {
          showToast(t('marketSelectFormations'));
          return;
        }

        const title = overlay.querySelector('#upload-title').value.trim();
        if (!title) {
          overlay.querySelector('#upload-title').focus();
          return;
        }

        const description = overlay.querySelector('#upload-desc').value.trim();

        try {
          const presetData = buildPresetData(noteData, selectedIds);
          await uploadPreset({ title, description, presetData });
          overlay.remove();
          showToast(t('marketUploadSuccess'));
          currentPage = 0;
          sortBy = 'created_at';
          loadAndRender();
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    document.body.appendChild(overlay);
    renderStep1();
  }

  // 본인 프리셋 삭제 이벤트 (이벤트 위임)
  div.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.market-card__delete');
    if (!deleteBtn) return;
    e.stopPropagation();
    if (!confirm(t('marketDeleteConfirm'))) return;
    try {
      await deletePreset(deleteBtn.dataset.delete);
      loadAndRender();
    } catch (err) {
      showToast(err.message);
    }
  });

  // 초기 로드
  await loadAndRender();
}

// --- 유틸 ---

function renderPresetThumbnail(canvas, presetData) {
  if (!canvas || !presetData) return;
  const pd = presetData;
  const firstFormation = pd.formations[0];
  if (!firstFormation) return;

  const dancers = pd.dancers.map((d, i) => ({ id: i, name: d.name, color: d.color }));
  const positions = firstFormation.positions.map(p => ({
    dancerId: p.dancerIndex,
    x: p.x, y: p.y, angle: p.angle || 0,
  }));

  renderFormationThumbnail(canvas, {
    dancers, positions,
    stageWidth: pd.note.stageWidth || 600,
    stageHeight: pd.note.stageHeight || 400,
    dancerShape: pd.note.dancerShape || 'pentagon',
    dancerScale: pd.note.dancerScale || 1.0,
    showWings: pd.note.showWings || false,
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
