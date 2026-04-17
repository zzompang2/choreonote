import { navigate } from '../utils/router.js';
import { t } from '../utils/i18n.js';
import { showToast } from '../utils/toast.js';
import { renderFormationThumbnail } from '../utils/thumbnail.js';
import { fetchPresets, uploadPreset, deletePreset, buildPresetData } from '../utils/market.js';
import { fetchBasket } from '../utils/basket.js';
import { getCurrentUser, requireAuth } from '../utils/auth.js';
import { NoteStore } from '../store/NoteStore.js';
import { renderAppLayout } from '../components/AppLayout.js';
import { openPresetDetailModal } from '../components/PresetDetailModal.js';

const GALLERY_TAB_KEY = 'choreonote-gallery-tab';

const PAGE_SIZE = 20;

// 느낌 태그 정의
const MOOD_TAGS = [
  'sharp', 'soft', 'symmetric', 'dynamic',
  'grand', 'dense', 'scatter', 'cute',
];

// 제목 예시 문구
const TITLE_EXAMPLES = [
  'marketTitleEx1', 'marketTitleEx2', 'marketTitleEx3',
  'marketTitleEx4', 'marketTitleEx5', 'marketTitleEx6',
  'marketTitleEx7', 'marketTitleEx8',
];

// 인원수 필터 정의
const DANCER_FILTERS = [
  { label: () => t('marketFilterAll'), selectLabel: () => t('marketFilterAll'), min: null, max: null },
  { label: () => '2', selectLabel: () => t('marketDancerCount', { count: 2 }), min: 2, max: 2 },
  { label: () => '3', selectLabel: () => t('marketDancerCount', { count: 3 }), min: 3, max: 3 },
  { label: () => '4', selectLabel: () => t('marketDancerCount', { count: 4 }), min: 4, max: 4 },
  { label: () => '5', selectLabel: () => t('marketDancerCount', { count: 5 }), min: 5, max: 5 },
  { label: () => '6', selectLabel: () => t('marketDancerCount', { count: 6 }), min: 6, max: 6 },
  { label: () => '7', selectLabel: () => t('marketDancerCount', { count: 7 }), min: 7, max: 7 },
  { label: () => '8', selectLabel: () => t('marketDancerCount', { count: 8 }), min: 8, max: 8 },
  { label: () => t('marketFilter9plus'), selectLabel: () => t('marketFilter9plus'), min: 9, max: null },
];

export async function renderMarket(container) {
  let div;
  await renderAppLayout(container, {
    active: 'market',
    renderContent: async (content) => {
      content.innerHTML = '';
      div = document.createElement('div');
      div.className = 'market';
      content.appendChild(div);
    },
  });

  let currentPage = 0;
  let sortBy = 'created_at';
  let filterIndex = 0;
  let viewAudience = 'bottom';
  let filterTags = []; // 선택된 느낌 태그
  let currentUser = await getCurrentUser();
  let currentTab = localStorage.getItem(GALLERY_TAB_KEY) === 'collection' ? 'collection' : 'all';

  function tabsHTML() {
    return `
      <div class="market__tabs">
        <button class="market__tab${currentTab === 'all' ? ' market__tab--active' : ''}" data-tab="all">${t('marketTabAll')}</button>
        <button class="market__tab${currentTab === 'collection' ? ' market__tab--active' : ''}" data-tab="collection">${t('basketTitle')}</button>
      </div>
    `;
  }

  function bindTabHandlers() {
    div.querySelectorAll('.market__tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.tab;
        if (next === currentTab) return;
        currentTab = next;
        localStorage.setItem(GALLERY_TAB_KEY, currentTab);
        renderActiveTab();
      });
    });
  }

  function renderActiveTab() {
    if (currentTab === 'all') loadAndRender();
    else renderCollectionTab();
  }

  // 필터 마크업 (전체/컬렉션 탭 공유). withSort=true면 정렬 select 포함.
  function filtersHTML({ withSort }) {
    return `
      <div class="market__filters">
        <div class="market__filter-row">
          <div class="market__filter-left">
            <div class="market__filter-group market__dancer-chips">
              ${DANCER_FILTERS.map((f, i) => `
                <button class="market__filter-chip${i === filterIndex ? ' market__filter-chip--active' : ''}" data-filter="${i}">${f.label()}</button>
              `).join('')}
            </div>
            <select class="market__dancer-select" id="market-dancer-select">
              ${DANCER_FILTERS.map((f, i) => `
                <option value="${i}"${i === filterIndex ? ' selected' : ''}>${f.selectLabel()}</option>
              `).join('')}
            </select>
            <button class="market__tag-filter-btn" id="market-tag-filter-btn">
              ${t('marketTagFilterBtn')}${filterTags.length > 0 ? ` (${filterTags.length})` : ''}
            </button>
          </div>
          <div class="market__filter-right">
            ${withSort ? `<select class="market__sort" id="market-sort">
              <option value="created_at"${sortBy === 'created_at' ? ' selected' : ''}>${t('marketSortNewest')}</option>
              <option value="download_count"${sortBy === 'download_count' ? ' selected' : ''}>${t('marketSortPopular')}</option>
            </select>` : ''}
            <button class="market__audience-btn" id="market-audience" title="${t('marketAudienceToggle')}">
              ${viewAudience === 'top' ? t('marketAudienceTop') : t('marketAudienceBottom')}
            </button>
          </div>
        </div>
        <div class="market__filter-group market__tag-filters">
          ${MOOD_TAGS.map(tag => `
            <button class="market__filter-chip${filterTags.includes(tag) ? ' market__filter-chip--active' : ''}" data-tag="${tag}">${t('marketTag_' + tag)}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 필터 핸들러 바인딩. onChange는 변경 직후 reload 트리거.
  function bindFiltersHandlers({ withSort, onChange }) {
    div.querySelector('#market-audience').addEventListener('click', () => {
      viewAudience = viewAudience === 'bottom' ? 'top' : 'bottom';
      onChange();
    });

    if (withSort) {
      div.querySelector('#market-sort').addEventListener('change', (e) => {
        sortBy = e.target.value;
        currentPage = 0;
        onChange();
      });
    }

    div.querySelectorAll('.market__filter-chip[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        filterIndex = Number(btn.dataset.filter);
        currentPage = 0;
        onChange();
      });
    });

    div.querySelector('#market-dancer-select').addEventListener('change', (e) => {
      filterIndex = Number(e.target.value);
      currentPage = 0;
      onChange();
    });

    div.querySelectorAll('.market__filter-chip[data-tag]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        const idx = filterTags.indexOf(tag);
        if (idx >= 0) filterTags.splice(idx, 1);
        else filterTags.push(tag);
        currentPage = 0;
        onChange();
      });
    });

    div.querySelector('#market-tag-filter-btn').addEventListener('click', () => openTagFilterModal());
  }

  async function renderCollectionTab() {
    const user = await getCurrentUser();
    currentUser = user;

    if (!user) {
      div.innerHTML = `
        <div class="market__header">
          ${tabsHTML()}
        </div>
        <div class="market__body">
          <div class="market__empty">
            <div class="market__empty-icon">🔒</div>
            <p>${t('collectionLoginRequired')}</p>
            <button class="btn btn--primary" id="collection-login-btn" style="margin-top:12px">${t('collectionLogin')}</button>
          </div>
        </div>
      `;
      bindTabHandlers();
      div.querySelector('#collection-login-btn').addEventListener('click', async () => {
        await requireAuth('/market');
      });
      return;
    }

    div.innerHTML = `
      <div class="market__header">${tabsHTML()}</div>
      ${filtersHTML({ withSort: false })}
      <div class="market__body"><div class="empty-state empty-state--subtle"><p>...</p></div></div>
    `;
    bindTabHandlers();
    bindFiltersHandlers({ withSort: false, onChange: () => renderCollectionTab() });

    let items;
    try {
      items = await fetchBasket();
    } catch (err) {
      div.querySelector('.market__body').innerHTML = `<div class="market__empty"><p>${err.message}</p></div>`;
      return;
    }

    // 클라이언트 필터링: 인원수 + 느낌 태그
    const filter = DANCER_FILTERS[filterIndex];
    const filtered = items.filter(item => {
      const dc = item.preset.dancer_count;
      if (filter.min != null && dc < filter.min) return false;
      if (filter.max != null && dc > filter.max) return false;
      const tags = item.preset.preset_data?.tags || [];
      for (const tag of filterTags) {
        if (!tags.includes(tag)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      const isFilterActive = filterIndex !== 0 || filterTags.length > 0;
      const emptyText = items.length === 0 ? t('basketEmpty') : t('marketEmpty');
      div.querySelector('.market__body').innerHTML = `
        <div class="market__empty">
          <div class="market__empty-icon">${items.length === 0 ? '✨' : '🔍'}</div>
          <p>${emptyText}</p>
          ${items.length === 0 ? `<button class="btn btn--primary" id="collection-empty-btn" style="margin-top:12px">${t('marketTabAll')}</button>` : ''}
        </div>
      `;
      const goAll = div.querySelector('#collection-empty-btn');
      if (goAll) goAll.addEventListener('click', () => {
        currentTab = 'all';
        localStorage.setItem(GALLERY_TAB_KEY, currentTab);
        renderActiveTab();
      });
      return;
    }

    const body = div.querySelector('.market__body');
    body.innerHTML = `<div class="collection-grid"></div>`;
    const grid = body.querySelector('.collection-grid');

    for (const item of filtered) {
      const pd = item.preset.preset_data;
      const card = document.createElement('div');
      card.className = 'collection-card';
      card.innerHTML = `
        <div class="collection-card__thumbnail">
          <canvas data-c-thumb="${item.preset.id}" width="200" height="134"></canvas>
        </div>
        <div class="collection-card__body">
          <div class="collection-card__title">${escapeHtml(item.preset.title)}</div>
          <div class="collection-card__meta">
            ${t('marketDancerCount', { count: item.preset.dancer_count })} · ${t('marketFormationCount', { count: Math.min(2, pd.formations.length) })}
          </div>
        </div>
      `;

      const cvs = card.querySelector(`canvas[data-c-thumb="${item.preset.id}"]`);
      renderPresetThumbnail(cvs, pd, viewAudience);

      card.addEventListener('click', () => {
        openPresetDetailModal({
          preset: item.preset,
          viewAudience,
          mode: 'basket',
          authRedirect: '/market',
          onAction: () => renderCollectionTab(),
        });
      });

      grid.appendChild(card);
    }
  }

  async function loadAndRender() {
    const filter = DANCER_FILTERS[filterIndex];
    const result = await fetchPresets({
      page: currentPage,
      sortBy,
      dancerCountMin: filter.min,
      dancerCountMax: filter.max,
      tags: filterTags,
    });
    renderPage(result);
  }

  function renderPage({ data, totalCount, hasMore }) {
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    div.innerHTML = `
      <div class="market__header">
        ${tabsHTML()}
        <button class="btn btn--primary btn--sm" id="market-upload-btn">${t('marketUpload')}</button>
      </div>

      ${filtersHTML({ withSort: true })}

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
    bindTabHandlers();
    bindFiltersHandlers({ withSort: true, onChange: () => loadAndRender() });
    div.querySelector('#market-upload-btn').addEventListener('click', () => openUploadModal());

    const prevBtn = div.querySelector('#market-prev');
    const nextBtn = div.querySelector('#market-next');
    if (prevBtn) prevBtn.addEventListener('click', () => { currentPage--; loadAndRender(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; loadAndRender(); });

    // 카드 클릭 → 상세 모달
    div.querySelectorAll('.market-card').forEach(card => {
      card.addEventListener('click', () => {
        const preset = data.find(p => p.id === card.dataset.id);
        if (preset) openPresetDetailModal({ preset, viewAudience, mode: 'market', authRedirect: '/market' });
      });
    });

    // 캔버스 썸네일 렌더링
    for (const preset of data) {
      const canvas = div.querySelector(`canvas[data-preset-thumb="${preset.id}"]`);
      renderPresetThumbnail(canvas, preset.preset_data, viewAudience);
    }
  }

  function renderCard(preset) {
    const isOwner = currentUser && preset.user_id === currentUser.id;
    const tags = preset.preset_data?.tags || [];
    return `
      <div class="market-card" data-id="${preset.id}">
        ${isOwner ? `<button class="market-card__delete" data-delete="${preset.id}" title="${t('delete')}">✕</button>` : ''}
        <div class="market-card__thumbnail">
          <canvas data-preset-thumb="${preset.id}" width="200" height="134"></canvas>
        </div>
        <div class="market-card__title">${escapeHtml(preset.title)}</div>
        ${tags.length > 0 ? `<div class="market-card__tags">${tags.map(tag => `<span class="market-card__tag">${t('marketTag_' + tag)}</span>`).join('')}</div>` : ''}
        <div class="market-card__meta">
          ${t('marketDancerCount', { count: preset.dancer_count })} · ${t('marketFormationCount', { count: preset.formation_count })} · ${t('marketDownloadCount', { count: preset.download_count || 0 })}
        </div>
      </div>
    `;
  }

  // --- 태그 필터 모달 (모바일) ---
  function openTagFilterModal() {
    const overlay = document.createElement('div');
    overlay.className = 'market-modal';
    overlay.innerHTML = `
      <div class="market-modal__box market-modal__box--tag-filter">
        <div class="market-modal__top">
          <div class="market-modal__header">
            <h2>${t('marketMoodTags')}</h2>
            <button class="market-modal__close">✕</button>
          </div>
        </div>
        <div class="market-modal__body">
          <div class="market-upload__tags">
            ${MOOD_TAGS.map(tag => `
              <button type="button" class="market-upload__tag-chip${filterTags.includes(tag) ? ' market-upload__tag-chip--active' : ''}" data-tag="${tag}">${t('marketTag_' + tag)}</button>
            `).join('')}
          </div>
        </div>
        <div class="market-modal__bottom">
          <div class="market-modal__actions">
            <button class="btn btn--ghost" id="tag-filter-clear">${t('marketTagFilterClear')}</button>
            <button class="btn btn--primary" id="tag-filter-apply">${t('marketTagFilterApply')}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.market-modal__close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelectorAll('.market-upload__tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('market-upload__tag-chip--active');
      });
    });

    overlay.querySelector('#tag-filter-clear').addEventListener('click', () => {
      overlay.querySelectorAll('.market-upload__tag-chip').forEach(c =>
        c.classList.remove('market-upload__tag-chip--active'));
    });

    overlay.querySelector('#tag-filter-apply').addEventListener('click', () => {
      filterTags = Array.from(overlay.querySelectorAll('.market-upload__tag-chip--active'))
        .map(c => c.dataset.tag);
      currentPage = 0;
      close();
      renderActiveTab();
    });
  }


  function formatTime(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
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

    let step = 1; // 1: 노트 선택, 2: 대형 선택, 3: 정보 입력
    let selectedNoteId = null;
    let noteData = null;
    let selectedFormations = []; // 스텝2에서 선택된 대형 배열

    function renderStep1() {
      overlay.innerHTML = `
        <div class="market-modal__box">
          <div class="market-modal__top">
            <div class="market-modal__header">
              <h2>${t('marketUploadTitle')}</h2>
              <button class="market-modal__close">✕</button>
            </div>
            <div class="market-modal__step-indicator">
              <span class="market-modal__step market-modal__step--active">1</span>
              <span class="market-modal__step">2</span>
              <span class="market-modal__step">3</span>
            </div>
            <h3 class="market-modal__subtitle">${t('marketSelectNote')}</h3>
          </div>
          <div class="market-modal__body">
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

    const MAX_UPLOAD_FORMATIONS = 5;

    // --- 스텝 2: 대형 선택 (그리드 갤러리) ---
    function renderStep2() {
      const formations = noteData.formations.sort((a, b) => a.order - b.order);
      const dancers = noteData.dancers;

      let rangeStart = null;
      let rangeEnd = null;

      function getSelectedRange() {
        if (rangeStart === null) return [];
        const lo = Math.min(rangeStart, rangeEnd ?? rangeStart);
        const hi = Math.max(rangeStart, rangeEnd ?? rangeStart);
        return formations.slice(lo, hi + 1);
      }

      function updateSelectionUI(hoverIdx) {
        const items = overlay.querySelectorAll('.market-upload__formation-item');
        const lo = rangeStart !== null ? Math.min(rangeStart, rangeEnd ?? rangeStart) : -1;
        const hi = rangeStart !== null ? Math.max(rangeStart, rangeEnd ?? rangeStart) : -1;
        const previewLo = (hoverIdx != null && rangeEnd === null && rangeStart !== null)
          ? Math.min(rangeStart, hoverIdx) : lo;
        const previewHi = (hoverIdx != null && rangeEnd === null && rangeStart !== null)
          ? Math.max(rangeStart, hoverIdx) : hi;
        const isPreview = hoverIdx != null && rangeEnd === null && hoverIdx !== rangeStart;
        const overMax = isPreview && (previewHi - previewLo + 1 > MAX_UPLOAD_FORMATIONS);

        items.forEach((item, i) => {
          const inConfirmed = i >= lo && i <= hi;
          const inPreview = i >= previewLo && i <= previewHi;
          item.classList.toggle('market-upload__formation-item--selected', isPreview ? (inPreview && !overMax) : inConfirmed);
          item.classList.toggle('market-upload__formation-item--preview', isPreview && inPreview && !overMax);
          item.classList.toggle('market-upload__formation-item--over-max', isPreview && inPreview && overMax);
          const badge = item.querySelector('.market-upload__badge');
          if (badge) {
            const effLo = isPreview ? previewLo : lo;
            const effHi = isPreview ? previewHi : hi;
            const inEff = i >= effLo && i <= effHi;
            if (!inEff || (isPreview && overMax)) {
              badge.textContent = '';
              badge.style.display = 'none';
            } else if (effLo === effHi) {
              badge.textContent = '✓';
              badge.style.display = '';
            } else if (i === effLo) {
              badge.textContent = t('marketBadgeStart');
              badge.style.display = '';
            } else if (i === effHi) {
              badge.textContent = t('marketBadgeEnd');
              badge.style.display = '';
            } else {
              badge.textContent = '';
              badge.style.display = 'none';
            }
          }
        });

        const selected = getSelectedRange();
        const countEl = overlay.querySelector('.market-upload__selection-count');
        if (countEl) {
          countEl.textContent = selected.length > 0
            ? t('marketSelectionCount', { count: selected.length, max: MAX_UPLOAD_FORMATIONS })
            : '';
        }
        // 다음 버튼 활성화
        const nextBtn = overlay.querySelector('#step2-next-btn');
        if (nextBtn) nextBtn.disabled = selected.length === 0;
      }

      overlay.innerHTML = `
        <div class="market-modal__box">
          <div class="market-modal__top">
            <div class="market-modal__header">
              <h2>${t('marketUploadTitle')}</h2>
              <button class="market-modal__close">✕</button>
            </div>
            <div class="market-modal__step-indicator">
              <span class="market-modal__step">1</span>
              <span class="market-modal__step market-modal__step--active">2</span>
              <span class="market-modal__step">3</span>
            </div>
            <h3 class="market-modal__subtitle">${t('marketSelectFormations')}</h3>
            <p class="market-upload__hint">${t('marketSelectHint', { max: MAX_UPLOAD_FORMATIONS })}</p>
          </div>
          <div class="market-modal__body">
            <div class="market-upload__gallery">
              ${formations.map((f, i) => `
                <div class="market-upload__formation-item" data-idx="${i}">
                  <span class="market-upload__badge" style="display:none"></span>
                  <canvas data-formation-thumb="${f.id}" width="140" height="94"></canvas>
                  <span>${i + 1}</span>
                </div>
              `).join('')}
            </div>
            <div class="market-upload__selection-count"></div>
          </div>
          <div class="market-modal__bottom">
            <div class="market-modal__actions market-modal__actions--between">
              <button class="btn btn--ghost" id="step2-back-btn">${t('marketPrev')}</button>
              <button class="btn btn--primary" id="step2-next-btn" disabled>${t('marketNext')}</button>
            </div>
          </div>
        </div>
      `;

      overlay.querySelector('.market-modal__close').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#step2-back-btn').addEventListener('click', () => renderStep1());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      overlay.querySelector('#step2-next-btn').addEventListener('click', () => {
        selectedFormations = getSelectedRange();
        step = 3;
        renderStep3();
      });

      // 대형 클릭 → 범위 선택
      overlay.querySelectorAll('.market-upload__formation-item').forEach(item => {
        item.addEventListener('click', () => {
          const idx = Number(item.dataset.idx);
          if (rangeStart === null) {
            rangeStart = idx;
            rangeEnd = null;
          } else if (rangeEnd === null && idx === rangeStart) {
            rangeStart = null;
            rangeEnd = null;
          } else if (rangeEnd === null) {
            const lo = Math.min(rangeStart, idx);
            const hi = Math.max(rangeStart, idx);
            if (hi - lo + 1 > MAX_UPLOAD_FORMATIONS) {
              showToast(t('marketMaxFormations', { max: MAX_UPLOAD_FORMATIONS }));
              return;
            }
            rangeStart = lo;
            rangeEnd = hi;
          } else {
            rangeStart = idx;
            rangeEnd = null;
          }
          updateSelectionUI();
        });
        item.addEventListener('mouseenter', () => {
          if (rangeStart !== null && rangeEnd === null) {
            updateSelectionUI(Number(item.dataset.idx));
          }
        });
        item.addEventListener('mouseleave', () => {
          if (rangeStart !== null && rangeEnd === null) {
            updateSelectionUI();
          }
        });
      });

      // 대형 썸네일 렌더링
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
          showWings: false,
          hideOffstage: true,
        });
      }
    }

    // --- 스텝 3: 썸네일·제목·태그 ---
    function renderStep3() {
      const dancers = noteData.dancers;
      let thumbnailIdx = 0; // 대표 썸네일 인덱스 (selectedFormations 내)
      const selectedTags = new Set();

      // 인원수 자동 계산 (무대 위 댄서만)
      const halfW = (noteData.note.stageWidth || 600) / 2;
      const halfH = (noteData.note.stageHeight || 400) / 2;
      const onStageIds = new Set();
      for (const f of selectedFormations) {
        for (const p of f.positions) {
          if (Math.abs(p.x) <= halfW && Math.abs(p.y) <= halfH) onStageIds.add(p.dancerId);
        }
      }

      const placeholderTitle = t(TITLE_EXAMPLES[Math.floor(Math.random() * TITLE_EXAMPLES.length)]);

      overlay.innerHTML = `
        <div class="market-modal__box">
          <div class="market-modal__top">
            <div class="market-modal__header">
              <h2>${t('marketUploadTitle')}</h2>
              <button class="market-modal__close">✕</button>
            </div>
            <div class="market-modal__step-indicator">
              <span class="market-modal__step">1</span>
              <span class="market-modal__step">2</span>
              <span class="market-modal__step market-modal__step--active">3</span>
            </div>
          </div>
          <div class="market-modal__body">
            <h3 class="market-modal__subtitle">${t('marketSelectThumbnail')}</h3>
            <div class="market-upload__thumb-picker">
              ${selectedFormations.map((f, i) => `
                <div class="market-upload__thumb-option${i === 0 ? ' market-upload__thumb-option--active' : ''}" data-thumb-idx="${i}">
                  <canvas data-step3-thumb="${i}" width="100" height="67"></canvas>
                  ${selectedFormations.length > 1 ? `<span>${t('marketFormationN', { n: i + 1 })}</span>` : ''}
                </div>
              `).join('')}
            </div>

            <div class="market-upload__form">
              <label class="market-upload__label">
                ${t('marketPresetTitle')}
                <input type="text" id="upload-title" class="market-upload__input" placeholder="${escapeHtml(placeholderTitle)}" />
              </label>

              <div class="market-upload__label">
                ${t('marketMoodTags')}
                <div class="market-upload__tags">
                  ${MOOD_TAGS.map(tag => `
                    <button type="button" class="market-upload__tag-chip" data-tag="${tag}">${t('marketTag_' + tag)}</button>
                  `).join('')}
                </div>
              </div>

              <div class="market-upload__info-row">
                <span class="market-upload__info-label">${t('marketDancerCount', { count: onStageIds.size })}</span>
                <span class="market-upload__info-label">${t('marketFormationCount', { count: selectedFormations.length })}</span>
              </div>
            </div>
          </div>
          <div class="market-modal__bottom">
            <div class="market-modal__actions market-modal__actions--between">
              <button class="btn btn--ghost" id="step3-back-btn">${t('marketPrev')}</button>
              <button class="btn btn--primary" id="step3-upload-btn">${t('marketUpload')}</button>
            </div>
          </div>
        </div>
      `;

      overlay.querySelector('.market-modal__close').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#step3-back-btn').addEventListener('click', () => { step = 2; renderStep2(); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      // 대표 썸네일 선택
      overlay.querySelectorAll('.market-upload__thumb-option').forEach(opt => {
        opt.addEventListener('click', () => {
          thumbnailIdx = Number(opt.dataset.thumbIdx);
          overlay.querySelectorAll('.market-upload__thumb-option').forEach(o =>
            o.classList.toggle('market-upload__thumb-option--active', o === opt));
        });
      });

      // 느낌 태그 토글
      overlay.querySelectorAll('.market-upload__tag-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const tag = chip.dataset.tag;
          if (selectedTags.has(tag)) {
            selectedTags.delete(tag);
            chip.classList.remove('market-upload__tag-chip--active');
          } else {
            selectedTags.add(tag);
            chip.classList.add('market-upload__tag-chip--active');
          }
        });
      });

      // 썸네일 렌더링
      selectedFormations.forEach((f, i) => {
        const canvas = overlay.querySelector(`canvas[data-step3-thumb="${i}"]`);
        if (!canvas) return;
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
          showWings: false,
          hideOffstage: true,
        });
      });

      // 업로드
      overlay.querySelector('#step3-upload-btn').addEventListener('click', async () => {
        if (selectedTags.size === 0) {
          showToast(t('marketTagRequired'));
          return;
        }

        const title = overlay.querySelector('#upload-title').value.trim();
        if (!title) {
          overlay.querySelector('#upload-title').focus();
          return;
        }

        try {
          const selectedIds = selectedFormations.map(f => f.id);
          const presetData = buildPresetData(noteData, selectedIds);
          presetData.tags = [...selectedTags];
          presetData.thumbnailIndex = thumbnailIdx;
          await uploadPreset({ title, presetData });
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

  // 초기 로드 (탭 상태에 따라)
  await renderActiveTab();
}

// --- 유틸 ---

function renderPresetThumbnail(canvas, presetData, targetAudience) {
  if (!canvas || !presetData) return;
  const pd = presetData;
  const thumbIdx = pd.thumbnailIndex || 0;
  const firstFormation = pd.formations[thumbIdx] || pd.formations[0];
  if (!firstFormation) return;

  const srcAudience = pd.note.audienceDirection || 'bottom';
  const flip = targetAudience && targetAudience !== srcAudience;

  const dancers = pd.dancers.map((d, i) => ({ id: i, name: d.name, color: d.color }));
  const positions = firstFormation.positions.map(p => ({
    dancerId: p.dancerIndex,
    x: flip ? -p.x : p.x,
    y: flip ? -p.y : p.y,
    angle: flip ? (p.angle || 0) + 180 : (p.angle || 0),
  }));

  renderFormationThumbnail(canvas, {
    dancers, positions,
    stageWidth: pd.note.stageWidth || 600,
    stageHeight: pd.note.stageHeight || 400,
    dancerShape: pd.note.dancerShape || 'pentagon',
    dancerScale: pd.note.dancerScale || 1.0,
    showWings: false,
    hideOffstage: true,
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
