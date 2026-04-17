import { NoteStore } from '../store/NoteStore.js';
import { db } from '../store/db.js';
import { StageRenderer } from '../renderer/StageRenderer.js';
import { PlaybackEngine } from '../engine/PlaybackEngine.js';
import { VideoExporter } from '../engine/VideoExporter.js';
import { navigate, setNavigationGuard, clearNavigationGuard } from '../utils/router.js';
import { showToast } from '../utils/toast.js';
import { pushState, replaceState, undo, redo, canUndo, canRedo, clearHistory } from '../utils/history.js';
import { getPresetNames, applyPreset, getCustomPresets, saveCustomPreset, deleteCustomPreset, matchNearest } from '../utils/formations.js';
import { toggleTheme, isLightMode } from '../utils/theme.js';
import {
  PIXEL_PER_SEC, TIMELINE_PADDING, TIME_UNIT, WING_SIZE,
  MIN_FORMATION_DURATION, DEFAULT_FORMATION_DURATION, PASTE_FORMATION_DURATION,
  formatTime, floorTime, clamp, roundToGrid, GRID_GAP, HALF_W, HALF_H,
  STAGE_WIDTH, STAGE_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT, setStageSize,
} from '../utils/constants.js';
import { t, getLang, setLang, getAvailableLangs } from '../utils/i18n.js';
import { buildHelpPanelHTML, initEmbeddedChat } from '../components/ChatBot.js';
import { generateShareURL } from '../utils/share.js';
import { uploadOnSave, checkServerNewer, resolveOverwriteServer, resolveUseServer, resolveKeepBoth } from '../utils/cloudSync.js';
import { getCurrentUser } from '../utils/auth.js';
import { showConflictModal } from '../components/ConflictModal.js';
import { fetchBasket, removeFromBasket } from '../utils/basket.js';
import { renderFormationThumbnail } from '../utils/thumbnail.js';

let engine = null;
let renderer = null;
let noteData = null;
let selectedFormation = 0;
let selectedFormations = new Set([0]); // multi-select set
let selectedTransition = null; // { fromIdx, toIdx } — selected gap between formations
let currentMs = 0;
let unsaved = false;
let _rotationInProgress = false;
let _snapshotDuringRotation = false;
let swapMode = false;
let setSwapMode = () => {};
let openPanel = () => {};
let activePanel = null;
let audienceDirection = 'top';
let pixelsPerSec = PIXEL_PER_SEC;
let _renderPresetThumbnails = null; // set by setupSidebar // mutable, for timeline zoom
let _renderBasket = null; // set by setupSidebar — re-fetch basket items
let _renderMarkerList = () => {};
let _updateToolbarState = () => {};
let copiedDancerPos = null;
let _focusedArea = 'timeline'; // 'stage' | 'timeline'
let fitStage = () => {};

function findFormationIdxAtTime(formations, ms) {
  if (!formations || !formations.length) return -1;
  for (let i = 0; i < formations.length; i++) {
    const f = formations[i];
    if (ms >= f.startTime && ms < f.startTime + f.duration) return i;
  }
  let lastIdx = 0;
  for (let i = 0; i < formations.length; i++) {
    if (formations[i].startTime <= ms) lastIdx = i;
  }
  return lastIdx;
}

// Onboarding & Feature unlock system
let _onboardingActive = false;
const ONBOARDING_KEY = 'choreonote-onboarding-done';
const UNLOCK_KEY = 'choreonote-unlocked-features';
const UNLOCK_ORDER = ['inspector', 'presets', 'markers'];
const UNLOCK_TOAST_KEYS = { inspector: 'unlockToastInspector', presets: 'unlockToastPresets', markers: 'unlockToastMarkers' };
const UNLOCK_DESC_KEYS = { inspector: 'unlockDescInspector', presets: 'unlockDescPresets', markers: 'unlockDescMarkers' };

function getUnlockedFeatures() {
  try { return JSON.parse(localStorage.getItem(UNLOCK_KEY)) || []; } catch { return []; }
}

function isAllUnlocked() {
  return getUnlockedFeatures().length >= UNLOCK_ORDER.length;
}

function isExistingUser() {
  // 온보딩 도입 전에 이미 사용 중이던 유저 (해금 키 없이 온보딩 완료 상태)
  return !!localStorage.getItem(ONBOARDING_KEY) && !localStorage.getItem(UNLOCK_KEY);
}

export async function renderEditor(container, noteId) {
  noteId = Number(noteId);
  noteData = await NoteStore.loadNote(noteId);
  if (!noteData) {
    showToast(t('noteNotFound'));
    navigate('/dashboard');
    return;
  }

  // Restore saved settings before building HTML / renderer
  setStageSize(noteData.note.stageWidth || 600, noteData.note.stageHeight || 400);
  audienceDirection = (noteData.note.audienceDirection === 'bottom') ? 'bottom' : 'top';

  container.innerHTML = buildEditorHTML(noteData);

  // Reset state
  currentMs = 0;
  const initFIdx = noteData.formations.findIndex(f => 0 >= f.startTime && 0 < f.startTime + f.duration);
  selectedFormation = initFIdx;
  selectedFormations = initFIdx >= 0 ? new Set([initFIdx]) : new Set();
  selectedTransition = null;

  // Init engine
  engine = new PlaybackEngine();
  engine.duration = noteData.note.duration;
  engine.setFormations(noteData.formations, noteData.dancers);

  if (noteData.musicBlob) {
    await engine.loadAudio(noteData.musicBlob);
  }

  // Init renderer
  const canvas = container.querySelector('#stage-canvas');
  renderer = new StageRenderer(canvas);

  // Restore saved view settings
  renderer.audienceDirection = audienceDirection;
  if (noteData.note.dancerShape) renderer.dancerShape = noteData.note.dancerShape;
  if (noteData.note.gridGap) renderer.gridGap = noteData.note.gridGap;
  if (noteData.note.dancerScale) renderer.dancerScale = noteData.note.dancerScale;
  if (noteData.note.showWings === true) renderer.showWings = true;
  // 댄서 표기 모드 복원 ('number'/'name'/'none'). 기본값은 'number'
  if (noteData.note.displayMode === 'name') { renderer.showNames = true; renderer.showNumbers = false; }
  else if (noteData.note.displayMode === 'none') { renderer.showNames = false; renderer.showNumbers = false; }
  else { renderer.showNames = false; renderer.showNumbers = true; }
  renderer.touchScale = window.innerWidth <= 768 ? 1.4 : 1.0;
  renderer._drawGridCache();

  // Fit canvas to available space (both width & height)
  fitStage = () => {
    const main = container.querySelector('.editor__main');
    if (!main) return;
    const pad = 20; // matches .editor__main padding
    const availW = main.clientWidth - pad * 2;
    const availH = main.clientHeight - pad * 2;
    // Fit based on the base canvas size (without 3D top padding)
    const baseRatio = CANVAS_WIDTH / CANVAS_HEIGHT;
    let w, h;
    if (availW / availH > baseRatio) {
      h = availH;
      w = h * baseRatio;
    } else {
      w = availW;
      h = w / baseRatio;
    }
    // Scale canvas including topPad, pull up so stage stays centered
    const topPad = renderer._3dTopPad || 0;
    const scale = w / CANVAS_WIDTH;
    const topPadCss = Math.round(topPad * scale);
    canvas.style.width = Math.floor(w) + 'px';
    canvas.style.height = Math.floor(h + topPadCss) + 'px';
    canvas.style.marginTop = topPad ? `-${topPadCss}px` : '';

    // Mobile adjustments
    const isMobile = window.innerWidth <= 768;
    renderer.touchScale = isMobile ? 1.4 : 1.0;

    // Set CSS var for mobile bottom sheet max-height (below rail)
    const rail = container.querySelector('.sidebar-rail');
    if (rail && isMobile) {
      const railBottom = rail.getBoundingClientRect().bottom;
      container.querySelector('.editor__sidebar')?.style.setProperty('--mobile-rail-top', `${railBottom}px`);
    }
  };

  // Wire callbacks
  setupPlayback(container);
  setupTimeline(container);
  setupSidebar(container);
  setupInspector(container);
  setupToolbar(container);
  setupHeader(container, noteId);
  setupSettings(container, noteId);
  setupMusicUpload(container, noteId);
  setupMarkers(container, noteId);
  setupFocusArea(container);
  initEmbeddedChat(container, 'editor');

  // Feature unlock system
  setupFeatureUnlock(container);

  // Initial render (defer to ensure DOM is fully ready)
  setTimeout(() => {
    renderer._drawGridCache(); // rebuild with CSS variables now available
    fitStage();
    updateStage();
    updateTimelineMarker();
    highlightFormation();
    if (noteData.musicBlob) {
      drawWaveform(container, noteData.musicBlob, noteData.note.duration);
    }
    // Show onboarding tour for first-time users
    startOnboardingTour(container);
  }, 50);

  window.addEventListener('resize', fitStage);

  // Initialize undo history with current state
  clearHistory();
  saveSnapshot();

  // 클라우드: 서버에 더 최신 버전이 있는지 확인
  checkServerNewer(noteId).then(isNewer => {
    if (isNewer) showToast(t('cloudNewerToast'), 4000);
  }).catch(() => {});

  // Request persistent storage
  NoteStore.requestPersistence();
}

function buildEditorHTML(data) {
  const durationSec = (data.note.duration || 30000) / 1000;
  const timelineWidth = TIMELINE_PADDING * 2 + durationSec * pixelsPerSec;

  return `
    <div class="editor${window.innerWidth > 768 ? ' editor--sidebar-open' : ''}">
      <div class="editor__header">
        <button class="editor__back" id="back-btn">← </button>
        <input class="editor__title-input" id="title-input" value="${escapeAttr(data.note.title)}" />
        <div class="editor__actions">
          <button class="btn btn--ghost" id="music-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>${t('addMusic')}</button>
          <button class="btn btn--ghost" id="export-video-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px"><path d="m22 8-6 4 6 4V8Z" fill="none"/><rect x="2" y="6" width="14" height="12" rx="2" fill="none"/></svg>${t('exportVideo')}</button>
          <button class="btn btn--primary" id="save-btn">${t('save')}</button>
          <button class="editor__emergency" id="emergency-restart-btn" type="button" title="${t('emergencyRestartTooltip')}" aria-label="${t('emergencyRestart')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg></button>
        </div>
      </div>

      <div class="editor__main">
        <div class="stage-container">
          <div class="stage-wrap">
            <canvas id="stage-canvas" class="stage-canvas"></canvas>
          </div>
          <div class="stage-3d-banner" id="stage-3d-banner">${t('previewBanner')}</div>
          <div class="stage-swap-banner" id="stage-swap-banner">${t('swapBanner')}</div>
          <div class="stage-marker-banner" id="stage-marker-banner">${t('markerEditBannerExit')}</div>
          <div class="stage-zoom-badge" id="stage-zoom-badge"></div>
        </div>
      </div>

      <div class="editor__sidebar" id="sidebar">

        <div class="sidebar__panel sidebar__panel--hidden" id="panel-inspector">
          <div class="sidebar__panel-title">
            <span id="inspector-title">${t('inspectorTitle')}</span>
          </div>
          <div class="inspector-empty" id="inspector-empty">
            <div class="inspector-empty__icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
            <div class="inspector-empty__text">${t('inspectorEmpty')}</div>
          </div>
          <div class="sidebar__scroll sidebar__scroll--hidden" id="inspector-content">
            <div class="inspector-header" id="inspector-header"></div>
            <div class="settings-section">
              <div class="settings-label">${t('inspectorCoord')}</div>
              <div class="inspector-row">
                <label class="inspector-field">
                  <span class="inspector-field__label">X</span>
                  <input type="number" class="inspector-field__input" id="inspector-x" step="0.1" />
                </label>
                <label class="inspector-field">
                  <span class="inspector-field__label">Y</span>
                  <input type="number" class="inspector-field__input" id="inspector-y" step="0.1" />
                </label>
              </div>
            </div>
            <div class="settings-section">
              <div class="inspector-dir-row">
                <div class="settings-label" style="flex:1">${t('inspectorDir')}</div>
                <div class="settings-label" style="flex:1">${t('inspectorAlign')}</div>
              </div>
              <div class="inspector-dir-row">
                <div class="inspector-direction" id="inspector-direction">
                  <button class="inspector-dir-btn" data-angle="315" title="↖">↖</button>
                  <button class="inspector-dir-btn" data-angle="0" title="↑">↑</button>
                  <button class="inspector-dir-btn" data-angle="45" title="↗">↗</button>
                  <button class="inspector-dir-btn" data-angle="270" title="←">←</button>
                  <div class="inspector-dir-center" id="inspector-angle-display">0°</div>
                  <button class="inspector-dir-btn" data-angle="90" title="→">→</button>
                  <button class="inspector-dir-btn" data-angle="225" title="↙">↙</button>
                  <button class="inspector-dir-btn" data-angle="180" title="↓">↓</button>
                  <button class="inspector-dir-btn" data-angle="135" title="↘">↘</button>
                </div>
                <div class="inspector-align" id="inspector-align">
                  <button class="inspector-align-btn" data-align="align-x" title="${t('alignX')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="22" stroke-dasharray="3 2"/><circle cx="7" cy="6" r="2.5" fill="currentColor" stroke="none" opacity="0.4"/><circle cx="17" cy="12" r="2.5" fill="currentColor" stroke="none" opacity="0.4"/><circle cx="9" cy="18" r="2.5" fill="currentColor" stroke="none" opacity="0.4"/></svg></button>
                  <button class="inspector-align-btn" data-align="align-y" title="${t('alignY')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="12" x2="22" y2="12" stroke-dasharray="3 2"/><circle cx="5" cy="7" r="2.5" fill="currentColor" stroke="none" opacity="0.4"/><circle cx="12" cy="17" r="2.5" fill="currentColor" stroke="none" opacity="0.4"/><circle cx="19" cy="9" r="2.5" fill="currentColor" stroke="none" opacity="0.4"/></svg></button>
                  <button class="inspector-align-btn" data-align="distribute-x" title="${t('distributeX')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="3" x2="4" y2="21"/><line x1="20" y1="3" x2="20" y2="21"/><line x1="12" y1="7" x2="12" y2="17"/></svg></button>
                  <button class="inspector-align-btn" data-align="distribute-y" title="${t('distributeY')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="4" x2="21" y2="4"/><line x1="3" y1="20" x2="21" y2="20"/><line x1="7" y1="12" x2="17" y2="12"/></svg></button>
                </div>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-label">${t('inspectorColor')}</div>
              <div class="inspector-palette" id="inspector-palette"></div>
            </div>
            <div class="sidebar__actions sidebar__actions--hidden sidebar__actions--inline" id="inspector-actions">
              <div style="display:flex;gap:4px">
                <button class="btn btn--ghost" id="inspector-copy-pos-btn" style="flex:1;font-size:12px">${t('inspectorCopyPos')}</button>
                <button class="btn btn--ghost" id="inspector-paste-pos-btn" style="flex:1;font-size:12px">${t('inspectorPastePos')}</button>
              </div>
              <button class="btn btn--ghost" id="inspector-reset-waypoints-btn" style="width:100%;font-size:12px">${t('inspectorResetWaypoints')}</button>
            </div>
          </div>
        </div>

        <div class="sidebar__panel" id="panel-dancers">
          <div class="sidebar__panel-title">${t('dancersTitle')}</div>
          <div class="sidebar__scroll">
            <div class="dancer-list" id="dancer-list"></div>
          </div>
          <div class="sidebar__actions">
            <button class="btn btn--ghost" id="add-dancer-btn" style="width:100%;font-size:12px">${t('addDancer')}</button>
          </div>
        </div>
        <div class="sidebar__panel sidebar__panel--hidden" id="panel-presets">
          <div class="sidebar__panel-title">${t('presetsTitle')}</div>
          <div class="inspector-empty" id="preset-empty">
            <div class="inspector-empty__icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"><circle cx="12" cy="5" r="3"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/></svg></div>
            <div class="inspector-empty__text">${t('presetEmpty')}</div>
          </div>
          <div class="sidebar__scroll" id="preset-content">
            <div class="preset-selection-info" id="preset-selection-info"></div>
            <div class="preset-spacing">
              <span class="settings-label">${t('presetSpacing')}</span>
              <button class="btn btn--ghost preset-btn-box" id="preset-spacing-down">−</button>
              <span id="preset-spacing-value">50</span>
              <button class="btn btn--ghost preset-btn-box" id="preset-spacing-up">+</button>
            </div>
            <div class="preset-grid" id="preset-grid"></div>
            <div class="basket-section" id="basket-section" style="display:none">
              <div class="basket-section__title">${t('basketTitle')}</div>
              <div class="basket-section__empty" id="basket-empty"></div>
              <div class="preset-grid" id="basket-grid"></div>
            </div>
          </div>
        </div>
        <div class="sidebar__panel sidebar__panel--hidden" id="panel-view">
          <div class="sidebar__panel-title">${t('viewTitle')}</div>
          <div class="sidebar__scroll">
            <div class="settings-section">
              <div class="settings-label">${t('viewStage')}</div>
              <label class="toggle-row">
                <span>${t('view3d')}</span>
                <div class="toggle-switch" id="sidebar-3d-toggle"><div class="toggle-switch__thumb"></div></div>
              </label>
            </div>
            <div class="settings-section">
              <div class="settings-label">${t('viewLabel')}</div>
              <div class="settings-options" id="sidebar-display-options">
                <button class="settings-option settings-option--active" data-display="number">${t('viewNumber')}</button>
                <button class="settings-option" data-display="name">${t('viewName')}</button>
                <button class="settings-option" data-display="none">${t('none')}</button>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-label">${t('viewShape')}</div>
              <div class="settings-options" id="view-shape-options">
                <button class="settings-option${(data.note.dancerShape || 'pentagon') === 'pentagon' ? ' settings-option--active' : ''}" data-shape="pentagon">${t('shapePentagon')}</button>
                <button class="settings-option${data.note.dancerShape === 'circle' ? ' settings-option--active' : ''}" data-shape="circle">${t('shapeCircle')}</button>
                <button class="settings-option${data.note.dancerShape === 'heart' ? ' settings-option--active' : ''}" data-shape="heart">${t('shapeHeart')}</button>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-label">${t('viewGrid')}</div>
              <div class="settings-options" id="view-grid-options">
                <button class="settings-option${(data.note.gridGap || 30) === 15 ? ' settings-option--active' : ''}" data-grid="15">${t('gridDense')}</button>
                <button class="settings-option${(data.note.gridGap || 30) === 30 ? ' settings-option--active' : ''}" data-grid="30">${t('gridNormal')}</button>
                <button class="settings-option${(data.note.gridGap || 30) === 60 ? ' settings-option--active' : ''}" data-grid="60">${t('gridWide')}</button>
              </div>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
              <div class="settings-label">${t('settingsStageSize')}</div>
              <div class="settings-options" id="view-stage-options">
                <button class="settings-option${STAGE_WIDTH === 400 ? ' settings-option--active' : ''}" data-stage="400x260">${t('stageSizeSmall')}</button>
                <button class="settings-option${STAGE_WIDTH === 600 ? ' settings-option--active' : ''}" data-stage="600x400">${t('stageSizeNormal')}</button>
                <button class="settings-option${STAGE_WIDTH === 800 ? ' settings-option--active' : ''}" data-stage="800x500">${t('stageSizeLarge')}</button>
              </div>
              <div class="settings-slider-row">
                <span class="settings-slider-label">${t('stageWidth')}</span>
                <input type="range" class="settings-slider" id="view-stage-width-slider" min="200" max="1200" step="5" value="${STAGE_WIDTH}" />
                <span class="settings-slider-value" id="view-stage-width-value">${STAGE_WIDTH}</span>
              </div>
              <div class="settings-slider-row">
                <span class="settings-slider-label">${t('stageHeight')}</span>
                <input type="range" class="settings-slider" id="view-stage-height-slider" min="150" max="800" step="5" value="${STAGE_HEIGHT}" />
                <span class="settings-slider-value" id="view-stage-height-value">${STAGE_HEIGHT}</span>
              </div>
              <div class="settings-slider-row">
                <span class="settings-slider-label">${t('dancerScale')}</span>
                <input type="range" class="settings-slider" id="view-dancer-scale-slider" min="50" max="200" step="5" value="${Math.round((noteData.note.dancerScale || 1) * 100)}" />
                <span class="settings-slider-value" id="view-dancer-scale-value">${Math.round((noteData.note.dancerScale || 1) * 100)}%</span>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-label">${t('audienceDir')}</div>
              <div class="settings-options" id="view-audience-options">
                <button class="settings-option${audienceDirection === 'top' ? ' settings-option--active' : ''}" data-audience="top">${t('audienceTop')}</button>
                <button class="settings-option${audienceDirection === 'bottom' ? ' settings-option--active' : ''}" data-audience="bottom">${t('audienceBottom')}</button>
              </div>
              <label class="toggle-row" style="margin-top:8px">
                <span>${t('wingArea')}</span>
                <div class="toggle-switch${data.note.showWings === true ? ' toggle-switch--on' : ''}" id="view-wing-toggle"><div class="toggle-switch__thumb"></div></div>
              </label>
            </div>
          </div>
        </div>
        <div class="sidebar__panel sidebar__panel--hidden" id="panel-markers">
          <div class="sidebar__panel-title">${t('markersTitle')}</div>
          <div class="sidebar__scroll">
            <div class="settings-section">
              <label class="toggle-row">
                <span>${t('markerShowToggle')}</span>
                <div class="toggle-switch toggle-switch--on" id="marker-show-toggle"><div class="toggle-switch__thumb"></div></div>
              </label>
              <label class="toggle-row">
                <span>${t('markerEditMode')}</span>
                <div class="toggle-switch" id="marker-edit-toggle"><div class="toggle-switch__thumb"></div></div>
              </label>
            </div>
            <div class="settings-divider"></div>
            <div id="marker-list"></div>
          </div>
          <div class="sidebar__actions">
            <button class="btn btn--ghost" id="add-marker-btn" style="width:100%">${t('addMarker')}</button>
          </div>
        </div>
        <div class="sidebar__panel sidebar__panel--hidden" id="panel-help">
          ${buildHelpPanelHTML('editor')}
        </div>
        <div class="sidebar__panel sidebar__panel--hidden" id="panel-settings">
          <div class="sidebar__panel-title">${t('settingsTitle')}</div>
          <div class="sidebar__scroll">
            <div class="settings-section">
              <div class="settings-label">${t('settingsMusic')}</div>
              <div class="settings-row">
                <span class="settings-music-name" id="settings-music-name" title="${escapeAttr(data.note.musicName || '')}">${truncateFilename(data.note.musicName, 35)}</span>
                <button class="btn btn--ghost settings-btn-sm" id="settings-music-btn">${t('change')}</button>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-label">${t('settingsDuration')}</div>
              <div class="settings-row">
                <span id="settings-duration">${formatDurationFull(data.note.duration)}</span>
                <button class="btn btn--ghost settings-btn-sm" id="settings-duration-btn">${t('change')}</button>
              </div>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
              <div class="settings-label">${t('smartGuideTitle')}</div>
              <label class="toggle-row">
                <span>${t('smartGuideLabel')}</span>
                <div class="toggle-switch toggle-switch--on" id="smart-guide-toggle"><div class="toggle-switch__thumb"></div></div>
              </label>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
              <div class="settings-label">${t('autosaveTitle')}</div>
              <label class="toggle-row">
                <span>${t('autosaveLabel')}</span>
                <div class="toggle-switch toggle-switch--on" id="autosave-toggle"><div class="toggle-switch__thumb"></div></div>
              </label>
            </div>
            <div class="settings-section">
              <div class="settings-label">${t('themeTitle')}</div>
              <div class="settings-options" id="settings-theme-options">
                <button class="settings-option${isLightMode() ? '' : ' settings-option--active'}" data-theme="dark">${t('themeDark')}</button>
                <button class="settings-option${isLightMode() ? ' settings-option--active' : ''}" data-theme="light">${t('themeLight')}</button>
              </div>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
              <div class="settings-label">${t('langTitle')}</div>
              <div class="settings-options" id="settings-lang-options">
                <button class="settings-option${getLang() === 'ko' ? ' settings-option--active' : ''}" data-lang="ko">한국어</button>
                <button class="settings-option${getLang() === 'en' ? ' settings-option--active' : ''}" data-lang="en">English</button>
              </div>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
              <div class="settings-label">${t('backupTitle')}</div>
              <div class="settings-row" style="flex-direction:column;gap:6px">
                <button class="btn btn--ghost" id="settings-share-btn" style="width:100%;font-size:12px">${t('shareLink')}</button>
                <button class="btn btn--ghost" id="settings-export-btn" style="width:100%;font-size:12px">${t('backupExport')}</button>
                <button class="btn btn--ghost" id="settings-import-btn" style="width:100%;font-size:12px">${t('backupImport')}</button>
                <input type="file" id="settings-import-file" accept=".json" style="display:none" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="sidebar-rail" id="sidebar-rail">
        <button class="sidebar-rail__icon sidebar-rail__icon--active" data-panel="dancers" title="${t('railDancers')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></button>
        <div class="sidebar-rail__lockable-zone" id="lockable-zone">
          <button class="sidebar-rail__icon" data-panel="inspector" data-unlock="inspector" title="${t('railInspector')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="sidebar-rail__icon" data-panel="presets" data-unlock="presets" title="${t('railPresets')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/></svg></button>
          <button class="sidebar-rail__icon" data-panel="markers" data-unlock="markers" title="${t('railMarkers')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg></button>
          <button class="sidebar-rail__unlock" id="unlock-btn" title="${t('unlockBtn')}">
            <svg class="unlock-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="12" width="14" height="10" rx="2"/><path d="M8 12V8a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="17" r="1.5" fill="var(--bg-secondary)"/></svg>
          </button>
        </div>
        <div class="sidebar-rail__spacer"></div>
        <button class="sidebar-rail__icon" data-panel="view" title="${t('railView')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="6" x2="22" y2="6"/><line x1="2" y1="18" x2="22" y2="18"/><line x1="6" y1="2" x2="6" y2="22"/><line x1="18" y1="2" x2="18" y2="22"/></svg></button>
        <button class="sidebar-rail__icon" data-panel="help" title="${t('railHelp')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></button>
        <button class="sidebar-rail__icon" data-panel="settings" title="${t('railSettings')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
      </div>

      <div class="player-bar">
        <div class="player-bar__row">
          <button class="player-bar__btn player-bar__btn--primary" id="play-btn"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
          <button class="player-bar__btn" id="stop-btn" title="${t('stopBtn')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg></button>
          <button class="player-bar__btn" id="prev-formation-btn" title="${t('prevFormation')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg></button>
          <button class="player-bar__btn" id="next-formation-btn" title="${t('nextFormation')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
          <span class="player-bar__time" id="time-display">${formatTime(0, true)}</span><span class="player-bar__time player-bar__time--sep">/</span><span class="player-bar__time" id="duration-display">${formatTime(data.note.duration, true)}</span>
          <button class="player-bar__btn player-bar__fullscreen" id="fullscreen-btn" title="${t('fullscreenEnter')}" aria-label="${t('fullscreenEnter')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9V3h6"/><path d="M21 9V3h-6"/><path d="M3 15v6h6"/><path d="M21 15v6h-6"/></svg></button>
        </div>

        <div class="toolbar__separator"></div>

        <div class="player-bar__row">
          <div class="toolbar">
            <button class="toolbar__btn" id="undo-btn" title="${t('undoBtn')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 0 1 15.36-6.36"/></svg></button>
            <button class="toolbar__btn" id="redo-btn" title="${t('redoBtn')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 0 0-15.36-6.36"/></svg></button>
            <div class="toolbar__separator"></div>
            <button class="toolbar__btn" id="add-formation-btn" title="${t('addFormation')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
            <button class="toolbar__btn" id="del-formation-btn" title="${t('delFormation')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
            <button class="toolbar__btn" id="copy-btn" title="${t('copyBtn')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
            <button class="toolbar__btn" id="paste-btn" title="${t('pasteBtn')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg></button>
            <div class="toolbar__separator"></div>
            <button class="toolbar__btn" id="snap-btn" title="${t('snapBtn')}">${t('snapBtn')}</button>
            <button class="toolbar__btn" id="swap-btn" title="${t('swapBtn')}">${t('swapBtn')}</button>
          </div>
        </div>
      </div>

      <div class="editor__timeline-wrap">
        <div class="editor__timeline" id="timeline-scroll">
          <div class="timeline" id="timeline" style="width:${timelineWidth}px">
          <div class="timeline__ruler" id="timeline-ruler"></div>
          <div class="timeline__formations" id="timeline-formations"></div>
          <div class="timeline__waveform-track">
            <canvas class="timeline__waveform" id="timeline-waveform"></canvas>
          </div>
          <div class="timeline__marker" id="timeline-marker" style="left:${TIMELINE_PADDING}px">
            <div class="timeline__marker-handle"></div>
          </div>
        </div>
        </div>
        <div class="timeline__bottom-bar">
          <div class="timeline__scrollbar" id="timeline-scrollbar">
            <div class="timeline__scrollbar-thumb" id="scrollbar-thumb"></div>
          </div>
          <div class="timeline__zoom">
            <button class="timeline__zoom-btn" id="zoom-out-btn">−</button>
            <span class="timeline__zoom-label" id="zoom-label">100%</span>
            <button class="timeline__zoom-btn" id="zoom-in-btn">+</button>
          </div>
        </div>
      </div>
    </div>
    <input type="file" id="music-file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac" style="display:none" />
  `;
}

// --- Playback ---
function setupPlayback(container) {
  const playBtn = container.querySelector('#play-btn');
  const timeDisplay = container.querySelector('#time-display');
  const durationDisplay = container.querySelector('#duration-display');

  // Duration change moved to settings panel

  engine.onTimeUpdate = (ms) => {
    currentMs = ms;
    timeDisplay.textContent = formatTime(ms, true);
    updateTimelineMarker();
    if (renderer._selectedDancers.size > 0) updateInspector();
  };

  engine.onPositionsUpdate = (positions) => {
    renderer.setCurrentState(noteData.dancers, positions);
    renderer.drawFrame(noteData.dancers, positions);
  };

  engine.onFormationChange = (idx) => {
    if (idx >= 0 && idx !== selectedFormation) {
      selectedFormation = idx;
      highlightFormation();
    }
  };

  engine.onPlaybackEnd = () => {
    playBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  };

  playBtn.addEventListener('click', () => {
    if (engine.isPlaying) {
      engine.pause();
      playBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      seekTo(currentMs);
    } else {
      if (swapMode) setSwapMode(false);
      if (renderer.markerEditMode) { renderer.markerEditMode = false; renderer._selectedMarker = -1; const mb = container.querySelector('#stage-marker-banner'); if (mb) mb.classList.remove('stage-marker-banner--visible'); const mt = container.querySelector('#marker-edit-toggle'); if (mt) mt.classList.remove('toggle-switch--on'); }
      selectedFormation = -1;
      selectedFormations.clear();
      selectedTransition = null;
      renderer._waypointPaths = null;
      highlightFormation();
      highlightTransition();
      engine.play(currentMs);
      playBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
    }
  });

  // Stop button (go to beginning)
  container.querySelector('#stop-btn').addEventListener('click', () => {
    if (engine.isPlaying) engine.pause();
    const PLAY_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    playBtn.innerHTML = PLAY_SVG;
    seekTo(0);
  });

  // Previous/Next formation buttons
  container.querySelector('#prev-formation-btn').addEventListener('click', () => {
    if (engine.isPlaying) engine.pause();
    // Find previous formation start time
    for (let i = noteData.formations.length - 1; i >= 0; i--) {
      if (noteData.formations[i].startTime < currentMs - 50) {
        seekTo(noteData.formations[i].startTime);
        return;
      }
    }
    seekTo(0);
  });

  container.querySelector('#next-formation-btn').addEventListener('click', () => {
    if (engine.isPlaying) engine.pause();
    // Find next formation start time
    for (let i = 0; i < noteData.formations.length; i++) {
      if (noteData.formations[i].startTime > currentMs + 50) {
        seekTo(noteData.formations[i].startTime);
        return;
      }
    }
  });

  // 스테이지 전체화면(집중) 모드 — 헤더/사이드바/타임라인 숨김, 플레이어바만 남김
  const fullscreenBtn = container.querySelector('#fullscreen-btn');
  fullscreenBtn.addEventListener('click', () => {
    const editorRoot = container.querySelector('.editor');
    const entering = !editorRoot.classList.contains('editor--focus');
    editorRoot.classList.toggle('editor--focus', entering);
    fullscreenBtn.setAttribute('title', t(entering ? 'fullscreenExit' : 'fullscreenEnter'));
    fullscreenBtn.setAttribute('aria-label', t(entering ? 'fullscreenExit' : 'fullscreenEnter'));
    // 레이아웃 변경 후 캔버스 fit 재계산
    requestAnimationFrame(() => { try { fitStage?.(); } catch (_) {} });
  });

  // Keyboard shortcuts (remove previous listener to avoid duplicates)
  if (window._choreoKeyHandler) {
    document.removeEventListener('keydown', window._choreoKeyHandler);
  }
  window._choreoKeyHandler = (e) => {
    if (_onboardingActive) return;
    const tag = e.target.tagName;
    const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.code === 'Space' && !isEditable) {
      e.preventDefault();
      const btn = document.querySelector('#play-btn');
      if (btn) btn.click();
    }
    if (isEditable) return;
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      seekTo(Math.max(0, currentMs - TIME_UNIT));
    }
    if (e.code === 'ArrowRight') {
      e.preventDefault();
      seekTo(Math.min(noteData.note.duration, currentMs + TIME_UNIT));
    }
    if (e.code === 'Backspace') {
      e.preventDefault();
    }
    if (e.code === 'Delete' || (e.code === 'Backspace' && !e.ctrlKey && !e.metaKey)) {
      if (selectedFormations.size > 0 && noteData.formations.length > 1 && !engine.isPlaying) {
        const toDelete = [...selectedFormations].sort((a, b) => b - a);
        const remaining = noteData.formations.length - toDelete.length;
        if (remaining >= 1) {
          for (const idx of toDelete) {
            noteData.formations.splice(idx, 1);
          }
          selectedFormations.clear();
          selectedFormation = findFormationIdxAtTime(noteData.formations, currentMs);
          if (selectedFormation >= 0) selectedFormations.add(selectedFormation);
          engine.setFormations(noteData.formations, noteData.dancers);
          const formationsEl = container.querySelector('#timeline-formations');
          renderFormationBoxes(formationsEl);
          updateStage(); saveSnapshot();
          showToast(t('toastFormationsDeleted', { count: toDelete.length }));
        } else {
          showToast(t('toastMinFormation'));
        }
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
      e.preventDefault();
      const snapshot = undo();
      if (snapshot) {
        restoreSnapshot(snapshot);
        showToast(t('toastUndo'));
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && e.shiftKey) {
      e.preventDefault();
      const snapshot = redo();
      if (snapshot) {
        restoreSnapshot(snapshot);
        showToast(t('toastRedo'));
      }
    }
    if (e.code === 'ArrowUp') {
      e.preventDefault();
      // Previous formation
      for (let i = noteData.formations.length - 1; i >= 0; i--) {
        if (noteData.formations[i].startTime < currentMs - 50) {
          seekTo(noteData.formations[i].startTime);
          break;
        }
      }
    }
    if (e.code === 'ArrowDown') {
      e.preventDefault();
      // Next formation
      for (let i = 0; i < noteData.formations.length; i++) {
        if (noteData.formations[i].startTime > currentMs + 50) {
          seekTo(noteData.formations[i].startTime);
          break;
        }
      }
    }
    if (e.code === 'KeyN' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const addBtn = container.querySelector('#add-formation-btn');
      if (addBtn) addBtn.click();
    }
    if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const snapBtn = container.querySelector('#snap-btn');
      if (snapBtn) snapBtn.click();
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
      e.preventDefault();
      container.querySelector('#save-btn')?.click();
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
      e.preventDefault();
      renderer._selectedDancers.clear();
      for (let i = 0; i < noteData.dancers.length; i++) {
        renderer._selectedDancers.add(i);
      }
      renderer.onDancerSelect?.(-1);
      updateStage();
    }
    if (e.code === 'Escape') {
      // 전체화면 모드면 탈출 우선
      const editorRoot = container.querySelector('.editor');
      if (editorRoot?.classList.contains('editor--focus')) {
        container.querySelector('#fullscreen-btn')?.click();
        return;
      }
      renderer._selectedDancers.clear();
      renderer.onDancerSelect?.(-1);
      updateStage();
    }
    if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      container.querySelector('#fullscreen-btn')?.click();
    }
    if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
      e.preventDefault();
      openPanel('help');
    }
    if ((e.key === '=' || e.key === '+') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      container.querySelector('#zoom-in-btn')?.click();
    }
    if (e.key === '-' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      container.querySelector('#zoom-out-btn')?.click();
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      const unlocked = getUnlockedFeatures();
      const tabPanels = ['dancers', ...['inspector', 'presets', 'markers'].filter(p => unlocked.includes(p))];
      const curIdx = tabPanels.indexOf(activePanel);
      const dir = e.shiftKey ? -1 : 1;
      const nextIdx = (curIdx + dir + tabPanels.length) % tabPanels.length;
      openPanel(tabPanels[nextIdx]);
    }
    // Ctrl+0: reset zoom
    if ((e.ctrlKey || e.metaKey) && e.code === 'Digit0') {
      e.preventDefault();
      renderer.resetZoom();
    }
  };
  document.addEventListener('keydown', window._choreoKeyHandler);

  // Prevent accidental navigation on unsaved changes
  unsaved = true;
  setNavigationGuard(() => unsaved);

  window.onbeforeunload = (e) => {
    if (unsaved) {
      e.preventDefault();
    }
  };

  // Renderer drag callbacks
  // Store drag start positions for multi-drag offset
  let dragStartPositions = null;
  const SMART_GUIDE_THRESHOLD = 8;

  function computeSmartGuides(anchorX, anchorY, positions, draggedIndices, originX, originY) {
    const guides = { lines: [], snapX: null, snapY: null };
    const others = [];
    for (let i = 0; i < positions.length; i++) {
      if (!draggedIndices.has(i) && positions[i]) others.push(positions[i]);
    }

    // 1) Stage center lines (highest priority)
    if (Math.abs(anchorX) <= SMART_GUIDE_THRESHOLD) {
      guides.lines.push({ axis: 'x', pos: 0, type: 'center' });
      guides.snapX = 0;
    }
    if (Math.abs(anchorY) <= SMART_GUIDE_THRESHOLD) {
      guides.lines.push({ axis: 'y', pos: 0, type: 'center' });
      guides.snapY = 0;
    }

    // 2) Stage edge lines
    const edges = [-HALF_W, HALF_W];
    const edgesY = [-HALF_H, HALF_H];
    if (guides.snapX === null) {
      for (const ex of edges) {
        if (Math.abs(anchorX - ex) <= SMART_GUIDE_THRESHOLD) {
          guides.lines.push({ axis: 'x', pos: ex, type: 'edge' });
          guides.snapX = ex;
          break;
        }
      }
    }
    if (guides.snapY === null) {
      for (const ey of edgesY) {
        if (Math.abs(anchorY - ey) <= SMART_GUIDE_THRESHOLD) {
          guides.lines.push({ axis: 'y', pos: ey, type: 'edge' });
          guides.snapY = ey;
          break;
        }
      }
    }

    // 3) Drag origin snap (keep X or Y from starting position)
    if (originX != null && originY != null) {
      if (guides.snapX === null && Math.abs(anchorX - originX) <= SMART_GUIDE_THRESHOLD) {
        guides.lines.push({ axis: 'x', pos: originX, type: 'origin' });
        guides.snapX = originX;
      }
      if (guides.snapY === null && Math.abs(anchorY - originY) <= SMART_GUIDE_THRESHOLD) {
        guides.lines.push({ axis: 'y', pos: originY, type: 'origin' });
        guides.snapY = originY;
      }
    }

    // 4) Dancer alignment
    for (const p of others) {
      if (guides.snapX === null && Math.abs(anchorX - p.x) <= SMART_GUIDE_THRESHOLD) {
        guides.lines.push({ axis: 'x', pos: p.x, type: 'dancer' });
        guides.snapX = p.x;
      }
      if (guides.snapY === null && Math.abs(anchorY - p.y) <= SMART_GUIDE_THRESHOLD) {
        guides.lines.push({ axis: 'y', pos: p.y, type: 'dancer' });
        guides.snapY = p.y;
      }
    }


    return guides;
  }

  renderer.onDancerDragEnd = (dancerIndex, newX, newY, selectedSet) => {
    _noFormationToastShown = false;
    if (swapMode) return;
    if (engine.isPlaying || selectedFormation < 0) return;
    const f = noteData.formations[selectedFormation];
    if (!f) return;
    const snap = renderer.isSnap;
    const gap = 15; // fixed snap unit
    const wing = renderer.showWings ? WING_SIZE - 20 : 0;
    const limit = { minX: -(HALF_W + wing), maxX: HALF_W + wing, minY: -(HALF_H + wing), maxY: HALF_H + wing };

    if (selectedSet.size > 1 && selectedSet.has(dancerIndex) && dragStartPositions) {
      const origPos = dragStartPositions.get(dancerIndex);
      let snappedAnchorX = snap ? roundToGrid(clamp(newX, limit.minX, limit.maxX), gap) : clamp(Math.round(newX), limit.minX, limit.maxX);
      let snappedAnchorY = snap ? roundToGrid(clamp(newY, limit.minY, limit.maxY), gap) : clamp(Math.round(newY), limit.minY, limit.maxY);
      if (renderer.smartGuide) {
        const positions = f.positions.map(p => ({ x: p.x, y: p.y }));
        const posMap = new Map(f.positions.map(p => [p.dancerId, { x: p.x, y: p.y }]));
        const otherPositions = noteData.dancers.map((d, i) => selectedSet.has(i) ? null : (posMap.get(d.id) || null));
        const guides = computeSmartGuides(snappedAnchorX, snappedAnchorY, otherPositions, selectedSet);
        if (guides.snapX !== null) snappedAnchorX = guides.snapX;
        if (guides.snapY !== null) snappedAnchorY = guides.snapY;
      }
      const sdx = snappedAnchorX - origPos.x;
      const sdy = snappedAnchorY - origPos.y;
      for (const idx of selectedSet) {
        const d = noteData.dancers[idx];
        const pos = f.positions.find(p => p.dancerId === d.id);
        const orig = dragStartPositions.get(idx);
        if (pos && orig) {
          pos.x = clamp(Math.round(orig.x + sdx), limit.minX, limit.maxX);
          pos.y = clamp(Math.round(orig.y + sdy), limit.minY, limit.maxY);
        }
      }
    } else {
      const dancer = noteData.dancers[dancerIndex];
      const pos = f.positions.find(p => p.dancerId === dancer.id);
      if (pos) {
        let finalX = snap ? roundToGrid(clamp(newX, limit.minX, limit.maxX), gap) : clamp(Math.round(newX), limit.minX, limit.maxX);
        let finalY = snap ? roundToGrid(clamp(newY, limit.minY, limit.maxY), gap) : clamp(Math.round(newY), limit.minY, limit.maxY);
        if (renderer.smartGuide) {
          const otherPositions = noteData.dancers.map((d, i) => {
            if (i === dancerIndex) return null;
            const p = f.positions.find(fp => fp.dancerId === d.id);
            return p ? { x: p.x, y: p.y } : null;
          });
          const guides = computeSmartGuides(finalX, finalY, otherPositions, new Set([dancerIndex]));
          if (guides.snapX !== null) finalX = guides.snapX;
          if (guides.snapY !== null) finalY = guides.snapY;
        }
        pos.x = finalX;
        pos.y = finalY;
      }
    }
    renderer._guides = null;
    renderer._dragOrigin = null;
    // Recalculate waypoints for moved dancers
    const movedIds = [];
    const oldPositions = new Map();
    for (const idx of (selectedSet.size > 1 ? selectedSet : [dancerIndex])) {
      const id = noteData.dancers[idx].id;
      movedIds.push(id);
      if (dragStartPositions && dragStartPositions.has(idx)) {
        const orig = dragStartPositions.get(idx);
        oldPositions.set(id, { x: orig.x, y: orig.y });
      }
    }
    recalcWaypoints(movedIds, selectedFormation, oldPositions);

    dragStartPositions = null;
    updateStage(); saveSnapshot();
  };

  let _noFormationToastShown = false;
  renderer.onDancerDrag = (dancerIndex, newX, newY, selectedSet) => {
    if (swapMode) return;
    if (selectedFormation < 0) {
      if (!_noFormationToastShown) { showToast(t('toastSelectFormation')); _noFormationToastShown = true; }
      return;
    }
    _noFormationToastShown = false;
    if (engine.isPlaying) return;
    const positions = engine.calcPositionsAt(currentMs);
    const snap = renderer.isSnap;
    const gap = 15; // fixed snap unit
    const wing = renderer.showWings ? WING_SIZE - 20 : 0;
    const limit = { minX: -(HALF_W + wing), maxX: HALF_W + wing, minY: -(HALF_H + wing), maxY: HALF_H + wing };

    // Capture start positions on first drag frame
    if (!dragStartPositions) {
      dragStartPositions = new Map();
      for (let i = 0; i < positions.length; i++) {
        dragStartPositions.set(i, { x: positions[i].x, y: positions[i].y, angle: positions[i].angle || 0 });
      }
      // Show ghost at drag start position
      const orig = positions[dancerIndex];
      if (orig && renderer.smartGuide) renderer._dragOrigin = { x: orig.x, y: orig.y };
    }

    if (selectedSet && selectedSet.size > 1 && selectedSet.has(dancerIndex)) {
      const origPos = dragStartPositions.get(dancerIndex);
      let snappedAnchorX = snap ? roundToGrid(clamp(newX, limit.minX, limit.maxX), gap) : clamp(Math.round(newX), limit.minX, limit.maxX);
      let snappedAnchorY = snap ? roundToGrid(clamp(newY, limit.minY, limit.maxY), gap) : clamp(Math.round(newY), limit.minY, limit.maxY);
      // Smart guide: detect alignment and apply snap for anchor
      if (renderer.smartGuide) {
        const guides = computeSmartGuides(snappedAnchorX, snappedAnchorY, positions, selectedSet, origPos.x, origPos.y);
        if (guides.snapX !== null) snappedAnchorX = guides.snapX;
        if (guides.snapY !== null) snappedAnchorY = guides.snapY;
        renderer._guides = guides.lines.length > 0 ? guides : null;
      } else { renderer._guides = null; }
      const sdx = snappedAnchorX - origPos.x;
      const sdy = snappedAnchorY - origPos.y;
      for (const idx of selectedSet) {
        const orig = dragStartPositions.get(idx);
        if (orig) {
          positions[idx] = {
            x: clamp(Math.round(orig.x + sdx), limit.minX, limit.maxX),
            y: clamp(Math.round(orig.y + sdy), limit.minY, limit.maxY),
            angle: orig.angle || 0,
          };
        }
      }
    } else {
      const origSingle = dragStartPositions.get(dancerIndex);
      let finalX = snap ? roundToGrid(clamp(newX, limit.minX, limit.maxX), gap) : clamp(Math.round(newX), limit.minX, limit.maxX);
      let finalY = snap ? roundToGrid(clamp(newY, limit.minY, limit.maxY), gap) : clamp(Math.round(newY), limit.minY, limit.maxY);
      // Smart guide: detect alignment and apply snap
      if (renderer.smartGuide) {
        const guides = computeSmartGuides(finalX, finalY, positions, new Set([dancerIndex]), origSingle?.x, origSingle?.y);
        if (guides.snapX !== null) finalX = guides.snapX;
        if (guides.snapY !== null) finalY = guides.snapY;
        renderer._guides = guides.lines.length > 0 ? guides : null;
      } else { renderer._guides = null; }
      positions[dancerIndex] = {
        x: finalX,
        y: finalY,
        angle: positions[dancerIndex]?.angle || 0,
      };
    }
    renderer.setCurrentState(noteData.dancers, positions);
    renderer.drawFrame(noteData.dancers, positions);
  };

  // Dancer rotation (mouse wheel: delta relative, handle drag: absolute angle)
  renderer.onDancerRotate = (dancerIndex, value, isAbsolute) => {
    if (engine.isPlaying || selectedFormation < 0) return;
    const f = noteData.formations[selectedFormation];
    if (!f) return;
    const d = noteData.dancers[dancerIndex];
    const pos = f.positions.find(p => p.dancerId === d.id);
    if (!pos) return;
    if (isAbsolute) {
      pos.angle = value;
    } else {
      pos.angle = ((pos.angle || 0) + value + 360) % 360;
    }
    _rotationInProgress = true;
    updateStage();
  };

  renderer.onDancerRotateEnd = () => {
    if (_snapshotDuringRotation) {
      // Another action already pushed a snapshot during the debounce window;
      // just update it with the final rotation angle.
      replaceState(takeSnapshot());
    } else {
      saveSnapshot();
    }
    unsaved = true;
    _rotationInProgress = false;
    _snapshotDuringRotation = false;
  };

  // Waypoint callbacks (drag only, waypoints auto-created)
  function _getTransitionPos(dancerIndex) {
    if (!selectedTransition) return null;
    const toF = noteData.formations[selectedTransition.toIdx];
    const d = noteData.dancers[dancerIndex];
    return toF?.positions.find(p => p.dancerId === d.id) || null;
  }

  renderer.onWaypointDrag = (dancerIndex, wpIndex, newX, newY) => {
    const pos = _getTransitionPos(dancerIndex);
    if (!pos || !pos.waypoints || !pos.waypoints[wpIndex]) return;
    pos.waypoints[wpIndex].x = Math.round(newX);
    pos.waypoints[wpIndex].y = Math.round(newY);
    updateStage();
  };

  renderer.onWaypointDragEnd = (dancerIndex, wpIndex, newX, newY) => {
    const pos = _getTransitionPos(dancerIndex);
    if (!pos || !pos.waypoints || !pos.waypoints[wpIndex]) return;
    pos.waypoints[wpIndex].x = Math.round(newX);
    pos.waypoints[wpIndex].y = Math.round(newY);
    updateStage(); saveSnapshot();
  };

  renderer.onWaypointReset = (dancerIndex) => {
    if (!selectedTransition) return;
    const { fromIdx, toIdx } = selectedTransition;
    const fromF = noteData.formations[fromIdx];
    const toF = noteData.formations[toIdx];
    const d = noteData.dancers[dancerIndex];
    const fromPos = fromF.positions.find(p => p.dancerId === d.id);
    const toPos = toF.positions.find(p => p.dancerId === d.id);
    if (fromPos && toPos) {
      toPos.waypoints = [{
        x: Math.round((fromPos.x + toPos.x) / 2),
        y: Math.round((fromPos.y + toPos.y) / 2),
        t: 0.5,
      }];
      updateStage(); saveSnapshot();
      showToast(t('toastWaypointReset', { name: d.name }));
    }
  };
}

// Recalculate waypoints proportionally for a dancer in adjacent transitions
// oldPositions: Map<dancerId, {x, y}> — positions before the drag
function recalcWaypoints(dancerIds, formationIdx, oldPositions) {
  const fs = noteData.formations;
  for (const dancerId of dancerIds) {
    const oldPos = oldPositions.get(dancerId);
    const curF = fs[formationIdx];
    const newPos = curF.positions.find(p => p.dancerId === dancerId);
    if (!oldPos || !newPos) continue;
    const dx = newPos.x - oldPos.x;
    const dy = newPos.y - oldPos.y;

    // Transition: prev → current (current is "to" side)
    if (formationIdx > 0) {
      const toPos = newPos;
      if (toPos.waypoints) {
        for (const wp of toPos.waypoints) {
          const t = wp.t || 0.5;
          wp.x = Math.round(wp.x + dx * t);
          wp.y = Math.round(wp.y + dy * t);
        }
      }
    }
    // Transition: current → next (current is "from" side)
    if (formationIdx < fs.length - 1) {
      const nextF = fs[formationIdx + 1];
      const toPos = nextF.positions.find(p => p.dancerId === dancerId);
      if (toPos && toPos.waypoints) {
        for (const wp of toPos.waypoints) {
          const t = wp.t || 0.5;
          wp.x = Math.round(wp.x + dx * (1 - t));
          wp.y = Math.round(wp.y + dy * (1 - t));
        }
      }
    }
  }
}

// --- Timeline ---
function setupTimeline(container) {
  const ruler = container.querySelector('#timeline-ruler');
  const formationsEl = container.querySelector('#timeline-formations');
  const timelineScroll = container.querySelector('#timeline-scroll');
  const durationSec = (noteData.note.duration || 30000) / 1000;

  // Mouse wheel → horizontal scroll
  timelineScroll.addEventListener('wheel', (e) => {
    if (e.shiftKey) {
      e.preventDefault();
      timelineScroll.scrollLeft += e.deltaY || e.deltaX;
    }
  }, { passive: false });

  // Click on formations area (empty space between boxes) to select transition
  formationsEl.addEventListener('click', (e) => {
    if (e.target !== formationsEl) return; // only direct clicks, not on boxes
    const rect = formationsEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ms = floorTime(Math.max(0, (x - TIMELINE_PADDING) / pixelsPerSec * 1000));
    seekTo(ms);
  });

  // Ruler ticks
  buildRulerTicks(ruler, durationSec);

  // Formation boxes
  renderFormationBoxes(formationsEl);

  // Ruler + marker: mousedown to seek, drag to scrub
  const marker = container.querySelector('#timeline-marker');
  const handle = marker.querySelector('.timeline__marker-handle');
  let rulerDragging = false;

  function rulerSeek(e) {
    const rect = ruler.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ms = floorTime(clamp((x - TIMELINE_PADDING) / pixelsPerSec * 1000, 0, noteData.note.duration));
    seekTo(ms);
  }

  function startRulerDrag(e) {
    e.preventDefault();
    rulerDragging = true;
    rulerSeek(e);
  }

  function startHandleDrag(e) {
    e.preventDefault();
    rulerDragging = true;
  }

  function moveRulerDrag(e) {
    if (!rulerDragging) return;
    const rect = ruler.getBoundingClientRect();
    const cx = e.clientX !== undefined ? e.clientX : (e.touches ? e.touches[0].clientX : 0);
    const x = cx - rect.left;
    const ms = floorTime(clamp((x - TIMELINE_PADDING) / pixelsPerSec * 1000, 0, noteData.note.duration));
    seekTo(ms);
  }

  function endRulerDrag() {
    rulerDragging = false;
  }

  ruler.addEventListener('mousedown', startRulerDrag);
  ruler.addEventListener('touchstart', (e) => { e.preventDefault(); startRulerDrag({ preventDefault(){}, clientX: e.touches[0].clientX }); }, { passive: false });

  handle.addEventListener('mousedown', startHandleDrag);
  handle.addEventListener('touchstart', (e) => { e.preventDefault(); startHandleDrag({ preventDefault(){} }); }, { passive: false });

  document.addEventListener('mousemove', moveRulerDrag);
  document.addEventListener('touchmove', (e) => { if (rulerDragging) moveRulerDrag(e); }, { passive: false });

  document.addEventListener('mouseup', endRulerDrag);
  document.addEventListener('touchend', endRulerDrag);

  // --- Custom scrollbar (drag only, no zoom handles) ---
  const scrollbar = container.querySelector('#timeline-scrollbar');
  const thumb = container.querySelector('#scrollbar-thumb');

  function rebuildTimeline() {
    const dSec = (noteData.note.duration || 30000) / 1000;
    const timelineWidth = TIMELINE_PADDING * 2 + dSec * pixelsPerSec;
    const timeline = container.querySelector('#timeline');
    timeline.style.width = `${timelineWidth}px`;

    ruler.innerHTML = '';
    buildRulerTicks(ruler, dSec);
    renderFormationBoxes(formationsEl);
    updateTimelineMarker();
    if (noteData.musicBlob) {
      drawWaveform(container, noteData.musicBlob, noteData.note.duration);
    }
    updateScrollbar();

    const pct = Math.round(pixelsPerSec / PIXEL_PER_SEC * 100);
    container.querySelector('#zoom-label').textContent = `${pct}%`;
  }

  function updateScrollbar() {
    const trackW = scrollbar.clientWidth;
    const contentW = container.querySelector('#timeline').scrollWidth;
    const viewW = timelineScroll.clientWidth;
    if (contentW <= viewW) {
      thumb.style.left = '0px';
      thumb.style.width = `${trackW}px`;
      return;
    }
    const ratio = viewW / contentW;
    const thumbW = Math.max(30, trackW * ratio);
    const scrollRatio = timelineScroll.scrollLeft / (contentW - viewW);
    const thumbLeft = scrollRatio * (trackW - thumbW);
    thumb.style.width = `${thumbW}px`;
    thumb.style.left = `${thumbLeft}px`;
  }

  function updateTimelineHint() {
    const hint = formationsEl.querySelector('.hint-banner--timeline');
    if (hint) {
      hint.style.left = `${timelineScroll.scrollLeft + timelineScroll.clientWidth / 2}px`;
    }
  }
  timelineScroll.addEventListener('scroll', () => { updateScrollbar(); updateTimelineHint(); });
  window.addEventListener('resize', () => { updateScrollbar(); updateTimelineHint(); });
  setTimeout(() => { updateScrollbar(); updateTimelineHint(); }, 100);

  // Thumb drag (mouse + touch)
  let thumbDrag = null;

  function thumbDragMove(clientX) {
    if (!thumbDrag) return;
    const trackW = scrollbar.clientWidth;
    const contentW = container.querySelector('#timeline').scrollWidth;
    const viewW = timelineScroll.clientWidth;
    const dx = clientX - thumbDrag.startX;
    const scrollRange = contentW - viewW;
    const thumbW = parseFloat(thumb.style.width);
    const trackRange = trackW - thumbW;
    if (trackRange > 0) {
      timelineScroll.scrollLeft = thumbDrag.startScroll + (dx / trackRange) * scrollRange;
    }
  }

  thumb.addEventListener('mousedown', (e) => {
    e.preventDefault();
    thumbDrag = { startX: e.clientX, startScroll: timelineScroll.scrollLeft };
  });
  thumb.addEventListener('touchstart', (e) => {
    e.preventDefault();
    thumbDrag = { startX: e.touches[0].clientX, startScroll: timelineScroll.scrollLeft };
  }, { passive: false });

  document.addEventListener('mousemove', (e) => thumbDragMove(e.clientX));
  document.addEventListener('touchmove', (e) => {
    if (thumbDrag) { e.preventDefault(); thumbDragMove(e.touches[0].clientX); }
  }, { passive: false });

  document.addEventListener('mouseup', () => { thumbDrag = null; });
  document.addEventListener('touchend', () => { thumbDrag = null; });

  // Click on track to jump
  scrollbar.addEventListener('click', (e) => {
    if (e.target !== scrollbar) return;
    const rect = scrollbar.getBoundingClientRect();
    const clickRatio = (e.clientX - rect.left) / rect.width;
    const contentW = container.querySelector('#timeline').scrollWidth;
    const viewW = timelineScroll.clientWidth;
    timelineScroll.scrollLeft = clickRatio * (contentW - viewW);
  });

  // Zoom buttons
  const ZOOM_LEVELS = [20, 30, 40, 60, 80, 120, 160];

  function zoomAroundMarker(newPPS) {
    // Marker position on screen before zoom
    const markerPx = TIMELINE_PADDING + currentMs / 1000 * pixelsPerSec;
    const markerScreenX = markerPx - timelineScroll.scrollLeft;

    pixelsPerSec = newPPS;
    rebuildTimeline();

    // Restore marker to same screen position
    const newMarkerPx = TIMELINE_PADDING + currentMs / 1000 * pixelsPerSec;
    timelineScroll.scrollLeft = newMarkerPx - markerScreenX;
    updateScrollbar();
  }

  container.querySelector('#zoom-in-btn').addEventListener('click', () => {
    const curIdx = ZOOM_LEVELS.findIndex(z => z >= pixelsPerSec);
    if (curIdx < ZOOM_LEVELS.length - 1) {
      zoomAroundMarker(ZOOM_LEVELS[curIdx + 1]);
    }
  });

  container.querySelector('#zoom-out-btn').addEventListener('click', () => {
    const curIdx = ZOOM_LEVELS.findIndex(z => z >= pixelsPerSec);
    if (curIdx > 0) {
      zoomAroundMarker(ZOOM_LEVELS[curIdx - 1]);
    }
  });
}

function renderFormationBoxes(formationsEl) {
  formationsEl.innerHTML = '';
  if (noteData.formations.length <= 1) {
    const hint = document.createElement('div');
    hint.className = 'hint-banner hint-banner--timeline';
    hint.textContent = t('hintAddFormation');
    formationsEl.appendChild(hint);
    // Position hint at viewport center
    const scrollEl = document.querySelector('#timeline-scroll');
    if (scrollEl) {
      hint.style.left = `${scrollEl.scrollLeft + scrollEl.clientWidth / 2}px`;
    }
  }
  noteData.formations.forEach((f, i) => {
    const box = document.createElement('div');
    box.className = 'formation-box' + (selectedFormations.has(i) ? ' formation-box--selected' : '') + (i === selectedFormation ? ' formation-box--active' : '');
    box.style.left = `${TIMELINE_PADDING + f.startTime / 1000 * pixelsPerSec}px`;
    box.style.width = `${f.duration / 1000 * pixelsPerSec}px`;
    box.dataset.index = i;

    // 댄서 배치 dot 썸네일 (왼쪽 정렬)
    const boxH = 44;
    const pad = 4;
    const stageW = HALF_W * 2;
    const stageH = HALF_H * 2;
    const scale = (boxH - pad * 2) / stageH;
    const thumbW = stageW * scale;
    const thumbH = stageH * scale;
    const ox = pad + thumbW / 2;
    const oy = boxH / 2;

    // 썸네일 컨테이너 (overflow: hidden, 핸들은 바깥에 유지)
    const thumb = document.createElement('div');
    thumb.className = 'formation-box__thumb';

    // 무대 외곽선
    const outline = document.createElement('div');
    outline.className = 'formation-box__stage';
    outline.style.left = `${pad}px`;
    outline.style.top = `${pad}px`;
    outline.style.width = `${thumbW}px`;
    outline.style.height = `${thumbH}px`;
    thumb.appendChild(outline);

    for (const pos of f.positions) {
      const dancer = noteData.dancers.find(d => d.id === pos.dancerId);
      if (!dancer) continue;
      const dot = document.createElement('div');
      dot.className = 'formation-box__dot';
      dot.dataset.dancerId = pos.dancerId;
      dot.style.left = `${ox + pos.x * scale}px`;
      dot.style.top = `${oy + pos.y * scale}px`;
      dot.style.background = dancer.color || '#4ECDC4';
      thumb.appendChild(dot);
    }
    box.appendChild(thumb);

    // Click handled by setupFormationDrag onUp (no separate click handler)

    // Handles
    const leftHandle = document.createElement('div');
    leftHandle.className = 'formation-box__handle formation-box__handle--left';
    const rightHandle = document.createElement('div');
    rightHandle.className = 'formation-box__handle formation-box__handle--right';
    box.appendChild(leftHandle);
    box.appendChild(rightHandle);

    // Handle drag (simplified)
    setupFormationDrag(box, i, 'body');
    setupFormationDrag(leftHandle, i, 'left');
    setupFormationDrag(rightHandle, i, 'right');

    formationsEl.appendChild(box);
  });

  updateTransitionConnectors(formationsEl);
  updateAddFormationBtn(formationsEl);
}

function updateAddFormationBtn(formationsEl) {
  if (!formationsEl) formationsEl = document.querySelector('#timeline-formations');
  if (!formationsEl) return;
  formationsEl.querySelectorAll('.formation-add-btn').forEach(el => el.remove());
  if (noteData.formations.length === 0) return;
  const lastF = noteData.formations.reduce((a, b) => (a.startTime + a.duration > b.startTime + b.duration) ? a : b);
  const lastEnd = lastF.startTime + lastF.duration;
  const gapPx = Math.max(20, 0.5 * pixelsPerSec);
  const addStart = floorTime(lastEnd + gapPx / pixelsPerSec * 1000);
  if (addStart >= noteData.note.duration) return;
  const addBox = document.createElement('div');
  addBox.className = 'formation-add-btn';
  addBox.style.left = `${TIMELINE_PADDING + addStart / 1000 * pixelsPerSec}px`;
  addBox.textContent = '+';
  addBox.title = t('addFormation');
  addBox.addEventListener('click', () => {
    if (engine.isPlaying) { showToast(t('toastStopFirst')); return; }
    const addBtn = document.querySelector('#add-formation-btn');
    seekTo(addStart);
    if (addBtn) addBtn.click();
  });
  formationsEl.appendChild(addBox);
}

function updateTransitionConnectors(formationsEl) {
  if (!formationsEl) formationsEl = document.querySelector('#timeline-formations');
  if (!formationsEl) return;
  formationsEl.querySelectorAll('.transition-connector').forEach(el => el.remove());
  const indexed = noteData.formations.map((f, i) => ({ f, i })).sort((a, b) => a.f.startTime - b.f.startTime);
  for (let s = 0; s < indexed.length - 1; s++) {
    const fromF = indexed[s].f;
    const toF = indexed[s + 1].f;
    const fromIdx = indexed[s].i;
    const toIdx = indexed[s + 1].i;
    const fromEnd = fromF.startTime + fromF.duration;
    if (toF.startTime <= fromEnd) continue;
    const left = TIMELINE_PADDING + fromEnd / 1000 * pixelsPerSec;
    const width = (toF.startTime - fromEnd) / 1000 * pixelsPerSec;
    if (width < 4) continue;
    const isActive = selectedTransition && selectedTransition.fromIdx === fromIdx && selectedTransition.toIdx === toIdx;
    const connector = document.createElement('div');
    connector.className = 'transition-connector' + (isActive ? ' transition-connector--active' : '');
    connector.style.left = `${left}px`;
    connector.style.width = `${width}px`;

    // 손그림 SVG 화살표
    const h = 44;
    const pad = 6;
    const x1 = pad, y1 = h / 2;
    const x2 = width - pad, y2 = h / 2;
    // 약간 휘는 곡선 (살짝 위로 볼록)
    const wobble = Math.min(8, width * 0.08);
    const cx = width / 2, cy = h / 2 - wobble;
    // 화살촉 크기
    const headLen = Math.min(8, width * 0.2);
    const headAngle = 0.5;
    const hx1 = x2 - headLen * Math.cos(headAngle);
    const hy1 = y2 - headLen * Math.sin(headAngle);
    const hx2 = x2 - headLen * Math.cos(-headAngle);
    const hy2 = y2 - headLen * Math.sin(-headAngle);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${h}`);
    const line = document.createElementNS(svgNS, 'path');
    line.setAttribute('class', 'transition-connector__line');
    line.setAttribute('d', `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`);
    const head = document.createElementNS(svgNS, 'path');
    head.setAttribute('class', 'transition-connector__head');
    head.setAttribute('d', `M${hx1},${hy1} L${x2},${y2} L${hx2},${hy2}`);
    svg.appendChild(line);
    svg.appendChild(head);
    connector.appendChild(svg);
    formationsEl.appendChild(connector);
  }
}

function updateFormationDots() {
  const boxes = document.querySelectorAll('.formation-box');
  const boxH = 44;
  const pad = 4;
  const scale = (boxH - pad * 2) / (HALF_H * 2);
  const thumbW = (HALF_W * 2) * scale;
  const ox = pad + thumbW / 2;
  const oy = boxH / 2;
  boxes.forEach(box => {
    const fIdx = parseInt(box.dataset.index);
    const f = noteData.formations[fIdx];
    if (!f) return;
    box.querySelectorAll('.formation-box__dot').forEach(dot => {
      const pos = f.positions.find(p => String(p.dancerId) === dot.dataset.dancerId);
      if (!pos) return;
      dot.style.left = `${ox + pos.x * scale}px`;
      dot.style.top = `${oy + pos.y * scale}px`;
    });
  });
}

function setupFormationDrag(el, fIdx, mode) {
  let startX = 0;
  let origStarts = {}; // { fIdx: origStartTime } for multi-drag
  let origStart = 0;
  let origDuration = 0;
  let targetFormation = null;
  let didDrag = false;
  let shiftKey = false;
  let isTouchActive = false;

  function onStart(e) {
    if (engine.isPlaying) return;
    if (mode !== 'body' && !e.target.classList.contains('formation-box__handle')) return;
    if (mode === 'body' && e.target.classList.contains('formation-box__handle')) return;
    e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
    startX = e.clientX;
    didDrag = false;
    shiftKey = e.shiftKey;
    targetFormation = noteData.formations[fIdx];
    origStart = targetFormation.startTime;
    origDuration = targetFormation.duration;

    // For body multi-drag, store original startTimes of all selected formations
    if (mode === 'body' && selectedFormations.has(fIdx) && selectedFormations.size > 1) {
      origStarts = {};
      for (const idx of selectedFormations) {
        origStarts[idx] = noteData.formations[idx].startTime;
      }
    } else {
      origStarts = {};
    }

    const onMove = (ev) => {
      const cx = ev.clientX !== undefined ? ev.clientX : (ev.touches ? ev.touches[0].clientX : startX);
      if (Math.abs(cx - startX) > 3) didDrag = true;
      const dx = cx - startX;
      const dtMs = Math.round(dx / pixelsPerSec * 1000 / TIME_UNIT) * TIME_UNIT;

      const maxTime = noteData.note.duration;
      if (mode === 'body') {
        if (Object.keys(origStarts).length > 1) {
          // Multi-drag: move all selected formations
          for (const [idx, orig] of Object.entries(origStarts)) {
            const f = noteData.formations[Number(idx)];
            f.startTime = clamp(orig + dtMs, 0, maxTime - f.duration);
          }
        } else {
          targetFormation.startTime = clamp(origStart + dtMs, 0, maxTime - targetFormation.duration);
        }
      } else if (mode === 'left') {
        const newStart = origStart + dtMs;
        const newDur = origDuration - dtMs;
        if (newDur >= MIN_FORMATION_DURATION && newStart >= 0) {
          targetFormation.startTime = newStart;
          targetFormation.duration = newDur;
        }
      } else if (mode === 'right') {
        const newDur = origDuration + dtMs;
        const endTime = targetFormation.startTime + newDur;
        if (newDur >= MIN_FORMATION_DURATION && endTime <= maxTime) {
          targetFormation.duration = newDur;
        }
      }

      // Update box positions directly (avoid DOM rebuild which kills touch on iOS)
      const boxes = document.querySelectorAll('.formation-box');
      noteData.formations.forEach((f, i) => {
        const box = boxes[i];
        if (!box) return;
        box.style.left = `${TIMELINE_PADDING + f.startTime / 1000 * pixelsPerSec}px`;
        box.style.width = `${f.duration / 1000 * pixelsPerSec}px`;
      });
      updateTransitionConnectors();
      updateAddFormationBtn();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      if (!didDrag) {
        // Click without drag: seek first (handles swap mode exit), then select
        const scrollEl = document.querySelector('#timeline-scroll');
        const clickX = startX - scrollEl.getBoundingClientRect().left + scrollEl.scrollLeft;
        const clickMs = floorTime(clamp((clickX - TIMELINE_PADDING) / pixelsPerSec * 1000, 0, noteData.note.duration));
        seekTo(clickMs);

        if (shiftKey) {
          // Shift+click: toggle in multi-selection
          if (selectedFormations.has(fIdx)) {
            selectedFormations.delete(fIdx);
            if (selectedFormations.size > 0) {
              selectedFormation = [...selectedFormations][selectedFormations.size - 1];
            } else {
              selectedFormation = -1;
            }
          } else {
            selectedFormations.add(fIdx);
            selectedFormation = fIdx;
          }
        } else {
          // Normal click: single select
          selectedFormation = fIdx;
          selectedFormations.clear();
          selectedFormations.add(fIdx);
        }
        highlightFormation();
        return;
      }

      // Check overlap with other formations
      const dragged = Object.keys(origStarts).length > 1
        ? [...selectedFormations]
        : [noteData.formations.indexOf(targetFormation)];

      const hasOverlap = noteData.formations.some((f, i) => {
        if (dragged.includes(i)) return false;
        return dragged.some(di => {
          const df = noteData.formations[di];
          return df.startTime < f.startTime + f.duration && df.startTime + df.duration > f.startTime;
        });
      });

      if (hasOverlap) {
        // Revert to original positions
        if (Object.keys(origStarts).length > 1) {
          for (const [idx, orig] of Object.entries(origStarts)) {
            noteData.formations[Number(idx)].startTime = orig;
          }
        } else {
          targetFormation.startTime = origStart;
          targetFormation.duration = origDuration;
        }
        const formationsEl = document.querySelector('#timeline-formations');
        renderFormationBoxes(formationsEl);
        showToast(t('toastOverlap'));
        return;
      }

      // Re-sort formations by startTime
      const selectedRefs = [...selectedFormations].map(i => noteData.formations[i]);
      noteData.formations.sort((a, b) => a.startTime - b.startTime);

      // Rebuild selectedFormations with new indices
      selectedFormations.clear();
      for (const ref of selectedRefs) {
        const newIdx = noteData.formations.indexOf(ref);
        if (newIdx >= 0) selectedFormations.add(newIdx);
      }
      selectedFormation = noteData.formations.indexOf(targetFormation);
      if (selectedFormation < 0) selectedFormation = 0;

      // Sync engine with re-sorted formations
      engine.setFormations(noteData.formations, noteData.dancers);

      // Update selection based on currentMs
      const currentFIdx = noteData.formations.findIndex((f) => currentMs >= f.startTime && currentMs < f.startTime + f.duration);
      if (currentFIdx >= 0) {
        selectedFormation = currentFIdx;
        selectedFormations.clear();
        selectedFormations.add(currentFIdx);
        selectedTransition = null;
      } else {
        selectedFormation = -1;
        selectedFormations.clear();
        // Check if currentMs is in a transition gap
        selectedTransition = null;
        const sorted = noteData.formations.slice().sort((a, b) => a.startTime - b.startTime);
        for (let i = 0; i < sorted.length - 1; i++) {
          const fromF = sorted[i];
          const toF = sorted[i + 1];
          const gapStart = fromF.startTime + fromF.duration;
          if (currentMs >= gapStart && currentMs < toF.startTime) {
            selectedTransition = { fromIdx: noteData.formations.indexOf(fromF), toIdx: noteData.formations.indexOf(toF) };
            break;
          }
        }
      }

      const formationsEl = document.querySelector('#timeline-formations');
      renderFormationBoxes(formationsEl);
      highlightFormation();
      highlightTransition();
      updateStage(); saveSnapshot();
    };

    const cleanupMouse = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    const onMouseUp = (ev) => { onUp(ev); cleanupMouse(); };
    const onTouchMove = (ev) => { ev.preventDefault(); onMove(ev); };
    const onTouchEnd = () => { onUp(); document.removeEventListener('touchmove', onTouchMove); document.removeEventListener('touchend', onTouchEnd); setTimeout(() => { isTouchActive = false; }, 300); };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }

  el.addEventListener('mousedown', (e) => { if (!isTouchActive) onStart(e); });
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isTouchActive = true;
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY) || e.target;
    onStart({ clientX: touch.clientX, target, shiftKey: e.touches.length >= 2, stopPropagation() {}, preventDefault() {} });
  }, { passive: false });
}

// --- Sidebar ---
function setupSidebar(container) {
  const list = container.querySelector('#dancer-list');
  const addBtn = container.querySelector('#add-dancer-btn');

  // Tab switching
  const tabs = container.querySelectorAll('.sidebar__tab');
  const panels = {
    dancers: container.querySelector('#panel-dancers'),
    presets: container.querySelector('#panel-presets'),
  };
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('sidebar__tab--active'));
      tab.classList.add('sidebar__tab--active');
      Object.values(panels).forEach(p => p.classList.add('sidebar__panel--hidden'));
      panels[tab.dataset.tab].classList.remove('sidebar__panel--hidden');
    });
  });

  // Preset grid
  let presetSpacing = 50;
  const spacingValue = container.querySelector('#preset-spacing-value');
  const presetGrid = container.querySelector('#preset-grid');


  function _drawPresetThumb(positions) {
    const cvs = document.createElement('canvas');
    cvs.width = 120;
    cvs.height = 80;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--stage-bg').trim() || '#1a1a2e';
    ctx.fillRect(0, 0, 120, 80);
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4ECDC4';
    for (const p of positions) {
      ctx.beginPath();
      ctx.arc(60 + p.x * 0.15, 40 + p.y * 0.15, 4, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();
    }
    return cvs;
  }

  function renderPresetThumbnails() {
    presetGrid.innerHTML = '';
    const infoEl = container.querySelector('#preset-selection-info');
    const presetEmpty = container.querySelector('#preset-empty');
    const presetContent = container.querySelector('#preset-content');

    // Show empty state when no formation is selected
    if (selectedFormation < 0) {
      if (presetEmpty) presetEmpty.style.display = '';
      if (presetContent) presetContent.classList.add('sidebar__scroll--hidden');
      return;
    }

    if (presetEmpty) presetEmpty.style.display = 'none';
    if (presetContent) presetContent.classList.remove('sidebar__scroll--hidden');

    const names = getPresetNames();
    const customPresets = getCustomPresets();
    const selected = renderer._selectedDancers;
    const hasSelection = selected && selected.size > 1;
    const targetIndices = hasSelection ? Array.from(selected).sort((a, b) => a - b) : noteData.dancers.map((_, i) => i);
    const count = targetIndices.length;

    if (infoEl) {
      infoEl.textContent = hasSelection ? t('presetSelectionInfo', { count }) : t('presetAllInfo', { count });
      infoEl.classList.toggle('preset-selection-info--highlight', hasSelection);
    }

    function applyToNearest(name, positions) {
      if (engine.isPlaying) { showToast(t('toastStopFirst')); return; }
      if (swapMode) { showToast(t('toastExitSwap')); return; }
      if (selectedFormation < 0) { showToast(t('presetSelectFirst')); return; }
      const f = noteData.formations[selectedFormation];
      const n = Math.min(count, positions.length);

      // 현재 댄서 좌표 수집
      const currentPositions = [];
      const dancerInfos = []; // {dancer, pos} 쌍
      for (let i = 0; i < n; i++) {
        const d = noteData.dancers[targetIndices[i]];
        if (!d) continue;
        const pos = f.positions.find(p => p.dancerId === d.id);
        if (!pos) continue;
        currentPositions.push({ x: pos.x, y: pos.y });
        dancerInfos.push({ dancer: d, pos });
      }

      // 헝가리안 알고리즘으로 최적 매칭
      const assignment = matchNearest(currentPositions, positions);

      const oldPositions = new Map();
      const movedIds = [];
      for (let i = 0; i < dancerInfos.length; i++) {
        const { dancer, pos } = dancerInfos[i];
        const target = positions[assignment[i]];
        oldPositions.set(dancer.id, { x: pos.x, y: pos.y });
        pos.x = target.x; pos.y = target.y;
        movedIds.push(dancer.id);
      }
      recalcWaypoints(movedIds, selectedFormation, oldPositions);
      updateStage(); saveSnapshot();
      showToast(t('presetApplied', { name }));
    }

    // Built-in presets
    for (const name of names) {
      const positions = applyPreset(name, count, presetSpacing, HALF_W, HALF_H);
      if (!positions) continue;
      const card = document.createElement('div');
      card.className = 'preset-card';
      card.appendChild(_drawPresetThumb(positions));
      const label = document.createElement('div');
      label.className = 'preset-card__name';
      label.textContent = name;
      card.appendChild(label);
      card.addEventListener('click', () => applyToNearest(name, positions));
      presetGrid.appendChild(card);
    }

    // Custom presets
    for (const [name, rawPositions] of Object.entries(customPresets)) {
      const presetCount = rawPositions.length;
      const mismatch = presetCount !== count;
      const positions = mismatch ? rawPositions.slice(0, count) : rawPositions;
      if (positions.length === 0) continue;
      const card = document.createElement('div');
      card.className = 'preset-card preset-card--custom' + (mismatch ? ' preset-card--mismatch' : '');
      card.appendChild(_drawPresetThumb(positions));
      const label = document.createElement('div');
      label.className = 'preset-card__name';
      label.innerHTML = `${name} <span class="preset-card__count">${t('presetMismatch', { count: presetCount })}</span>`;
      card.appendChild(label);
      // Delete button
      const delBtn = document.createElement('button');
      delBtn.className = 'preset-card__delete';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCustomPreset(name);
        renderPresetThumbnails();
        showToast(t('presetDeleted'));
      });
      card.appendChild(delBtn);
      card.addEventListener('click', () => applyToNearest(name, positions));
      presetGrid.appendChild(card);
    }

    // "Save current" button
    const addCard = document.createElement('div');
    addCard.className = 'preset-card preset-card--add';
    addCard.innerHTML = `<div class="preset-card__add-icon">+</div><div class="preset-card__name">${t('presetSave')}</div>`;
    addCard.addEventListener('click', () => {
      if (selectedFormation < 0) { showToast(t('presetSelectFirst')); return; }
      let name = prompt(t('presetNamePrompt'));
      if (!name || !name.trim()) return;
      name = name.trim().slice(0, 16);
      const f = noteData.formations[selectedFormation];
      const positions = [];
      for (const idx of targetIndices) {
        const d = noteData.dancers[idx];
        if (!d) continue;
        const pos = f.positions.find(p => p.dancerId === d.id);
        positions.push(pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 });
      }
      saveCustomPreset(name.trim(), positions);
      renderPresetThumbnails();
      showToast(t('presetSaved'));
    });
    presetGrid.appendChild(addCard);
  }

  container.querySelector('#preset-spacing-down').addEventListener('click', () => {
    if (presetSpacing > 20) {
      presetSpacing -= 10;
      spacingValue.textContent = presetSpacing;
      renderPresetThumbnails();
    }
  });
  container.querySelector('#preset-spacing-up').addEventListener('click', () => {
    if (presetSpacing < 100) {
      presetSpacing += 10;
      spacingValue.textContent = presetSpacing;
      renderPresetThumbnails();
    }
  });

  renderPresetThumbnails();
  _renderPresetThumbnails = renderPresetThumbnails;

  // --- 내 컬렉션 (갤러리에서 담은 영감) ---
  async function renderBasket() {
    const section = container.querySelector('#basket-section');
    const empty = container.querySelector('#basket-empty');
    const grid = container.querySelector('#basket-grid');
    if (!section || !empty || !grid) return;

    const user = await getCurrentUser();
    if (!user) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';

    let items;
    try {
      items = await fetchBasket();
    } catch (err) {
      console.warn('basket fetch failed', err);
      return;
    }

    grid.innerHTML = '';
    if (items.length === 0) {
      empty.textContent = t('basketEmpty');
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    for (const item of items) {
      const pd = item.preset.preset_data;
      const card = document.createElement('div');
      card.className = 'preset-card preset-card--basket';

      const cvs = document.createElement('canvas');
      cvs.width = 120;
      cvs.height = 80;
      const f0 = pd.formations[0];
      if (f0) {
        const dancers = pd.dancers.map((d, i) => ({ id: i, name: d.name, color: d.color }));
        const positions = f0.positions.map(p => ({ dancerId: p.dancerIndex, x: p.x, y: p.y, angle: p.angle || 0 }));
        renderFormationThumbnail(cvs, {
          dancers, positions,
          stageWidth: pd.note.stageWidth, stageHeight: pd.note.stageHeight,
          dancerShape: pd.note.dancerShape, dancerScale: pd.note.dancerScale,
          showWings: false, hideOffstage: true,
        });
      }
      card.appendChild(cvs);

      const label = document.createElement('div');
      label.className = 'preset-card__name';
      const useCount = Math.min(2, pd.formations.length);
      label.textContent = item.preset.title;
      const badge = document.createElement('span');
      badge.className = 'preset-card__count';
      badge.textContent = `×${useCount}`;
      label.appendChild(document.createTextNode(' '));
      label.appendChild(badge);
      card.appendChild(label);

      const delBtn = document.createElement('button');
      delBtn.className = 'preset-card__delete';
      delBtn.textContent = '✕';
      delBtn.title = t('basketRemove');
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await removeFromBasket(item.preset.id);
          showToast(t('basketRemoved'));
          renderBasket();
        } catch (err) {
          showToast(err.message);
        }
      });
      card.appendChild(delBtn);

      card.addEventListener('click', () => applyBasketItem(pd));
      grid.appendChild(card);
    }
  }

  function applyBasketItem(pd) {
    if (engine.isPlaying) { showToast(t('toastStopFirst')); return; }
    if (swapMode) { showToast(t('toastExitSwap')); return; }
    if (selectedFormation < 0) { showToast(t('presetSelectFirst')); return; }

    const presetFormations = pd.formations || [];
    if (presetFormations.length === 0) return;
    const N = Math.min(2, presetFormations.length);

    if (N === 2 && selectedFormation + 1 >= noteData.formations.length) {
      showToast(t('basketNeedNextFormation'));
      return;
    }

    const selected = renderer._selectedDancers;
    const hasSelection = selected && selected.size > 1;
    const targetIndices = hasSelection ? Array.from(selected).sort((a, b) => a - b) : noteData.dancers.map((_, i) => i);

    const presetCount = pd.dancers.length;
    const presetEntries0 = []; // [{ presetIdx, x, y }]
    for (const p of presetFormations[0].positions) {
      presetEntries0.push({ presetIdx: p.dancerIndex, x: p.x, y: p.y });
    }
    if (presetEntries0.length === 0) return;

    const currentFormation = noteData.formations[selectedFormation];
    const dancerInfos = []; // [{ dancer, currentXY }]
    for (const idx of targetIndices) {
      const d = noteData.dancers[idx];
      if (!d) continue;
      const pos = currentFormation.positions.find(p => p.dancerId === d.id);
      if (!pos) continue;
      dancerInfos.push({ dancer: d, currentXY: { x: pos.x, y: pos.y } });
    }
    if (dancerInfos.length === 0) return;

    // 첫 번째 대형 기준으로 노트 댄서 ↔ preset dancerIndex 매핑 결정
    const mapping = pickAndMatch(dancerInfos, presetEntries0);

    // N개 대형에 같은 매핑으로 좌표 적용
    for (let k = 0; k < N; k++) {
      const f = presetFormations[k];
      const presetK = new Array(presetCount);
      for (const p of f.positions) {
        presetK[p.dancerIndex] = { x: p.x, y: p.y, angle: p.angle };
      }

      const targetFormation = noteData.formations[selectedFormation + k];
      const oldPositions = new Map();
      const movedIds = [];
      for (const m of mapping) {
        const target = presetK[m.presetIdx];
        if (!target) continue;
        const { dancer } = dancerInfos[m.dancerInfoIdx];
        const pos = targetFormation.positions.find(p => p.dancerId === dancer.id);
        if (!pos) continue;
        oldPositions.set(dancer.id, { x: pos.x, y: pos.y });
        pos.x = target.x;
        pos.y = target.y;
        if (target.angle !== undefined) pos.angle = target.angle;
        movedIds.push(dancer.id);
      }
      recalcWaypoints(movedIds, selectedFormation + k, oldPositions);
    }

    updateStage(); saveSnapshot();
    showToast(t('basketApplied'));
  }

  // 노트 댄서 ↔ preset 좌표 매핑: 가까운 M쌍 그리디 + 헝가리안 재최적화.
  // M = min(노트, preset). 더 많은 쪽에서 가까운 M명만 사용.
  function pickAndMatch(dancerInfos, presetEntries) {
    const used = { dancers: new Set(), presets: new Set() };
    const picked = []; // [{ dancerInfoIdx, presetEntryIdx }]

    if (presetEntries.length <= dancerInfos.length) {
      // preset 좌표가 적거나 같음 → preset 기준으로 가까운 댄서 선택
      for (let pi = 0; pi < presetEntries.length; pi++) {
        let bestIdx = -1, bestDist = Infinity;
        for (let di = 0; di < dancerInfos.length; di++) {
          if (used.dancers.has(di)) continue;
          const dx = dancerInfos[di].currentXY.x - presetEntries[pi].x;
          const dy = dancerInfos[di].currentXY.y - presetEntries[pi].y;
          const d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; bestIdx = di; }
        }
        if (bestIdx >= 0) {
          used.dancers.add(bestIdx);
          picked.push({ dancerInfoIdx: bestIdx, presetEntryIdx: pi });
        }
      }
    } else {
      // 노트 댄서가 적음 → 댄서 기준으로 가까운 preset 좌표 선택
      for (let di = 0; di < dancerInfos.length; di++) {
        let bestIdx = -1, bestDist = Infinity;
        for (let pi = 0; pi < presetEntries.length; pi++) {
          if (used.presets.has(pi)) continue;
          const dx = dancerInfos[di].currentXY.x - presetEntries[pi].x;
          const dy = dancerInfos[di].currentXY.y - presetEntries[pi].y;
          const d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; bestIdx = pi; }
        }
        if (bestIdx >= 0) {
          used.presets.add(bestIdx);
          picked.push({ dancerInfoIdx: di, presetEntryIdx: bestIdx });
        }
      }
    }

    if (picked.length === 0) return [];

    const subCurrent = picked.map(p => dancerInfos[p.dancerInfoIdx].currentXY);
    const subTarget = picked.map(p => ({ x: presetEntries[p.presetEntryIdx].x, y: presetEntries[p.presetEntryIdx].y }));
    const assignment = matchNearest(subCurrent, subTarget);
    return picked.map((p, i) => ({
      dancerInfoIdx: p.dancerInfoIdx,
      presetIdx: presetEntries[picked[assignment[i]].presetEntryIdx].presetIdx,
    }));
  }

  _renderBasket = renderBasket;
  renderBasket();

  renderDancerList(list);

  addBtn.addEventListener('click', () => {
    const idx = noteData.dancers.length;
    const newDancer = {
      id: Date.now(),
      noteId: noteData.note.id,
      name: t('dancerDefault', { n: idx + 1 }),
      color: _pickDancerColor(noteData.dancers),
      order: idx,
    };
    noteData.dancers.push(newDancer);

    // Add position to all formations
    const defaultAngle = audienceDirection === 'bottom' ? 180 : 0;

    if (renderer.showWings) {
      // Place in offstage left wing, stacked vertically
      const offstageX = -(HALF_W + Math.round(WING_SIZE / 2));
      const offstageCount = noteData.dancers.filter((d, i) => {
        if (i === noteData.dancers.length - 1) return false;
        const f0 = noteData.formations[0];
        if (!f0) return false;
        const pos = f0.positions.find(p => p.dancerId === d.id);
        return pos && Math.abs(pos.x) > HALF_W;
      }).length;
      const offstageY = -HALF_H + 40 + offstageCount * 40;
      for (const f of noteData.formations) {
        f.positions.push({ dancerId: newDancer.id, x: offstageX, y: clamp(offstageY, -HALF_H, HALF_H), angle: defaultAngle });
      }
    } else {
      // Wings hidden — place at bottom-left corner of stage
      const margin = 20;
      const stageX = -HALF_W + margin + ((noteData.dancers.length - 1) % 5) * 30;
      const stageY = HALF_H - margin;
      for (const f of noteData.formations) {
        f.positions.push({ dancerId: newDancer.id, x: stageX, y: stageY, angle: defaultAngle });
      }
    }

    engine.setFormations(noteData.formations, noteData.dancers);
    renderDancerList(list);
    if (_renderPresetThumbnails) _renderPresetThumbnails();
    updateStage(); saveSnapshot();

    // Focus the new dancer's name input
    const lastInput = list.querySelector(`[data-name="${idx}"]`);
    if (lastInput) {
      lastInput.focus();
      lastInput.select();
    }
  });

}

const PALETTE = [
  '#EF4444', '#3B82F6', '#22C55E', '#EAB308',
  '#F97316', '#A855F7', '#EC4899', '#06B6D4',
  '#F1F5F9', '#92400E', '#6B7280',
];

// 댄서 색상 자동 선택: 기존 댄서들의 색상 패턴을 감지
function _pickDancerColor(dancers) {
  if (dancers.length === 0) return PALETTE[0];

  const colors = dancers.map(d => d.color);

  // 전부 동일 → 같은 색 유지
  if (colors.every(c => c === colors[0])) return colors[0];

  // 마지막 연속 그룹 확인
  let groupColor = colors[colors.length - 1];
  let groupLen = 1;
  for (let i = colors.length - 2; i >= 0; i--) {
    if (colors[i] === groupColor) groupLen++;
    else break;
  }

  // 유닛별 동일: 연속 2명 이상 같은 색 그룹이 있으면 마지막 그룹 색 유지
  if (groupLen >= 2) return groupColor;

  // 전부 다르게: 팔레트에서 미사용 색 선택
  const used = new Set(colors);
  const unused = PALETTE.filter(c => !used.has(c));
  if (unused.length > 0) return unused[0];
  return PALETTE[colors.length % PALETTE.length];
}

// --- Dancer Inspector ---
const INSPECTOR_UNIT = 15; // fixed grid unit for coordinate display (min snap)

function updateInspector() {
  const selected = Array.from(renderer._selectedDancers);
  const emptyEl = document.querySelector('#inspector-empty');
  const contentEl = document.querySelector('#inspector-content');
  const titleEl = document.querySelector('#inspector-title');
  const headerEl = document.querySelector('#inspector-header');

  if (selected.length === 0) {
    if (emptyEl) emptyEl.style.display = '';
    if (contentEl) contentEl.classList.add('sidebar__scroll--hidden');
    if (titleEl) titleEl.textContent = t('inspectorTitle');
    const actionsEl = document.querySelector('#inspector-actions');
    if (actionsEl) actionsEl.classList.add('sidebar__actions--hidden');
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (contentEl) contentEl.classList.remove('sidebar__scroll--hidden');

  // Show actions area when 1+ dancers selected; toggle button states by context
  const isTransitionCtx = !!selectedTransition;
  const actionsEl = document.querySelector('#inspector-actions');
  if (actionsEl) actionsEl.classList.toggle('sidebar__actions--hidden', selected.length < 1);
  const copyPosBtn = document.querySelector('#inspector-copy-pos-btn');
  if (copyPosBtn) copyPosBtn.disabled = isTransitionCtx || selected.length !== 1;
  const pastePosBtn = document.querySelector('#inspector-paste-pos-btn');
  if (pastePosBtn) pastePosBtn.disabled = isTransitionCtx || selected.length < 1 || !copiedDancerPos;
  const waypointBtn = document.querySelector('#inspector-reset-waypoints-btn');
  if (waypointBtn) waypointBtn.disabled = !isTransitionCtx;

  // Header
  if (selected.length === 1) {
    const d = noteData.dancers[selected[0]];
    const idx = selected[0];
    const hasPrev = idx > 0;
    const hasNext = idx < noteData.dancers.length - 1;
    if (headerEl) {
      headerEl.innerHTML = d ? `<div class="inspector-nav">` +
        `<button class="inspector-nav__btn${hasPrev ? '' : ' inspector-nav__btn--disabled'}" id="inspector-prev" title="${t('prevDancer')}">‹</button>` +
        `<div class="inspector-field" style="flex:1"><span class="inspector-field__label">${idx + 1}</span><input class="inspector-header__name" id="inspector-name" value="${escapeAttr(d.name)}" /></div>` +
        `<button class="inspector-nav__btn${hasNext ? '' : ' inspector-nav__btn--disabled'}" id="inspector-next" title="${t('nextDancer')}">›</button>` +
        `</div>` : '';
      const prevBtn = document.querySelector('#inspector-prev');
      const nextBtn = document.querySelector('#inspector-next');
      if (prevBtn) prevBtn.addEventListener('click', () => {
        if (idx > 0) {
          renderer._selectedDancers = new Set([idx - 1]);
          updateStage();
          const dl = document.querySelector('#dancer-list');
          if (dl) renderDancerList(dl);
        }
      });
      if (nextBtn) nextBtn.addEventListener('click', () => {
        if (idx < noteData.dancers.length - 1) {
          renderer._selectedDancers = new Set([idx + 1]);
          updateStage();
          const dl = document.querySelector('#dancer-list');
          if (dl) renderDancerList(dl);
        }
      });
    }
  } else {
    if (headerEl) headerEl.innerHTML = `<span class="inspector-header__multi">${t('inspectorMulti', { count: selected.length })}</span>`;
  }

  // Determine if read-only (transition, outside formations, or playing)
  const isTransition = !!selectedTransition;
  const isReadonly = isTransition || selectedFormation < 0 || engine.isPlaying;
  const f = isReadonly ? null : noteData.formations[selectedFormation];
  const interpolated = isReadonly ? engine.calcPositionsAt(currentMs) : null;

  // Gather properties from selected dancers
  let xs = [], ys = [], angles = [], colors = [];
  for (const idx of selected) {
    const d = noteData.dancers[idx];
    if (!d) continue;
    if (isReadonly && interpolated && interpolated[idx]) {
      const p = interpolated[idx];
      xs.push(Math.round(p.x / INSPECTOR_UNIT * 10) / 10);
      ys.push(Math.round(p.y / INSPECTOR_UNIT * 10) / 10);
      angles.push(Math.round(p.angle || 0));
    } else if (f) {
      const pos = f.positions.find(p => p.dancerId === d.id);
      if (pos) {
        xs.push(Math.round(pos.x / INSPECTOR_UNIT * 10) / 10);
        ys.push(Math.round(pos.y / INSPECTOR_UNIT * 10) / 10);
        angles.push(pos.angle || 0);
      }
    }
    colors.push(d.color);
  }

  // X/Y inputs
  const xInput = document.querySelector('#inspector-x');
  const yInput = document.querySelector('#inspector-y');
  if (xInput) {
    const allSame = xs.every(v => v === xs[0]);
    xInput.value = allSame && xs.length > 0 ? xs[0] : '';
    xInput.placeholder = allSame ? '' : '—';
    xInput.disabled = isReadonly;
  }
  if (yInput) {
    const allSame = ys.every(v => v === ys[0]);
    yInput.value = allSame && ys.length > 0 ? ys[0] : '';
    yInput.placeholder = allSame ? '' : '—';
    yInput.disabled = isReadonly;
  }

  // Direction buttons + angle display
  const dirContainer = document.querySelector('#inspector-direction');
  const angleDisplay = document.querySelector('#inspector-angle-display');
  if (dirContainer) {
    const allSameAngle = angles.length > 0 && angles.every(a => a === angles[0]);
    dirContainer.querySelectorAll('.inspector-dir-btn').forEach(btn => {
      const btnAngle = Number(btn.dataset.angle);
      btn.classList.toggle('inspector-dir-btn--active', !isReadonly && allSameAngle && btnAngle === angles[0]);
      btn.disabled = isReadonly;
    });
    if (angleDisplay) {
      angleDisplay.textContent = allSameAngle && angles.length > 0 ? `${angles[0]}°` : '—';
    }
    dirContainer.classList.toggle('inspector-direction--disabled', isReadonly);
  }

  // Align buttons: enable only when 2+ dancers selected and not readonly
  const alignEl = document.querySelector('#inspector-align');
  if (alignEl) {
    const canAlign = selected.length >= 2 && !isReadonly;
    alignEl.querySelectorAll('.inspector-align-btn').forEach(btn => {
      btn.disabled = !canAlign;
    });
  }

  // Color palette swatches + custom button
  const paletteEl = document.querySelector('#inspector-palette');
  if (paletteEl) {
    const allSameColor = colors.length > 0 && colors.every(c => c === colors[0]);
    const isCustom = allSameColor && !PALETTE.includes(colors[0]);
    const customBg = isCustom ? colors[0] : '';
    const initialColor = allSameColor ? colors[0] : '#888888';
    paletteEl.innerHTML = PALETTE.map(c =>
      `<div class="inspector-palette__swatch${allSameColor && c === colors[0] ? ' inspector-palette__swatch--active' : ''}" data-swatch="${c}" style="background:${c}"></div>`
    ).join('') + `<label class="inspector-palette__swatch inspector-palette__custom${isCustom ? ' inspector-palette__swatch--active' : ''}" data-custom="true" title="${t('custom')}"${customBg ? ` style="background:${customBg}"` : ''}><span class="inspector-palette__custom-text">+</span><input type="color" class="inspector-palette__color-input" value="${initialColor}" /></label>`;

    paletteEl.querySelectorAll('[data-swatch]').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = swatch.dataset.swatch;
        for (const idx of renderer._selectedDancers) {
          noteData.dancers[idx].color = color;
        }
        renderDancerList(document.querySelector('#dancer-list'));
        updateStage(); saveSnapshot();
      });
    });

    // 모바일에서 네이티브 컬러 피커는 실제 탭 대상이 input이어야 열림 → input을 + 버튼 안에 투명 오버레이로 배치
    const customInput = paletteEl.querySelector('.inspector-palette__color-input');
    if (customInput) {
      customInput.addEventListener('input', (e) => {
        for (const idx of renderer._selectedDancers) {
          noteData.dancers[idx].color = e.target.value;
        }
        renderDancerList(document.querySelector('#dancer-list'));
        updateStage();
      });
      customInput.addEventListener('change', () => saveSnapshot());
    }
  }
}

function setupInspector(container) {
  const xInput = container.querySelector('#inspector-x');
  const yInput = container.querySelector('#inspector-y');

  function applyCoord(axis) {
    const input = axis === 'x' ? xInput : yInput;
    const val = parseFloat(input.value);
    if (isNaN(val)) return;
    const f = noteData.formations[selectedFormation];
    if (!f) return;
    const limit = axis === 'x' ? HALF_W : HALF_H;
    const px = clamp(Math.round(val * INSPECTOR_UNIT), -limit, limit);
    for (const idx of renderer._selectedDancers) {
      const d = noteData.dancers[idx];
      if (!d) continue;
      const pos = f.positions.find(p => p.dancerId === d.id);
      if (pos) pos[axis] = px;
    }
    updateStage(); saveSnapshot();
  }

  xInput.addEventListener('change', () => applyCoord('x'));
  yInput.addEventListener('change', () => applyCoord('y'));

  // Direction buttons
  container.querySelector('#inspector-direction').addEventListener('click', (e) => {
    const btn = e.target.closest('.inspector-dir-btn');
    if (!btn) return;
    const angle = Number(btn.dataset.angle);
    const f = noteData.formations[selectedFormation];
    if (!f) return;
    for (const idx of renderer._selectedDancers) {
      const d = noteData.dancers[idx];
      if (!d) continue;
      const pos = f.positions.find(p => p.dancerId === d.id);
      if (pos) pos.angle = angle;
    }
    updateStage(); saveSnapshot();
  });

  // Align / Distribute buttons
  container.querySelector('#inspector-align').addEventListener('click', (e) => {
    const btn = e.target.closest('.inspector-align-btn');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.align;
    const f = noteData.formations[selectedFormation];
    if (!f) return;
    const selected = [...renderer._selectedDancers];
    if (selected.length < 2) return;

    const positions = selected.map(idx => {
      const d = noteData.dancers[idx];
      return d ? f.positions.find(p => p.dancerId === d.id) : null;
    }).filter(Boolean);
    if (positions.length < 2) return;

    if (action === 'align-x') {
      const avgX = Math.round(positions.reduce((s, p) => s + p.x, 0) / positions.length);
      positions.forEach(p => { p.x = avgX; });
    } else if (action === 'align-y') {
      const avgY = Math.round(positions.reduce((s, p) => s + p.y, 0) / positions.length);
      positions.forEach(p => { p.y = avgY; });
    } else if (action === 'distribute-x') {
      positions.sort((a, b) => a.x - b.x);
      const minX = positions[0].x, maxX = positions[positions.length - 1].x;
      const step = (maxX - minX) / (positions.length - 1);
      positions.forEach((p, i) => { p.x = Math.round(minX + step * i); });
    } else if (action === 'distribute-y') {
      positions.sort((a, b) => a.y - b.y);
      const minY = positions[0].y, maxY = positions[positions.length - 1].y;
      const step = (maxY - minY) / (positions.length - 1);
      positions.forEach((p, i) => { p.y = Math.round(minY + step * i); });
    }
    updateStage(); saveSnapshot();
  });

  // Name editing (delegated, since header is re-rendered)
  container.querySelector('#inspector-header').addEventListener('change', (e) => {
    if (e.target.id !== 'inspector-name') return;
    const selected = Array.from(renderer._selectedDancers);
    if (selected.length !== 1) return;
    noteData.dancers[selected[0]].name = e.target.value;
    renderDancerList(document.querySelector('#dancer-list'));
    updateStage(); saveSnapshot();
  });

  // 이름 input 포커스 시 전체 텍스트 선택 (빠른 rename)
  container.querySelector('#inspector-header').addEventListener('focusin', (e) => {
    if (e.target.id !== 'inspector-name') return;
    e.target.select();
  });

  // Waypoint reset button for selected dancers in transition
  container.querySelector('#inspector-reset-waypoints-btn').addEventListener('click', () => {
    if (!selectedTransition || renderer._selectedDancers.size === 0) return;
    const { fromIdx, toIdx } = selectedTransition;
    const fromF = noteData.formations[fromIdx];
    const toF = noteData.formations[toIdx];
    const selected = Array.from(renderer._selectedDancers);
    let count = 0;
    for (const idx of selected) {
      const d = noteData.dancers[idx];
      if (!d) continue;
      const fromPos = fromF.positions.find(p => p.dancerId === d.id);
      const toPos = toF.positions.find(p => p.dancerId === d.id);
      if (fromPos && toPos) {
        toPos.waypoints = [{
          x: Math.round((fromPos.x + toPos.x) / 2),
          y: Math.round((fromPos.y + toPos.y) / 2),
          t: 0.5,
        }];
        count++;
      }
    }
    if (count > 0) {
      updateStage(); saveSnapshot();
      showToast(t('toastWaypointsResetBulk', { count }));
    }
  });

  // Copy/Paste dancer position
  container.querySelector('#inspector-copy-pos-btn').addEventListener('click', () => {
    copyDancerPosition();
  });
  container.querySelector('#inspector-paste-pos-btn').addEventListener('click', () => {
    pasteDancerPosition();
  });
}

function copyDancerPosition() {
  const selected = Array.from(renderer._selectedDancers);
  if (selected.length !== 1) return;
  const f = noteData.formations[selectedFormation];
  if (!f) return;
  const d = noteData.dancers[selected[0]];
  if (!d) return;
  const pos = f.positions.find(p => p.dancerId === d.id);
  if (!pos) return;
  copiedDancerPos = { x: pos.x, y: pos.y, angle: pos.angle || 0 };
  showToast(t('toastDancerPosCopied'));
  updateInspector();
}

function pasteDancerPosition() {
  if (!copiedDancerPos) {
    showToast(t('toastNoDancerPosCopy'));
    return;
  }
  const selected = Array.from(renderer._selectedDancers);
  if (selected.length < 1) return;
  const f = noteData.formations[selectedFormation];
  if (!f) return;
  for (const idx of selected) {
    const d = noteData.dancers[idx];
    if (!d) continue;
    const pos = f.positions.find(p => p.dancerId === d.id);
    if (pos) {
      pos.x = copiedDancerPos.x;
      pos.y = copiedDancerPos.y;
      pos.angle = copiedDancerPos.angle;
    }
  }
  updateStage(); saveSnapshot();
  showToast(t('toastDancerPosPasted'));
}

function setupFocusArea(container) {
  const stageEl = container.querySelector('.stage-container');
  const timelineEl = container.querySelector('.editor__timeline-wrap');

  function setFocus(area) {
    _focusedArea = area;
    stageEl.classList.toggle('stage-container--focused', area === 'stage');
    timelineEl.classList.toggle('editor__timeline-wrap--focused', area === 'timeline');
  }

  // 스테이지 클릭 = 편집 의도 → 재생 자동 정지 (드래그가 메인 스레드 점유해 정지 버튼 먹통 되는 시나리오 차단)
  // 룰러/플레이어바는 timelineEl/별도 영역이라 영향 없음
  stageEl.addEventListener('pointerdown', () => {
    setFocus('stage');
    if (engine?.isPlaying) engine.pause();
  });
  timelineEl.addEventListener('pointerdown', () => setFocus('timeline'));

  // 초기 상태
  setFocus('timeline');
}

function renderDancerList(list) {
  const dancerHtml = noteData.dancers.map((d, i) => `
    <div class="dancer-item${renderer._selectedDancers.has(i) ? ' dancer-item--selected' : ''}" data-index="${i}">
      <span class="dancer-item__number">${i + 1}</span>
      <div class="dancer-item__color" style="background:${d.color}"></div>
      <span class="dancer-item__name">${escapeAttr(d.name)}</span>
      <button class="dancer-item__remove" data-remove="${i}">✕</button>
    </div>
  `).join('');
  const hintHtml = noteData.dancers.length <= 1
    ? `<div class="inspector-empty"><div class="inspector-empty__icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="inspector-empty__text">${t('hintAddDancers')}</div></div>` : '';
  list.innerHTML = dancerHtml + hintHtml;

  // 댄서 항목 클릭 → 해당 댄서 선택 + 댄서 편집 패널로 전환
  list.querySelectorAll('.dancer-item[data-index]').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('[data-remove]')) return;
      const idx = Number(item.dataset.index);
      renderer._selectedDancers = new Set([idx]);
      updateStage();
      openPanel('inspector');
    });
  });

  list.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (noteData.dancers.length <= 1) {
        showToast(t('minDancerError'));
        return;
      }
      const idx = Number(e.target.dataset.remove);
      const dancer = noteData.dancers[idx];
      noteData.dancers.splice(idx, 1);
      for (const f of noteData.formations) {
        f.positions = f.positions.filter((p) => p.dancerId !== dancer.id);
      }
      engine.setFormations(noteData.formations, noteData.dancers);
      renderDancerList(list);
      if (_renderPresetThumbnails) _renderPresetThumbnails();
      updateStage(); saveSnapshot();
    });
  });
}

// --- Toolbar ---
function setupToolbar(container) {
  const undoBtn = container.querySelector('#undo-btn');
  const redoBtn = container.querySelector('#redo-btn');
  const addBtn = container.querySelector('#add-formation-btn');
  const delBtn = container.querySelector('#del-formation-btn');
  const swapBtn = container.querySelector('#swap-btn');
  const copyBtn = container.querySelector('#copy-btn');
  const pasteBtn = container.querySelector('#paste-btn');

  function guardPlaying() {
    if (engine.isPlaying) {
      showToast(t('toastStopFirst'));
      return true;
    }
    return false;
  }

  undoBtn.addEventListener('click', () => {
    if (guardPlaying()) return;
    const snapshot = undo();
    if (snapshot) {
      restoreSnapshot(snapshot);
      showToast(t('toastUndo'));
    }
  });

  redoBtn.addEventListener('click', () => {
    if (guardPlaying()) return;
    const snapshot = redo();
    if (snapshot) {
      restoreSnapshot(snapshot);
      showToast(t('toastRedo'));
    }
  });
  let copiedPositions = null;
  // copiedDancerPos is declared at module level

  _updateToolbarState = () => {
    const hasFormation = selectedFormation >= 0;
    const isPlaying = engine.isPlaying;
    const isTransition = !!selectedTransition;
    // Add: disabled when a formation is selected (would overlap) or playing
    addBtn.classList.toggle('toolbar__btn--disabled', hasFormation || isPlaying);
    // Delete: need a formation selected and more than 1
    delBtn.classList.toggle('toolbar__btn--disabled', !hasFormation || noteData.formations.length <= 1 || isPlaying);
    // Copy: need a formation selected
    copyBtn.classList.toggle('toolbar__btn--disabled', !hasFormation || isPlaying);
    // Paste: need copied data
    pasteBtn.classList.toggle('toolbar__btn--disabled', !copiedPositions || isPlaying);
    // Swap: need a formation selected, not playing, not in transition
    swapBtn.classList.toggle('toolbar__btn--disabled', (!hasFormation || isTransition || isPlaying) && !swapMode);
    // Undo/Redo
    undoBtn.classList.toggle('toolbar__btn--disabled', !canUndo() || isPlaying);
    redoBtn.classList.toggle('toolbar__btn--disabled', !canRedo() || isPlaying);
  };
  _updateToolbarState();

  addBtn.addEventListener('click', () => {
    if (guardPlaying()) return;
    const newStart = floorTime(currentMs);

    // Find max available space at newStart
    let maxDuration = noteData.note.duration - newStart;
    for (const f of noteData.formations) {
      if (f.startTime > newStart) {
        maxDuration = Math.min(maxDuration, f.startTime - newStart);
      }
      if (newStart >= f.startTime && newStart < f.startTime + f.duration) {
        maxDuration = 0;
        break;
      }
    }

    const duration = Math.min(DEFAULT_FORMATION_DURATION, floorTime(maxDuration));
    if (duration < MIN_FORMATION_DURATION) {
      showToast(t('toastOverlap'));
      return;
    }

    const newFormation = {
      id: Date.now(),
      noteId: noteData.note.id,
      startTime: newStart,
      duration,
      order: noteData.formations.length,
      positions: (() => {
        const currentPositions = engine.calcPositionsAt(currentMs);
        return noteData.dancers.map((d, i) => {
          const cp = currentPositions[i] || {};
          return {
            dancerId: d.id,
            x: Math.round(cp.x || 0),
            y: Math.round(cp.y || 0),
            angle: cp.angle || 0,
          };
        });
      })(),
    };
    noteData.formations.push(newFormation);
    noteData.formations.sort((a, b) => a.startTime - b.startTime);

    selectedFormation = noteData.formations.indexOf(newFormation);
    engine.setFormations(noteData.formations, noteData.dancers);

    const formationsEl = container.querySelector('#timeline-formations');
    renderFormationBoxes(formationsEl);
    updateStage(); saveSnapshot();
    showToast(t('toastFormationAdded'));
  });

  delBtn.addEventListener('click', () => {
    if (guardPlaying()) return;
    if (noteData.formations.length <= 1) {
      showToast(t('toastMinFormation'));
      return;
    }
    if (!confirm(t('confirmDeleteFormation'))) return;
    noteData.formations.splice(selectedFormation, 1);
    selectedFormation = findFormationIdxAtTime(noteData.formations, currentMs);
    selectedFormations.clear();
    if (selectedFormation >= 0) selectedFormations.add(selectedFormation);
    engine.setFormations(noteData.formations, noteData.dancers);

    const formationsEl = container.querySelector('#timeline-formations');
    renderFormationBoxes(formationsEl);
    updateStage(); saveSnapshot();
    showToast(t('toastFormationDeleted'));
  });

  copyBtn.addEventListener('click', () => {
    if (guardPlaying()) return;
    if (selectedFormation < 0) {
      showToast(t('toastCopySelect'));
      return;
    }
    const f = noteData.formations[selectedFormation];
    copiedPositions = f.positions.map((p) => ({ dancerId: p.dancerId, x: p.x, y: p.y, angle: p.angle || 0 }));
    showToast(t('toastCopied'));
    _updateToolbarState();
  });

  pasteBtn.addEventListener('click', () => {
    if (guardPlaying()) return;
    if (!copiedPositions) {
      showToast(t('toastNoCopy'));
      return;
    }

    if (selectedFormation >= 0) {
      // Paste into existing formation
      const f = noteData.formations[selectedFormation];
      for (const pos of f.positions) {
        const copied = copiedPositions.find((c) => c.dancerId === pos.dancerId);
        if (copied) {
          pos.x = copied.x;
          pos.y = copied.y;
          pos.angle = copied.angle || 0;
        }
      }
      updateStage(); saveSnapshot();
      showToast(t('toastPasted'));
    } else {
      // Empty space: create new formation with copied positions
      const newStart = floorTime(currentMs);
      const overlaps = noteData.formations.some((f) =>
        newStart < f.startTime + f.duration && newStart + PASTE_FORMATION_DURATION > f.startTime
      );
      if (overlaps) {
        showToast(t('toastOverlap'));
        return;
      }

      const newFormation = {
        id: Date.now(),
        noteId: noteData.note.id,
        startTime: newStart,
        duration: PASTE_FORMATION_DURATION,
        order: noteData.formations.length,
        positions: copiedPositions.map((p) => ({ ...p })),
      };
      noteData.formations.push(newFormation);
      noteData.formations.sort((a, b) => a.startTime - b.startTime);

      selectedFormation = noteData.formations.indexOf(newFormation);
      engine.setFormations(noteData.formations, noteData.dancers);

      const formationsEl = container.querySelector('#timeline-formations');
      renderFormationBoxes(formationsEl);
      updateStage(); saveSnapshot();
      showToast(t('toastPastedNew'));
    }
  });

  // Keyboard shortcuts for copy/paste (스테이지 포커스 → 댄서 위치, 타임라인 포커스 → 대형)
  document.addEventListener('keydown', (e) => {
    if (_onboardingActive) return;
    if (e.target.tagName === 'INPUT') return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
      if (_focusedArea === 'stage') {
        copyDancerPosition();
      } else {
        copyBtn.click();
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
      e.preventDefault();
      if (_focusedArea === 'stage') {
        pasteDancerPosition();
      } else {
        pasteBtn.click();
      }
    }
  });

  // Swap mode
  swapMode = false;
  let swapFirst = -1;
  const swapBanner = container.querySelector('#stage-swap-banner');

  setSwapMode = (on) => {
    swapMode = on;
    swapFirst = -1;
    swapBtn.classList.toggle('toolbar__btn--active', on);
    swapBanner.classList.toggle('stage-swap-banner--visible', on);
    stageContainer.classList.toggle('stage-container--swap', on);
    renderer._swapHighlight.clear();
    if (on) {
      swapBanner.textContent = t('swapBanner');
      renderer._selectedDancers.clear();
      renderer.onDancerSelect?.(-1);
      if (_renderPresetThumbnails) _renderPresetThumbnails();
    }
    updateStage();
  };

  function updateSwapBanner(text) {
    swapBanner.textContent = text;
  }

  swapBtn.addEventListener('click', () => {
    if (!swapMode && engine.isPlaying) {
      showToast(t('toastStopFirst'));
      return;
    }
    if (!swapMode && (selectedTransition || selectedFormation < 0)) {
      showToast(t('toastSelectFormation'));
      return;
    }
    setSwapMode(!swapMode);
  });

  swapBanner.addEventListener('click', () => setSwapMode(false));

  // Zoom badge
  const zoomBadge = container.querySelector('#stage-zoom-badge');
  renderer.onZoomChange = (zoom) => {
    if (zoom === 1.0) {
      zoomBadge.classList.remove('stage-zoom-badge--visible');
    } else {
      zoomBadge.textContent = `${Math.round(zoom * 100)}%`;
      zoomBadge.classList.add('stage-zoom-badge--visible');
    }
  };
  zoomBadge.addEventListener('click', () => renderer.resetZoom());

  renderer.onDancerSelect = (dancerIndex) => {
    // Always update stage to refresh waypoint path filtering
    if (selectedTransition) updateStage();

    // Sync sidebar dancer list highlight with stage selection
    const dancerList = document.querySelector('#dancer-list');
    if (dancerList) {
      dancerList.querySelectorAll('.dancer-item').forEach(el => {
        const idx = Number(el.dataset.index);
        el.classList.toggle('dancer-item--selected', renderer._selectedDancers.has(idx));
      });
    }

    // Inspector: update content when dancers selected/deselected (don't auto-open panel)
    if (renderer._selectedDancers.size > 0 || activePanel === 'inspector') {
      updateInspector();
    }

    // Update preset thumbnails to reflect selection (skip in swap mode)
    if (!swapMode && _renderPresetThumbnails) _renderPresetThumbnails();

    if (!swapMode) return;
    // Prevent real selection in swap mode
    renderer._selectedDancers.clear();
    updateInspector();
    if (dancerIndex < 0) {
      if (swapFirst >= 0) {
        swapFirst = -1;
        renderer._swapHighlight.clear();
        updateStage();
        updateSwapBanner(t('swapBanner'));
      }
      return;
    }
    if (selectedFormation < 0) {
      showToast(t('toastSelectFormation'));
      return;
    }

    if (swapFirst < 0) {
      swapFirst = dancerIndex;
      renderer._swapHighlight.clear();
      renderer._swapHighlight.add(dancerIndex);
      updateStage();
      updateSwapBanner(t('swapFirst', { name: noteData.dancers[dancerIndex].name }));
    } else {
      if (swapFirst === dancerIndex) {
        swapFirst = -1;
        renderer._swapHighlight.clear();
        updateStage();
        updateSwapBanner(t('swapBanner'));
        return;
      }
      // Swap with animation
      const f = noteData.formations[selectedFormation];
      const d1 = noteData.dancers[swapFirst];
      const d2 = noteData.dancers[dancerIndex];
      const pos1 = f.positions.find(p => p.dancerId === d1.id);
      const pos2 = f.positions.find(p => p.dancerId === d2.id);
      if (pos1 && pos2) {
        const from1 = { x: pos1.x, y: pos1.y };
        const from2 = { x: pos2.x, y: pos2.y };
        const duration = 300;
        const start = performance.now();

        renderer._swapHighlight.clear();
        renderer._swapHighlight.add(swapFirst);
        renderer._swapHighlight.add(dancerIndex);

        const animate = (now) => {
          const t = Math.min((now - start) / duration, 1);
          const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out
          pos1.x = from1.x + (from2.x - from1.x) * ease;
          pos1.y = from1.y + (from2.y - from1.y) * ease;
          pos2.x = from2.x + (from1.x - from2.x) * ease;
          pos2.y = from2.y + (from1.y - from2.y) * ease;
          updateStage();
          if (t < 1) {
            requestAnimationFrame(animate);
          } else {
            // Finalize
            pos1.x = Math.round(from2.x); pos1.y = Math.round(from2.y);
            pos2.x = Math.round(from1.x); pos2.y = Math.round(from1.y);
            const oldPositions = new Map([[d1.id, from1], [d2.id, from2]]);
            recalcWaypoints([d1.id, d2.id], selectedFormation, oldPositions);
            renderer._swapHighlight.clear();
            updateStage(); saveSnapshot();
            showToast(t('swapDone', { a: d1.name, b: d2.name }));
          }
        };
        requestAnimationFrame(animate);
      }

      // Ready for next swap
      swapFirst = -1;
      updateSwapBanner(t('swapBanner'));
    }
  };

  // Snap toggle
  const snapBtn = container.querySelector('#snap-btn');
  snapBtn.addEventListener('click', () => {
    renderer.isSnap = !renderer.isSnap;
    snapBtn.classList.toggle('toolbar__btn--active', renderer.isSnap);
  });

  // View mode functions (used by sidebar view panel)
  const banner3d = container.querySelector('#stage-3d-banner');

  function _transitionView(fn) {
    const was3D = renderer.is3D;
    if (was3D) {
      renderer._force2DRender = true;
      updateStage();
    }
    fn();
    fitStage();
    updateBanner();
    updateViewButtons();
    updateStage();
    if (was3D || renderer.is3D) {
      renderer._force2DRender = true;
      updateStage();
      setTimeout(() => {
        renderer._force2DRender = false;
        updateStage();
      }, 420);
    }
  }

  function toggle3D(forceOff) {
    _transitionView(() => {
      const is3D = forceOff ? false : !renderer.is3D;
      renderer.set3D(is3D, 'css');
      if (is3D) renderer._selectedDancers.clear();
    });
  }

  function updateViewButtons() {
    const t3d = container.querySelector('#sidebar-3d-toggle');
    if (t3d) t3d.classList.toggle('toggle-switch--on', renderer.is3D);
  }

  const stageContainer = container.querySelector('.stage-container');

  function updateBanner() {
    const is3D = renderer.is3D;
    const visible = is3D;
    let text = '';
    if (is3D) text = t('preview3d') + ' ' + t('previewExit');
    banner3d.textContent = text;
    banner3d.classList.toggle('stage-3d-banner--visible', visible);
    stageContainer.classList.toggle('stage-container--preview', visible);
  }

  banner3d.addEventListener('click', () => {
    if (renderer.is3D) toggle3D(true);
  });

  // Esc key exits preview/swap mode; 3 toggles 3D view
  document.addEventListener('keydown', (e) => {
    if (_onboardingActive) return;
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') {
      if (swapMode) { setSwapMode(false); return; }
      if (renderer.is3D) toggle3D(true);
    }
    if (e.code === 'Digit3' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggle3D();
    }
  });

  // Sidebar rail: icon click toggles panels
  const sidebar = container.querySelector('#sidebar');
  const railIcons = container.querySelectorAll('.sidebar-rail__icon');
  const panels = {
    dancers: container.querySelector('#panel-dancers'),
    presets: container.querySelector('#panel-presets'),
    view: container.querySelector('#panel-view'),
    help: container.querySelector('#panel-help'),
    settings: container.querySelector('#panel-settings'),
    inspector: container.querySelector('#panel-inspector'),
    markers: container.querySelector('#panel-markers'),
  };
  activePanel = 'dancers';

  const editorGrid = container.querySelector('.editor');

  function closePanel() {
    sidebar.classList.add('editor__sidebar--hidden');
    railIcons.forEach(ic => ic.classList.remove('sidebar-rail__icon--active'));
    activePanel = null;
    overlay.classList.remove('sidebar-overlay--visible');
    if (editorGrid) editorGrid.classList.remove('editor--sidebar-open');
    setTimeout(fitStage, 260);
  }

  openPanel = (name) => {
    if (activePanel === name && !sidebar.classList.contains('editor__sidebar--hidden')) {
      closePanel();
      return;
    }
    // Open/switch panel
    sidebar.classList.remove('editor__sidebar--hidden');
    Object.values(panels).forEach(p => p.classList.add('sidebar__panel--hidden'));
    if (panels[name]) panels[name].classList.remove('sidebar__panel--hidden');
    railIcons.forEach(ic => ic.classList.toggle('sidebar-rail__icon--active', ic.dataset.panel === name));
    activePanel = name;
    if (name === 'inspector') updateInspector();
    if (name === 'presets' && _renderPresetThumbnails) _renderPresetThumbnails();
    if (name === 'presets' && _renderBasket) _renderBasket();
    if (window.innerWidth <= 768) {
      overlay.classList.add('sidebar-overlay--visible');
    } else {
      if (editorGrid) editorGrid.classList.add('editor--sidebar-open');
      setTimeout(fitStage, 260);
    }
  };

  railIcons.forEach(ic => {
    ic.addEventListener('click', () => openPanel(ic.dataset.panel));
  });

  // View mode toggles
  const toggle3dEl = container.querySelector('#sidebar-3d-toggle');
  toggle3dEl.addEventListener('click', () => toggle3D());

  // Wing area toggle — now in view panel
  const toggleWingEl = container.querySelector('#view-wing-toggle');
  toggleWingEl.addEventListener('click', () => {
    if (engine.isPlaying) { showToast(t('toastStopFirst')); return; }
    const show = !renderer.showWings;
    renderer.showWings = show;
    toggleWingEl.classList.toggle('toggle-switch--on', show);
    renderer._drawGridCache();

    // When hiding wings, move offstage dancers into the stage
    if (!show) {
      let moved = 0;
      for (const f of noteData.formations) {
        for (const pos of f.positions) {
          const margin = 10;
          if (pos.x < -HALF_W) { pos.x = -HALF_W + margin; moved++; }
          else if (pos.x > HALF_W) { pos.x = HALF_W - margin; moved++; }
          if (pos.y < -HALF_H) { pos.y = -HALF_H + margin; moved++; }
          else if (pos.y > HALF_H) { pos.y = HALF_H - margin; moved++; }
        }
      }
      if (moved > 0) {
        engine.setFormations(noteData.formations, noteData.dancers);
        saveSnapshot();
      }
    }

    updateStage();
    showToast(show ? t('toastWingShow') : t('toastWingHide'));
  });

  // Display options (number / name / none)
  const displayOptions = container.querySelector('#sidebar-display-options');
  // 저장된 displayMode에 맞춰 초기 active 버튼 동기화 (기본 HTML은 'number' 고정이라 재진입 시 UI와 renderer 어긋남)
  const currentDisplay = renderer.showNumbers ? 'number' : (renderer.showNames ? 'name' : 'none');
  displayOptions.querySelectorAll('.settings-option').forEach(b => {
    b.classList.toggle('settings-option--active', b.dataset.display === currentDisplay);
  });
  displayOptions.querySelectorAll('[data-display]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.display;
      renderer.showNames = mode === 'name';
      renderer.showNumbers = mode === 'number';
      noteData.note.displayMode = mode;
      unsaved = true;
      displayOptions.querySelectorAll('.settings-option').forEach(b => b.classList.remove('settings-option--active'));
      btn.classList.add('settings-option--active');
      updateStage();
    });
  });

  // Dancer shape options (view panel)
  const viewShapeOptions = container.querySelector('#view-shape-options');
  viewShapeOptions.querySelectorAll('.settings-option').forEach(b => {
    b.classList.toggle('settings-option--active', b.dataset.shape === renderer.dancerShape);
  });
  viewShapeOptions.querySelectorAll('[data-shape]').forEach(btn => {
    btn.addEventListener('click', () => {
      renderer.dancerShape = btn.dataset.shape;
      unsaved = true;
      viewShapeOptions.querySelectorAll('.settings-option').forEach(b => b.classList.remove('settings-option--active'));
      btn.classList.add('settings-option--active');
      updateStage();
    });
  });

  // Grid gap options (view panel)
  const viewGridOptions = container.querySelector('#view-grid-options');
  viewGridOptions.querySelectorAll('.settings-option').forEach(b => {
    b.classList.toggle('settings-option--active', Number(b.dataset.grid) === renderer.gridGap);
  });
  viewGridOptions.querySelectorAll('[data-grid]').forEach(btn => {
    btn.addEventListener('click', () => {
      renderer.gridGap = Number(btn.dataset.grid);
      unsaved = true;
      renderer._drawGridCache();
      updateStage();
      viewGridOptions.querySelectorAll('.settings-option').forEach(b => b.classList.remove('settings-option--active'));
      btn.classList.add('settings-option--active');
    });
  });

  // Mobile overlay
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }
  overlay.addEventListener('click', closePanel);

  // 모바일 바텀시트: 상단 핸들 잡고 아래로 드래그하면 닫힘
  const HANDLE_ZONE = 36;
  const DISMISS_THRESHOLD = 60;
  let dragState = null;
  sidebar.addEventListener('touchstart', (e) => {
    if (window.innerWidth > 768) return;
    if (sidebar.classList.contains('editor__sidebar--hidden')) return;
    const touch = e.touches[0];
    const rect = sidebar.getBoundingClientRect();
    if (touch.clientY - rect.top > HANDLE_ZONE) return;
    dragState = { startY: touch.clientY, lastY: touch.clientY };
    sidebar.style.transition = 'none';
  }, { passive: true });
  sidebar.addEventListener('touchmove', (e) => {
    if (!dragState) return;
    const touch = e.touches[0];
    const dy = Math.max(0, touch.clientY - dragState.startY);
    dragState.lastY = touch.clientY;
    sidebar.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  const endDrag = () => {
    if (!dragState) return;
    const dy = dragState.lastY - dragState.startY;
    sidebar.style.transition = '';
    sidebar.style.transform = '';
    dragState = null;
    if (dy > DISMISS_THRESHOLD) closePanel();
  };
  sidebar.addEventListener('touchend', endDrag);
  sidebar.addEventListener('touchcancel', endDrag);

  // Start hidden on mobile
  if (window.innerWidth <= 768) {
    sidebar.classList.add('editor__sidebar--hidden');
    railIcons.forEach(ic => ic.classList.remove('sidebar-rail__icon--active'));
    activePanel = null;
  }

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      overlay.classList.remove('sidebar-overlay--visible');
    } else {
      closePanel();
    }
  });
}

// --- Markers ---
function setupMarkers(container, noteId) {
  // Load markers from noteData
  renderer.markers = noteData.note.markers || [];
  renderer.showMarkers = true;

  const markerBanner = container.querySelector('#stage-marker-banner');
  const editToggle = container.querySelector('#marker-edit-toggle');
  const showToggle = container.querySelector('#marker-show-toggle');
  const addBtn = container.querySelector('#add-marker-btn');
  const listEl = container.querySelector('#marker-list');

  function setMarkerEditMode(on) {
    renderer.markerEditMode = on;
    renderer._selectedMarker = -1;
    editToggle.classList.toggle('toggle-switch--on', on);
    markerBanner.classList.toggle('stage-marker-banner--visible', on);
    updateStage();
  }

  function renderMarkerList() {
    if (renderer.markers.length === 0) {
      listEl.innerHTML = `<div class="inspector-empty"><div class="inspector-empty__icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg></div><div class="inspector-empty__text">${t('markerEmpty')}</div></div>`;
      return;
    }
    listEl.innerHTML = renderer.markers.map((m, i) => `
      <div class="marker-item${renderer._selectedMarker === i ? ' marker-item--selected' : ''}" data-idx="${i}">
        <canvas class="marker-item__icon" data-marker-idx="${i}" width="24" height="24"></canvas>
        <input class="marker-item__label" value="${m.label || ''}" placeholder="${t('markerLabel')}" data-label-idx="${i}" />
        <select class="marker-item__type" data-type-idx="${i}">
          <option value="x"${m.type === 'x' ? ' selected' : ''}>${t('markerTypeX')}</option>
          <option value="rect"${m.type === 'rect' ? ' selected' : ''}>${t('markerTypeRect')}</option>
          <option value="circle"${m.type === 'circle' ? ' selected' : ''}>${t('markerTypeCircle')}</option>
        </select>
        <button class="marker-item__delete" data-del-idx="${i}" title="${t('deleteMarker')}">✕</button>
      </div>
    `).join('');

    // Draw mini icons on canvases
    listEl.querySelectorAll('canvas[data-marker-idx]').forEach(c => {
      const idx = Number(c.dataset.markerIdx);
      const m = renderer.markers[idx];
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 24, 24);
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      if (m.type === 'x') {
        renderer._drawMarkerIcon(ctx, 12, 12, 6, 'x');
      } else if (m.type === 'circle') {
        ctx.beginPath();
        ctx.arc(12, 12, 7, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(5, 6, 14, 12);
      }
    });

    // Label input
    listEl.querySelectorAll('[data-label-idx]').forEach(input => {
      input.addEventListener('change', () => {
        const idx = Number(input.dataset.labelIdx);
        renderer.markers[idx].label = input.value;
        saveMarkers();
        updateStage();
      });
    });

    // Type select
    listEl.querySelectorAll('[data-type-idx]').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = Number(sel.dataset.typeIdx);
        const m = renderer.markers[idx];
        const oldIsPoint = renderer._isPointMarker(m.type);
        m.type = sel.value;
        const newIsPoint = renderer._isPointMarker(m.type);
        // Apply default size when switching to/from prop type
        if (!newIsPoint) {
          const defaults = renderer.constructor.MARKER_DEFAULTS[m.type];
          if (defaults) { m.width = defaults.w; m.height = defaults.h; }
        } else {
          delete m.width; delete m.height;
        }
        saveMarkers();
        updateStage();
        renderMarkerList();
      });
    });

    // Delete
    listEl.querySelectorAll('[data-del-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.delIdx);
        renderer.markers.splice(idx, 1);
        if (renderer._selectedMarker >= renderer.markers.length) renderer._selectedMarker = -1;
        saveMarkers();
        renderMarkerList();
        updateStage();
        showToast(t('toastMarkerDeleted'));
      });
    });

    // Click to select (only in edit mode)
    listEl.querySelectorAll('.marker-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.marker-item__delete') || e.target.closest('input') || e.target.closest('select')) return;
        const idx = Number(el.dataset.idx);
        renderer._selectedMarker = renderer._selectedMarker === idx ? -1 : idx;
        renderMarkerList();
        updateStage();
      });
    });
  }

  function saveMarkers() {
    noteData.note.markers = renderer.markers;
    unsaved = true;
    saveSnapshot();
  }

  // Show toggle
  showToggle.addEventListener('click', () => {
    renderer.showMarkers = !renderer.showMarkers;
    showToggle.classList.toggle('toggle-switch--on', renderer.showMarkers);
    if (!renderer.showMarkers && renderer.markerEditMode) setMarkerEditMode(false);
    updateStage();
  });

  // Edit toggle
  editToggle.addEventListener('click', () => {
    if (!renderer.showMarkers) {
      renderer.showMarkers = true;
      showToggle.classList.toggle('toggle-switch--on', true);
    }
    setMarkerEditMode(!renderer.markerEditMode);
  });

  // Banner click exits edit mode
  markerBanner.addEventListener('click', () => setMarkerEditMode(false));

  // Add marker
  addBtn.addEventListener('click', () => {
    const newMarker = {
      id: Date.now(),
      x: 0,
      y: 0,
      type: 'x',
      label: '',
    };
    renderer.markers.push(newMarker);
    renderer._selectedMarker = renderer.markers.length - 1;
    if (!renderer.markerEditMode) setMarkerEditMode(true);
    saveMarkers();
    renderMarkerList();
    updateStage();
    showToast(t('toastMarkerAdded'));
  });

  // Renderer callback: when marker is moved/selected
  renderer.onMarkerChange = () => {
    saveMarkers();
    renderMarkerList();
  };

  // Initial render
  renderMarkerList();
  _renderMarkerList = renderMarkerList;
}

// --- Header ---
function setupHeader(container, noteId) {
  container.querySelector('#back-btn').addEventListener('click', () => navigate('/dashboard'));

  async function saveToDB(silent = false) {
    const title = container.querySelector('#title-input').value;
    await NoteStore.updateNoteTitle(noteId, title);
    await NoteStore.saveNote(noteId, {
      stageWidth: STAGE_WIDTH,
      stageHeight: STAGE_HEIGHT,
      duration: noteData.note.duration,
      dancerScale: noteData.note.dancerScale || 1,
      audienceDirection,
      dancerShape: renderer.dancerShape,
      gridGap: renderer.gridGap,
      showWings: renderer.showWings,
      displayMode: renderer.showNumbers ? 'number' : (renderer.showNames ? 'name' : 'none'),
      markers: renderer.markers,
      dancers: noteData.dancers.map((d) => ({ name: d.name, color: d.color })),
      formations: noteData.formations.map((f) => ({
        startTime: f.startTime,
        duration: f.duration,
        positions: f.positions.map((p) => ({
          dancerIndex: noteData.dancers.findIndex((d) => d.id === p.dancerId),
          x: p.x,
          y: p.y,
          angle: p.angle || 0,
          waypoints: p.waypoints || undefined,
        })),
      })),
    });
    unsaved = false;
    if (!silent) showToast(t('toastSaved'));

    // 클라우드 동기화 (로그인 시)
    syncToCloud(noteId, silent);
  }

  async function syncToCloud(noteId, silent) {
    try {
      const user = await getCurrentUser();
      if (!user) return;

      const raw = await db.notes.get(noteId);
      if (!raw || raw.location !== 'cloud') return;

      // 최초 업로드 직전 음악 파일 제외 안내 (세션당 1회)
      if (!raw.cloudId && !sessionStorage.getItem(`cloud-notice-${noteId}`)) {
        sessionStorage.setItem(`cloud-notice-${noteId}`, '1');
        showToast(t('cloudFirstSync'), 4000);
      }

      const result = await uploadOnSave(noteId);
      if (!result) return;

      if (result.conflict) {
        const jsonStr = await NoteStore.exportJSON(noteId);
        const localNoteJson = JSON.parse(jsonStr);
        const action = await showConflictModal({
          serverNote: result.serverNote,
          localNoteJson,
          localEditedAt: raw.editedAt,
        });

        if (action === 'overwrite') {
          await resolveOverwriteServer(noteId);
          showToast(t('cloudUploaded'));
        } else if (action === 'use-server') {
          await resolveUseServer(noteId, result.serverNote);
          navigate(`/edit/${noteId}`);
        } else if (action === 'keep-both') {
          await resolveKeepBoth(noteId, result.serverNote);
          showToast(t('cloudUploaded'));
        }
        // cancel → 아무것도 안 함
      }
    } catch (err) {
      console.warn('Cloud sync failed:', err);
      if (!silent) showToast(t('cloudUploadFail'), 3000);
    }
  }

  container.querySelector('#save-btn').addEventListener('click', () => saveToDB());

  // 긴급 재시작 — 2-step confirm (3초 이내 연속 2번 클릭)
  const emergencyBtn = container.querySelector('#emergency-restart-btn');
  const emergencyLabel = t('emergencyRestart');
  const emergencyArmedLabel = t('emergencyRestartArmed');
  let emergencyArmed = false;
  let emergencyTimer = null;
  const resetEmergency = () => {
    emergencyArmed = false;
    emergencyBtn.classList.remove('editor__emergency--armed');
    emergencyBtn.setAttribute('aria-label', emergencyLabel);
    if (emergencyTimer) { clearTimeout(emergencyTimer); emergencyTimer = null; }
  };
  emergencyBtn.addEventListener('click', async () => {
    if (!emergencyArmed) {
      emergencyArmed = true;
      emergencyBtn.classList.add('editor__emergency--armed');
      emergencyBtn.setAttribute('aria-label', emergencyArmedLabel);
      showToast(emergencyArmedLabel, 3000);
      emergencyTimer = setTimeout(resetEmergency, 3000);
      return;
    }
    resetEmergency();
    try { await saveToDB(true); } catch (_) {}
    try { engine?.destroy(); } catch (_) {}
    location.reload();
  });

  // Auto-save every 30 seconds when there are unsaved changes
  let autoSaveEnabled = true;
  let autoSaveInterval = setInterval(async () => {
    if (autoSaveEnabled && unsaved) {
      await saveToDB(true);
      showToast(t('toastAutoSaved'), 1500);
    }
  }, 30000);

  // Smart guide toggle
  const smartGuideToggle = container.querySelector('#smart-guide-toggle');
  smartGuideToggle.addEventListener('click', () => {
    renderer.smartGuide = !renderer.smartGuide;
    smartGuideToggle.classList.toggle('toggle-switch--on', renderer.smartGuide);
  });

  // Auto-save toggle
  const autoSaveToggle = container.querySelector('#autosave-toggle');
  autoSaveToggle.addEventListener('click', () => {
    autoSaveEnabled = !autoSaveEnabled;
    autoSaveToggle.classList.toggle('toggle-switch--on', autoSaveEnabled);
  });

  // Clean up interval + tear down audio when leaving editor
  // engine.destroy() 누락 시 sourceNode가 살아남아 재진입 후 새 engine과 노래 중첩
  const cleanupOnLeave = () => {
    clearInterval(autoSaveInterval);
    try { engine?.destroy(); } catch (_) {}
  };
  window.addEventListener('hashchange', cleanupOnLeave, { once: true });

  // Export JSON moved to settings panel

  // Video export
  const videoExporter = new VideoExporter();
  const exportVideoBtn = container.querySelector('#export-video-btn');

  // Export progress overlay
  const progressOverlay = document.createElement('div');
  progressOverlay.className = 'export-overlay';

  exportVideoBtn.addEventListener('click', () => {
    if (videoExporter.isExporting) return;
    if (engine.isPlaying) engine.pause();
    const is3D = renderer.is3D;
    const viewMode = is3D ? '3D' : '2D';
    const descParts = [viewMode];
    descParts.push(t('exportAudience', { dir: audienceDirection === 'bottom' ? '↓' : '↑' }));
    progressOverlay.innerHTML = `
      <div class="export-overlay__box">
        <div class="export-overlay__text">${t('exportProgress')}</div>
        <div class="export-overlay__desc">${descParts.join(' · ')}</div>
        <div class="export-overlay__progress" id="export-progress">0%</div>
        <button class="btn btn--danger" id="export-cancel-btn">${t('cancel')}</button>
      </div>
    `;
    startExport(is3D);
  });

  function startExport(is3D) {
    container.appendChild(progressOverlay);
    const progressEl = progressOverlay.querySelector('#export-progress');
    progressEl.textContent = '0%';
    progressOverlay.querySelector('#export-cancel-btn').onclick = () => {
      videoExporter.cancel();
      progressOverlay.remove();
      showToast(t('exportCancelled'));
    };

    videoExporter.export({
      dancers: noteData.dancers,
      formations: noteData.formations,
      audioBlob: noteData.musicBlob,
      duration: noteData.note.duration,
      is3D,
      audienceDirection,
      showWings: renderer.showWings,
      showNames: renderer.showNames,
      showNumbers: renderer.showNumbers,
      dancerShape: renderer.dancerShape,
      gridGap: renderer.gridGap,
      markers: renderer.showMarkers ? renderer.markers : [],
      dancerScale: renderer.dancerScale,
      onProgress: (percent) => {
        progressEl.textContent = `${percent}%`;
      },
      onComplete: (blob, mimeType) => {
        progressOverlay.remove();
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const title = noteData.note.title || 'choreonote';
        const date = new Date().toISOString().slice(0, 10);
        const suffix = [is3D ? '3D' : '2D'];
        suffix.push(audienceDirection === 'bottom' ? '↓' : '↑');
        a.download = `${title}_${suffix.join('_')}_${date}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('exportDone', { ext: ext.toUpperCase() }));
      },
      onError: (err) => {
        progressOverlay.remove();
        showToast(t('exportFailed') + ' ' + err.message);
      },
    });
  }
}

// --- Settings Panel ---
function setupSettings(container, noteId) {
  // Music change button in settings
  container.querySelector('#settings-music-btn').addEventListener('click', () => {
    container.querySelector('#music-file').click();
  });

  // Stage size options (presets + sliders) — now in view panel
  const stageOptions = container.querySelector('#view-stage-options');
  const stageWidthSlider = container.querySelector('#view-stage-width-slider');
  const stageHeightSlider = container.querySelector('#view-stage-height-slider');
  const stageWidthValue = container.querySelector('#view-stage-width-value');
  const stageHeightValue = container.querySelector('#view-stage-height-value');
  const STAGE_PRESETS = { '400x260': true, '600x400': true, '800x500': true };

  function syncStagePresetButtons() {
    const key = `${STAGE_WIDTH}x${STAGE_HEIGHT}`;
    stageOptions.querySelectorAll('.settings-option').forEach(b => {
      b.classList.toggle('settings-option--active', b.dataset.stage === key);
    });
  }

  function applyStageSize(newW, newH) {
    if (newW === STAGE_WIDTH && newH === STAGE_HEIGHT) return;

    setStageSize(newW, newH);
    renderer.resize();
    fitStage();

    // Clamp positions outside safe area
    const pad = 20;
    const maxX = newW / 2 + WING_SIZE - pad;
    const maxY = newH / 2 + WING_SIZE - pad;
    for (const f of noteData.formations) {
      for (const pos of f.positions) {
        pos.x = clamp(pos.x, -maxX, maxX);
        pos.y = clamp(pos.y, -maxY, maxY);
        if (pos.waypoints) {
          for (const wp of pos.waypoints) {
            wp.x = clamp(wp.x, -maxX, maxX);
            wp.y = clamp(wp.y, -maxY, maxY);
          }
        }
      }
    }

    engine.setFormations(noteData.formations, noteData.dancers);
    renderer._drawGridCache();
    updateStage();

    // Sync UI
    stageWidthSlider.value = newW;
    stageHeightSlider.value = newH;
    stageWidthValue.textContent = newW;
    stageHeightValue.textContent = newH;
    syncStagePresetButtons();
  }

  // Preset buttons
  stageOptions.querySelectorAll('[data-stage]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (engine.isPlaying) { showToast(t('toastStopFirst')); return; }
      const [newW, newH] = btn.dataset.stage.split('x').map(Number);
      if (newW === STAGE_WIDTH && newH === STAGE_HEIGHT) return;
      applyStageSize(newW, newH);
      saveSnapshot();
      showToast(t('toastStageSize', { w: newW, h: newH }));
    });
  });

  // Slider: live preview on input, snapshot on change (mouseup)
  let _sliderStartW = STAGE_WIDTH;
  let _sliderStartH = STAGE_HEIGHT;
  let _sliderDragging = false;

  function onSliderInput() {
    if (engine.isPlaying) {
      stageWidthSlider.value = STAGE_WIDTH;
      stageHeightSlider.value = STAGE_HEIGHT;
      return;
    }
    if (!_sliderDragging) {
      _sliderStartW = STAGE_WIDTH;
      _sliderStartH = STAGE_HEIGHT;
      _sliderDragging = true;
    }
    const newW = Number(stageWidthSlider.value);
    const newH = Number(stageHeightSlider.value);
    stageWidthValue.textContent = newW;
    stageHeightValue.textContent = newH;
    setStageSize(newW, newH);
    renderer.resize();
    fitStage();
    renderer._drawGridCache();
    updateStage();
    syncStagePresetButtons();
  }

  function onSliderChange() {
    if (!_sliderDragging) return;
    _sliderDragging = false;
    const newW = Number(stageWidthSlider.value);
    const newH = Number(stageHeightSlider.value);
    if (newW === _sliderStartW && newH === _sliderStartH) return;

    // Clamp positions that may now be outside bounds
    const pad = 20;
    const maxX = newW / 2 + WING_SIZE - pad;
    const maxY = newH / 2 + WING_SIZE - pad;
    for (const f of noteData.formations) {
      for (const pos of f.positions) {
        pos.x = clamp(pos.x, -maxX, maxX);
        pos.y = clamp(pos.y, -maxY, maxY);
        if (pos.waypoints) {
          for (const wp of pos.waypoints) {
            wp.x = clamp(wp.x, -maxX, maxX);
            wp.y = clamp(wp.y, -maxY, maxY);
          }
        }
      }
    }
    engine.setFormations(noteData.formations, noteData.dancers);
    updateStage();
    saveSnapshot();
    showToast(t('toastStageSize', { w: newW, h: newH }));
  }

  stageWidthSlider.addEventListener('input', onSliderInput);
  stageHeightSlider.addEventListener('input', onSliderInput);
  stageWidthSlider.addEventListener('change', onSliderChange);
  stageHeightSlider.addEventListener('change', onSliderChange);

  // Dancer scale slider
  const dancerScaleSlider = container.querySelector('#view-dancer-scale-slider');
  const dancerScaleValue = container.querySelector('#view-dancer-scale-value');

  dancerScaleSlider.addEventListener('input', () => {
    const pct = Number(dancerScaleSlider.value);
    renderer.dancerScale = pct / 100;
    dancerScaleValue.textContent = pct + '%';
    updateStage();
  });
  dancerScaleSlider.addEventListener('change', () => {
    noteData.note.dancerScale = renderer.dancerScale;
    unsaved = true;
  });

  // Restore saved dancer scale
  if (noteData.note.dancerScale) {
    renderer.dancerScale = noteData.note.dancerScale;
  }

  // Grid and shape moved to view panel

  // Duration
  const durationEl = container.querySelector('#settings-duration');
  container.querySelector('#settings-duration-btn').addEventListener('click', () => {
    const currentSec = Math.round(noteData.note.duration / 1000);
    const input = prompt(t('durationPrompt'), currentSec);
    if (input === null) return;
    const newSec = parseInt(input, 10);
    if (isNaN(newSec) || newSec < 10 || newSec > 600) {
      showToast(t('toastDurationRange'));
      return;
    }
    const newDuration = newSec * 1000;

    // Check for formations that would be outside new duration
    const outsideBoxes = noteData.formations.filter(f => f.startTime >= newDuration);
    if (outsideBoxes.length > 0) {
      if (!confirm(t('durationWarnBoxes', { count: outsideBoxes.length }))) {
        return;
      }
      noteData.formations = noteData.formations.filter(f => f.startTime < newDuration);
      // Also trim formations that partially extend past duration
      for (const f of noteData.formations) {
        if (f.startTime + f.duration > newDuration) {
          f.duration = newDuration - f.startTime;
          if (f.duration < MIN_FORMATION_DURATION) f.duration = MIN_FORMATION_DURATION;
        }
      }
      selectedFormation = -1;
      selectedFormations.clear();
      selectedTransition = null;
    } else {
      // Trim formations that partially extend past duration
      for (const f of noteData.formations) {
        if (f.startTime + f.duration > newDuration) {
          f.duration = newDuration - f.startTime;
          if (f.duration < MIN_FORMATION_DURATION) f.duration = MIN_FORMATION_DURATION;
        }
      }
    }

    noteData.note.duration = newDuration;
    engine.duration = newDuration;
    engine.setFormations(noteData.formations, noteData.dancers);
    durationEl.innerHTML = formatDurationFull(newDuration);
    container.querySelector('#duration-display').textContent = formatTime(newDuration, true);

    const dSec = newDuration / 1000;
    const timelineWidth = TIMELINE_PADDING * 2 + dSec * pixelsPerSec;
    container.querySelector('#timeline').style.width = `${timelineWidth}px`;
    const ruler = container.querySelector('#timeline-ruler');
    ruler.innerHTML = '';
    buildRulerTicks(ruler, dSec);
    renderFormationBoxes(container.querySelector('#timeline-formations'));
    if (currentMs > newDuration) seekTo(0);
    updateTimelineMarker();
    highlightFormation();
    if (noteData.musicBlob) drawWaveform(container, noteData.musicBlob, newDuration);
    saveSnapshot();
    showToast(t('toastDuration', { sec: newSec }));
  });

  // Dancer shape moved to view panel

  // Theme options
  const themeOptions = container.querySelector('#settings-theme-options');
  themeOptions.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      const wantLight = btn.dataset.theme === 'light';
      if (wantLight !== isLightMode()) toggleTheme();
      themeOptions.querySelectorAll('.settings-option').forEach(b => b.classList.remove('settings-option--active'));
      btn.classList.add('settings-option--active');
      renderer._drawGridCache();
      updateStage();
    });
  });

  // Language
  const langOptions = container.querySelector('#settings-lang-options');
  if (langOptions) {
    langOptions.querySelectorAll('[data-lang]').forEach(btn => {
      btn.addEventListener('click', () => {
        setLang(btn.dataset.lang);
        location.reload();
      });
    });
  }

  // Audience direction — now in view panel
  const audienceOptions = container.querySelector('#view-audience-options');
  audienceOptions.querySelectorAll('[data-audience]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (engine.isPlaying) { showToast(t('toastStopFirst')); return; }
      const prevDirection = audienceDirection;
      audienceDirection = btn.dataset.audience;
      renderer.audienceDirection = audienceDirection;
      renderer._drawGridCache();
      audienceOptions.querySelectorAll('.settings-option').forEach(b => b.classList.remove('settings-option--active'));
      btn.classList.add('settings-option--active');

      // Rotate all positions and angles 180° when flipping between top/bottom
      const wasFlipped = prevDirection === 'bottom';
      const isFlipped = audienceDirection === 'bottom';
      if (wasFlipped !== isFlipped) {
        for (const f of noteData.formations) {
          for (const pos of f.positions) {
            pos.x = -pos.x;
            pos.y = -pos.y;
            pos.angle = ((pos.angle || 0) + 180) % 360;
            if (pos.waypoints) {
              for (const wp of pos.waypoints) {
                wp.x = -wp.x;
                wp.y = -wp.y;
              }
            }
          }
        }
        for (const m of renderer.markers) {
          m.x = -m.x;
          m.y = -m.y;
        }
        noteData.note.markers = renderer.markers;
        engine.setFormations(noteData.formations, noteData.dancers);
        _renderMarkerList();
        saveSnapshot();
      }
      updateStage();
      const labels = { top: t('audienceTop'), bottom: t('audienceBottom') };
      showToast(t('toastAudienceDir', { dir: labels[audienceDirection] }));
    });
  });

  // Share link
  container.querySelector('#settings-share-btn').addEventListener('click', async () => {
    try {
      const url = await generateShareURL(noteId);
      if (!url) return;
      await navigator.clipboard.writeText(url);
      showToast(t('toastShareCopied'));
    } catch (err) {
      console.error('Share failed:', err);
      showToast(t('toastShareError'));
    }
  });

  // Export JSON
  container.querySelector('#settings-export-btn').addEventListener('click', async () => {
    const json = await NoteStore.exportJSON(noteId);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${noteData.note.title || 'choreonote'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('toastBackupExported'));
  });

  // Import JSON
  const importFile = container.querySelector('#settings-import-file');
  container.querySelector('#settings-import-btn').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const newNoteId = await NoteStore.importJSON(text);
      navigate(`/edit/${newNoteId}`);
    } catch (err) {
      showToast(t('toastImportError') + ' ' + err.message);
    }
  });
}

// --- Music Upload ---
function setupMusicUpload(container, noteId) {
  const musicBtn = container.querySelector('#music-btn');
  const musicFile = container.querySelector('#music-file');

  musicBtn.addEventListener('click', () => musicFile.click());

  musicFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      showToast(t('toastFileTooLarge'));
      return;
    }

    showToast(t('toastMusicLoading'));

    const blob = new Blob([await file.arrayBuffer()], { type: file.type });

    // Get duration via temporary audio element
    const tempAudio = new Audio();
    tempAudio.src = URL.createObjectURL(blob);
    await new Promise((resolve) => {
      tempAudio.addEventListener('loadedmetadata', resolve);
    });
    const durationMs = Math.floor(tempAudio.duration * 1000);
    URL.revokeObjectURL(tempAudio.src);

    if (durationMs < 10000 || durationMs > 600000) {
      showToast(t('toastMusicDuration'));
      return;
    }

    await NoteStore.saveMusicFile(noteId, blob, file.name, durationMs);
    noteData.note.duration = durationMs;
    noteData.note.musicName = file.name;
    noteData.musicBlob = blob;

    await engine.loadAudio(blob);
    engine.setFormations(noteData.formations, noteData.dancers);

    // Update duration display
    container.querySelector('#duration-display').textContent = formatTime(durationMs, true);
    container.querySelector('#settings-duration').innerHTML = formatDurationFull(durationMs);

    // Rebuild timeline
    const durationSec = durationMs / 1000;
    const timelineWidth = TIMELINE_PADDING * 2 + durationSec * pixelsPerSec;
    const timeline = container.querySelector('#timeline');
    timeline.style.width = `${timelineWidth}px`;

    const ruler = container.querySelector('#timeline-ruler');
    ruler.innerHTML = '';
    buildRulerTicks(ruler, durationSec);

    drawWaveform(container, blob, durationMs);
    const settingsMusicName = container.querySelector('#settings-music-name');
    if (settingsMusicName) {
      settingsMusicName.textContent = truncateFilename(file.name, 35);
      settingsMusicName.title = file.name;
    }
    showToast(t('toastMusicLoaded', { name: file.name }));
  });
}

// --- Helpers ---
function seekTo(ms) {
  if (engine.isPlaying) engine.pause();
  currentMs = ms;
  engine.seek(ms);

  document.querySelector('#time-display').textContent = formatTime(ms, true);
  updateTimelineMarker();

  // Auto-select formation or transition gap
  const prevFormation = selectedFormation;
  const fIdx = noteData.formations.findIndex((f) => ms >= f.startTime && ms < f.startTime + f.duration);
  if (fIdx >= 0) {
    selectedFormation = fIdx;
    if (!selectedFormations.has(fIdx)) {
      selectedFormations.clear();
      selectedFormations.add(fIdx);
    }
    selectedTransition = null;
  } else {
    selectedFormation = -1;
    selectedFormations.clear();
    // Find which gap we're in
    selectedTransition = null;
    for (let i = 0; i < noteData.formations.length - 1; i++) {
      const curEnd = noteData.formations[i].startTime + noteData.formations[i].duration;
      const nextStart = noteData.formations[i + 1].startTime;
      if (ms >= curEnd && ms < nextStart) {
        selectedTransition = { fromIdx: i, toIdx: i + 1 };
        break;
      }
    }
  }
  // 교환 모드: 동선 구간 선택 또는 다른 대형 선택 시 해제
  if (swapMode && (selectedTransition || selectedFormation < 0 || selectedFormation !== prevFormation)) {
    setSwapMode(false);
  }
  renderer.hideHandles = selectedFormation < 0;
  highlightFormation();
  highlightTransition();
  updateStage();

  // Auto-scroll timeline to keep marker visible
  const timelineScroll = document.querySelector('#timeline-scroll');
  if (timelineScroll) {
    const markerPx = TIMELINE_PADDING + ms / 1000 * pixelsPerSec;
    const viewLeft = timelineScroll.scrollLeft;
    const viewRight = viewLeft + timelineScroll.clientWidth;
    const margin = 60;
    if (markerPx < viewLeft + margin) {
      timelineScroll.scrollLeft = markerPx - margin;
    } else if (markerPx > viewRight - margin) {
      timelineScroll.scrollLeft = markerPx - timelineScroll.clientWidth + margin;
    }
  }

  document.querySelector('#play-btn').innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
}

function updateStage() {
  const positions = engine.calcPositionsAt(currentMs);
  renderer.setCurrentState(noteData.dancers, positions);

  // Build waypoint paths for selected transition gap
  renderer._waypointPaths = null;
  if (selectedTransition) {
    const { fromIdx, toIdx } = selectedTransition;
    const fromF = noteData.formations[fromIdx];
    const toF = noteData.formations[toIdx];
    if (fromF && toF) {
      const paths = [];
      const selected = renderer._selectedDancers;
      const hasSelection = selected && selected.size > 0;
      for (let i = 0; i < noteData.dancers.length; i++) {
        if (hasSelection && !selected.has(i)) continue;
        const d = noteData.dancers[i];
        const fromPos = fromF.positions.find(p => p.dancerId === d.id);
        const toPos = toF.positions.find(p => p.dancerId === d.id);
        if (fromPos && toPos) {
          // Auto-create default waypoint at midpoint if none exists
          if (!toPos.waypoints || toPos.waypoints.length === 0) {
            toPos.waypoints = [{
              x: Math.round((fromPos.x + toPos.x) / 2),
              y: Math.round((fromPos.y + toPos.y) / 2),
              t: 0.5,
            }];
          }
          const points = [
            { x: fromPos.x, y: fromPos.y },
            ...toPos.waypoints,
            { x: toPos.x, y: toPos.y },
          ];
          paths.push({ dancerId: d.id, dancerIndex: i, color: d.color, points });
        }
      }
      renderer._waypointPaths = paths;
    }
  }

  renderer.drawFrame(noteData.dancers, positions);

  // Keep inspector in sync when visible
  if (renderer._selectedDancers.size > 0) updateInspector();
}

function updateTimelineMarker() {
  const marker = document.querySelector('#timeline-marker');
  if (marker) {
    marker.style.left = `${TIMELINE_PADDING + currentMs / 1000 * pixelsPerSec}px`;
  }

  // 재생 중 타임마커가 뷰포트를 벗어나려 하면 다음 페이지로 스크롤
  if (!engine.isPlaying) return;
  const timelineScroll = document.querySelector('#timeline-scroll');
  if (!timelineScroll) return;
  const markerPx = TIMELINE_PADDING + currentMs / 1000 * pixelsPerSec;
  const viewLeft = timelineScroll.scrollLeft;
  const viewRight = viewLeft + timelineScroll.clientWidth;
  const margin = 60;
  if (markerPx < viewLeft + margin) {
    timelineScroll.scrollLeft = markerPx - margin;
  } else if (markerPx > viewRight - margin) {
    timelineScroll.scrollLeft = markerPx - timelineScroll.clientWidth + margin;
  }
}

function highlightFormation() {
  document.querySelectorAll('.formation-box').forEach((box, i) => {
    box.classList.toggle('formation-box--selected', selectedFormations.has(i));
    box.classList.toggle('formation-box--active', i === selectedFormation);
  });
  _updateToolbarState();
  if (activePanel === 'presets' && _renderPresetThumbnails) _renderPresetThumbnails();
}

function highlightTransition() {
  updateTransitionConnectors();
}

async function drawWaveform(container, audioBlob, durationMs) {
  const canvas = container.querySelector('#timeline-waveform');
  if (!canvas || !audioBlob) return;

  const durationSec = durationMs / 1000;
  const width = TIMELINE_PADDING * 2 + durationSec * pixelsPerSec;
  const height = 36;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  try {
    const audioCtx = new AudioContext();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    audioCtx.close();

    // Get channel data (mono mix)
    const rawData = audioBuffer.getChannelData(0);
    const audioDurationSec = audioBuffer.duration;
    // Only draw waveform for the audio portion
    const audioDrawWidth = Math.min(durationSec, audioDurationSec) * pixelsPerSec;
    const samplesPerPixel = Math.max(1, Math.floor(rawData.length / audioDrawWidth));

    ctx.fillStyle = 'rgba(78, 205, 196, 0.2)';
    ctx.strokeStyle = 'rgba(78, 205, 196, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const midY = height / 2;

    for (let x = 0; x < audioDrawWidth; x++) {
      const start = x * samplesPerPixel;
      let min = 0;
      let max = 0;
      for (let j = start; j < start + samplesPerPixel && j < rawData.length; j++) {
        if (rawData[j] < min) min = rawData[j];
        if (rawData[j] > max) max = rawData[j];
      }
      const px = TIMELINE_PADDING + x;
      const topY = midY + min * midY;
      const botY = midY + max * midY;
      ctx.fillRect(px, topY, 1, botY - topY);
    }
  } catch (e) {
    // Silently fail if audio decode fails
  }
}

function takeSnapshot() {
  return {
    dancers: noteData.dancers.map(d => ({ ...d })),
    formations: noteData.formations.map(f => ({
      ...f,
      positions: f.positions.map(p => ({ ...p, waypoints: p.waypoints ? p.waypoints.map(w => ({ ...w })) : undefined })),
    })),
    selectedFormation,
    selectedTransition: selectedTransition ? { ...selectedTransition } : null,
    currentMs,
    duration: noteData.note.duration,
    stageWidth: STAGE_WIDTH,
    stageHeight: STAGE_HEIGHT,
    audienceDirection,
    markers: (renderer.markers || []).map(m => ({ ...m })),
  };
}

function saveSnapshot() {
  pushState(takeSnapshot());
  unsaved = true;
  updateFormationDots();
  if (_rotationInProgress) {
    _snapshotDuringRotation = true;
  }
}

function restoreSnapshot(snapshot) {
  if (!snapshot) return;

  // Capture previous formations for dancer diff
  const prevFormations = noteData.formations;

  noteData.dancers = snapshot.dancers;
  noteData.formations = snapshot.formations;

  // Clamp positions to stage bounds when wings are hidden
  if (!renderer.showWings) {
    for (const f of noteData.formations) {
      for (const p of f.positions) {
        p.x = clamp(p.x, -HALF_W, HALF_W);
        p.y = clamp(p.y, -HALF_H, HALF_H);
      }
    }
  }

  // Determine selection based on currentMs position
  selectedFormation = -1;
  selectedTransition = null;
  selectedFormations.clear();
  const sorted = noteData.formations.slice().sort((a, b) => a.startTime - b.startTime);
  for (let i = 0; i < noteData.formations.length; i++) {
    const f = noteData.formations[i];
    if (currentMs >= f.startTime && currentMs < f.startTime + f.duration) {
      selectedFormation = i;
      selectedFormations.add(i);
      break;
    }
  }
  if (selectedFormation < 0) {
    // Check if currentMs is in a transition gap
    for (let i = 0; i < sorted.length - 1; i++) {
      const fromF = sorted[i];
      const toF = sorted[i + 1];
      const gapStart = fromF.startTime + fromF.duration;
      if (currentMs >= gapStart && currentMs < toF.startTime) {
        const fromIdx = noteData.formations.indexOf(fromF);
        const toIdx = noteData.formations.indexOf(toF);
        selectedTransition = { fromIdx, toIdx };
        break;
      }
    }
  }

  // Restore stage size if changed
  if (snapshot.stageWidth && snapshot.stageHeight &&
      (snapshot.stageWidth !== STAGE_WIDTH || snapshot.stageHeight !== STAGE_HEIGHT)) {
    setStageSize(snapshot.stageWidth, snapshot.stageHeight);
    renderer.resize();
    fitStage();
    renderer._drawGridCache();
    // Sync sliders
    const wSlider = document.querySelector('#view-stage-width-slider');
    const hSlider = document.querySelector('#view-stage-height-slider');
    if (wSlider) { wSlider.value = snapshot.stageWidth; document.querySelector('#view-stage-width-value').textContent = snapshot.stageWidth; }
    if (hSlider) { hSlider.value = snapshot.stageHeight; document.querySelector('#view-stage-height-value').textContent = snapshot.stageHeight; }
    const stageOpts = document.querySelector('#view-stage-options');
    if (stageOpts) {
      const key = `${snapshot.stageWidth}x${snapshot.stageHeight}`;
      stageOpts.querySelectorAll('.settings-option').forEach(b => b.classList.toggle('settings-option--active', b.dataset.stage === key));
    }
  }

  // Restore duration if changed
  if (snapshot.duration && snapshot.duration !== noteData.note.duration) {
    noteData.note.duration = snapshot.duration;
    engine.duration = snapshot.duration;
    const dSec = snapshot.duration / 1000;
    const timelineWidth = TIMELINE_PADDING * 2 + dSec * pixelsPerSec;
    const timeline = document.querySelector('#timeline');
    if (timeline) timeline.style.width = `${timelineWidth}px`;
    const ruler = document.querySelector('#timeline-ruler');
    if (ruler) { ruler.innerHTML = ''; buildRulerTicks(ruler, dSec); }
    const durationDisplay = document.querySelector('#duration-display');
    if (durationDisplay) durationDisplay.textContent = formatTime(snapshot.duration, true);
    if (noteData.musicBlob) drawWaveform(document.querySelector('.editor'), noteData.musicBlob, snapshot.duration);
  }

  // Restore audience direction if changed
  if (snapshot.audienceDirection && snapshot.audienceDirection !== audienceDirection) {
    audienceDirection = snapshot.audienceDirection;
    renderer.audienceDirection = audienceDirection;
    renderer._drawGridCache();
    const audienceOptions = document.querySelector('#view-audience-options');
    if (audienceOptions) {
      audienceOptions.querySelectorAll('.settings-option').forEach(b =>
        b.classList.toggle('settings-option--active', b.dataset.audience === audienceDirection)
      );
    }
  }

  // Restore markers if present in snapshot
  if (snapshot.markers) {
    renderer.markers = snapshot.markers.map(m => ({ ...m }));
    noteData.note.markers = renderer.markers;
    _renderMarkerList();
  }

  engine.setFormations(noteData.formations, noteData.dancers);
  engine.seek(currentMs);

  // Select dancers that changed in the affected formation/transition
  renderer._selectedDancers.clear();
  const diffFIdx = selectedTransition ? selectedTransition.toIdx : selectedFormation;
  if (diffFIdx >= 0 && prevFormations[diffFIdx] && noteData.formations[diffFIdx]) {
    const prevPos = prevFormations[diffFIdx].positions;
    const newPos = noteData.formations[diffFIdx].positions;
    for (let i = 0; i < noteData.dancers.length; i++) {
      const d = noteData.dancers[i];
      const pp = prevPos.find(p => p.dancerId === d.id);
      const np = newPos.find(p => p.dancerId === d.id);
      if (!pp && !np) continue;
      if (!pp || !np || pp.x !== np.x || pp.y !== np.y || (pp.angle || 0) !== (np.angle || 0) ||
          JSON.stringify(pp.waypoints) !== JSON.stringify(np.waypoints)) {
        renderer._selectedDancers.add(i);
      }
    }
  }

  // Re-render everything
  const formationsEl = document.querySelector('#timeline-formations');
  renderFormationBoxes(formationsEl);
  const dancerList = document.querySelector('#dancer-list');
  if (dancerList) renderDancerList(dancerList);
  updateStage();
  updateTimelineMarker();
  highlightFormation();
  highlightTransition();
  document.querySelector('#time-display').textContent = formatTime(currentMs, true);
}

function buildRulerTicks(ruler, durationSec) {
  // Determine intervals based on zoom
  // Major (label + tall line): every N seconds
  // Minor (medium line): half of major
  // Sub (short line): quarter of major
  let majorInterval, minorInterval, subInterval;
  if (pixelsPerSec >= 80) {
    majorInterval = 1; minorInterval = 0.5; subInterval = 0.25;
  } else if (pixelsPerSec >= 40) {
    majorInterval = 2; minorInterval = 1; subInterval = 0.5;
  } else if (pixelsPerSec >= 25) {
    majorInterval = 5; minorInterval = 1; subInterval = 0.5;
  } else {
    majorInterval = 10; minorInterval = 5; subInterval = 1;
  }

  for (let t = 0; t <= durationSec; t += subInterval) {
    const px = TIMELINE_PADDING + t * pixelsPerSec;
    const isMajor = Math.abs(t % majorInterval) < 0.001;
    const isMinor = !isMajor && Math.abs(t % minorInterval) < 0.001;

    const line = document.createElement('div');
    line.className = 'timeline__tick-line' + (isMajor ? ' timeline__tick-line--major' : isMinor ? ' timeline__tick-line--minor' : ' timeline__tick-line--sub');
    line.style.left = `${px}px`;
    ruler.appendChild(line);

    if (isMajor) {
      const label = document.createElement('div');
      label.className = 'timeline__tick-label';
      label.style.left = `${px}px`;
      label.textContent = formatTime(t * 1000);
      ruler.appendChild(label);
    }
  }
}

function toggleShortcutHelp(container) {
  let modal = document.querySelector('.shortcut-modal');
  if (modal) {
    modal.remove();
    return;
  }
  modal = document.createElement('div');
  modal.className = 'shortcut-modal';
  modal.innerHTML = `
    <div class="shortcut-modal__box">
      <div class="shortcut-modal__title">${t('shortcutTitle')}</div>
      <div class="shortcut-modal__list">
        <div class="shortcut-row"><kbd>Space</kbd><span>${t('helpPlayPause')}</span></div>
        <div class="shortcut-row"><kbd>←</kbd> <kbd>→</kbd><span>${t('helpSeek')}</span></div>
        <div class="shortcut-row"><kbd>↑</kbd> <kbd>↓</kbd><span>${t('helpPrevNext')}</span></div>
        <div class="shortcut-row"><kbd>N</kbd><span>${t('helpAddFormation')}</span></div>
        <div class="shortcut-row"><kbd>S</kbd><span>${t('helpSnap')}</span></div>
        <div class="shortcut-row"><kbd>+</kbd><span>${t('helpZoomIn')}</span></div>
        <div class="shortcut-row"><kbd>−</kbd><span>${t('helpZoomOut')}</span></div>
        <div class="shortcut-row"><kbd>Tab</kbd><span>${t('helpTabPanel')}</span></div>
        <div class="shortcut-row"><kbd>Delete</kbd><span>${t('helpDeleteFormation')}</span></div>
        <div class="shortcut-row"><kbd>Ctrl+Z</kbd><span>${t('helpUndo')}</span></div>
        <div class="shortcut-row"><kbd>Ctrl+Shift+Z</kbd><span>${t('helpRedo')}</span></div>
        <div class="shortcut-row"><kbd>Ctrl+S</kbd><span>${t('helpSave')}</span></div>
        <div class="shortcut-row"><kbd>Ctrl+A</kbd><span>${t('helpSelectAll')}</span></div>
        <div class="shortcut-row"><kbd>3</kbd><span>${t('help3d')}</span></div>
        <div class="shortcut-row"><kbd>Esc</kbd><span>${t('helpEsc')}</span></div>
        <div class="shortcut-row"><kbd>Ctrl+C</kbd><span>${t('helpCopy')}</span></div>
        <div class="shortcut-row"><kbd>Ctrl+V</kbd><span>${t('helpPaste')}</span></div>
        <div class="shortcut-row"><kbd>Shift+클릭</kbd><span>${t('helpMultiSelect')}</span></div>
        <div class="shortcut-row"><kbd>Shift+휠</kbd><span>${t('helpScroll')}</span></div>
        <div class="shortcut-row"><kbd>?</kbd><span>${t('shortcutHelp')}</span></div>
      </div>
      <button class="btn btn--ghost shortcut-modal__close" id="shortcut-close">${t('close')}</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#shortcut-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

function formatDurationFull(ms) {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')} <span class="settings-sub">${t('durationFull', { sec: totalSec })}</span>`;
}

function truncateFilename(name, maxLen = 20) {
  if (!name || name.length <= maxLen) return name || t('durationNone');
  const ext = name.lastIndexOf('.') >= 0 ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.slice(0, name.length - ext.length);
  const keep = maxLen - ext.length - 3;
  const front = Math.ceil(keep * 0.6);
  const back = keep - front;
  return base.slice(0, front) + '...' + base.slice(-back) + ext;
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// --- Feature Unlock ---
const DISMISSED_BANNERS_KEY = 'choreonote-dismissed-banners';

function getDismissedBanners() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_BANNERS_KEY)) || []; } catch { return []; }
}

function dismissBanner(panel) {
  const dismissed = getDismissedBanners();
  if (!dismissed.includes(panel)) {
    dismissed.push(panel);
    localStorage.setItem(DISMISSED_BANNERS_KEY, JSON.stringify(dismissed));
  }
}

function setupFeatureUnlock(container) {
  const existing = isExistingUser();
  const unlocked = existing ? [...UNLOCK_ORDER] : getUnlockedFeatures();
  const rail = container.querySelector('#sidebar-rail');
  const unlockBtn = container.querySelector('#unlock-btn');

  // Map panel name to its panel element
  const panelMap = {
    inspector: 'panel-inspector',
    presets: 'panel-presets',
    markers: 'panel-markers',
  };

  function applyVisibility() {
    const lockedCount = UNLOCK_ORDER.length - unlocked.length;

    // Mark each icon as unlocked or locked
    rail.querySelectorAll('[data-unlock]').forEach(btn => {
      const feature = btn.dataset.unlock;
      const isUnlocked = unlocked.includes(feature);
      btn.classList.toggle('sidebar-rail__icon--locked', !isUnlocked);
    });

    // Update unlock overlay to cover only locked icons
    if (unlockBtn) {
      if (lockedCount <= 0) {
        unlockBtn.style.display = 'none';
      } else {
        unlockBtn.style.display = '';
        // Set CSS variable so overlay knows how many slots to cover
        unlockBtn.style.setProperty('--locked-count', lockedCount);
      }
    }
  }

  function unlockNext() {
    const nextFeature = UNLOCK_ORDER.find(f => !unlocked.includes(f));
    if (!nextFeature) return;

    unlocked.push(nextFeature);
    localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocked));

    applyVisibility();

    // Show toast
    showToast(t(UNLOCK_TOAST_KEYS[nextFeature]));

    // Open the unlocked panel with description banner
    const panelId = panelMap[nextFeature];
    const panel = container.querySelector(`#${panelId}`);
    if (panel) {
      // Add description banner if not already present
      const existingBanner = panel.querySelector('.unlock-desc-banner');
      if (!existingBanner) {
        const banner = document.createElement('div');
        banner.className = 'unlock-desc-banner';
        banner.innerHTML = `${t(UNLOCK_DESC_KEYS[nextFeature])}<button class="unlock-desc-banner__close">✕</button>`;
        banner.querySelector('.unlock-desc-banner__close').addEventListener('click', () => { dismissBanner(nextFeature); banner.remove(); });
        const title = panel.querySelector('.sidebar__panel-title');
        if (title) title.after(banner);
        else panel.prepend(banner);
      }
      // Switch to unlocked panel
      openPanel(nextFeature === 'view' ? 'view' : nextFeature === 'inspector' ? 'inspector' : nextFeature === 'presets' ? 'presets' : 'markers');
    }
  }

  // Apply initial state
  if (existing) {
    localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocked));
  }
  applyVisibility();

  // Show dancers panel description banner for new users
  if (!existing && !getDismissedBanners().includes('dancers')) {
    const dancersPanel = container.querySelector('#panel-dancers');
    if (dancersPanel && !dancersPanel.querySelector('.unlock-desc-banner')) {
      const banner = document.createElement('div');
      banner.className = 'unlock-desc-banner';
      banner.innerHTML = `${t('unlockDescDancers')}<button class="unlock-desc-banner__close">✕</button>`;
      banner.querySelector('.unlock-desc-banner__close').addEventListener('click', () => { dismissBanner('dancers'); banner.remove(); });
      const title = dancersPanel.querySelector('.sidebar__panel-title');
      if (title) title.after(banner);
      else dancersPanel.prepend(banner);
    }
  }

  // 해금된 패널 중 닫지 않은 배너 복원
  const dismissed = getDismissedBanners();
  for (const feature of unlocked) {
    if (dismissed.includes(feature)) continue;
    const pid = panelMap[feature];
    if (!pid) continue;
    const panel = container.querySelector(`#${pid}`);
    if (!panel || panel.querySelector('.unlock-desc-banner')) continue;
    const banner = document.createElement('div');
    banner.className = 'unlock-desc-banner';
    banner.innerHTML = `${t(UNLOCK_DESC_KEYS[feature])}<button class="unlock-desc-banner__close">✕</button>`;
    banner.querySelector('.unlock-desc-banner__close').addEventListener('click', () => { dismissBanner(feature); banner.remove(); });
    const title = panel.querySelector('.sidebar__panel-title');
    if (title) title.after(banner);
    else panel.prepend(banner);
  }

  // Wire unlock button
  if (unlockBtn) {
    unlockBtn.addEventListener('click', unlockNext);
  }
}

// --- Onboarding Tour ---

function startOnboardingTour(container) {
  if (localStorage.getItem(ONBOARDING_KEY)) return;
  _onboardingActive = true;

  const formationCountAtStart = noteData.formations.length;

  const steps = [
    {
      selector: '#add-formation-btn',
      spotlightSelector: ['#add-formation-btn', '#timeline-formations'],
      interactiveSelector: '#add-formation-btn',
      titleKey: 'tourTimelineTitle',
      descKey: 'tourTimelineDesc',
      showComplete: true,
      onEnter: () => { if (typeof seekTo === 'function') seekTo(2000); },
      // Finger guide: tap on + button
      guide: (guideEl, container) => {
        const btn = container.querySelector('#add-formation-btn');
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        guideEl.className = 'onboarding-guide onboarding-guide--tap';
        guideEl.style.left = (r.left + r.width / 2) + 'px';
        guideEl.style.top = (r.top + r.height / 2) + 'px';
      },
      listen: (advance, onCleanup) => {
        let stopped = false;
        const countAtListen = noteData.formations.length;
        onCleanup(() => { stopped = true; });
        const check = () => {
          if (stopped) return;
          if (noteData.formations.length > countAtListen) { advance(); return; }
          setTimeout(check, 200);
        };
        setTimeout(check, 200);
      },
    },
    {
      selector: '.stage-container',
      interactiveSelector: '.stage-container',
      titleKey: 'tourStageTitle',
      descKey: 'tourStageDesc',
      showComplete: true,
      // Finger guide: drag 3rd dancer (Luna at x=60, y=0) to bottom-right
      guide: (guideEl, container) => {
        const canvas = container.querySelector('#stage-canvas');
        if (!canvas) return;
        const r = canvas.getBoundingClientRect();
        // 3rd dancer canvas ratio: (WING_SIZE + HALF_W + 60) / CANVAS_WIDTH ≈ 0.579
        // (WING_SIZE + HALF_H) / CANVAS_HEIGHT = 0.5
        const startX = r.left + r.width * 0.579;
        const startY = r.top + r.height * 0.5;
        guideEl.className = 'onboarding-guide onboarding-guide--drag';
        guideEl.style.left = startX + 'px';
        guideEl.style.top = startY + 'px';
      },
      listen: (advance, onCleanup) => {
        const origDragEnd = renderer.onDancerDragEnd;
        renderer.onDancerDragEnd = (...args) => {
          origDragEnd?.(...args);
          renderer.onDancerDragEnd = origDragEnd;
          advance();
        };
        onCleanup(() => { renderer.onDancerDragEnd = origDragEnd; });
      },
    },
    {
      selector: '#play-btn',
      spotlightSelector: '.player-bar',
      interactiveSelector: '#play-btn',
      titleKey: 'tourPlayTitle',
      descKey: 'tourPlayDesc',
      showComplete: false,
      onEnter: () => { if (typeof seekTo === 'function') seekTo(0); },
      // Finger guide: tap on play button
      guide: (guideEl, container) => {
        const btn = container.querySelector('#play-btn');
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        guideEl.className = 'onboarding-guide onboarding-guide--tap';
        guideEl.style.left = (r.left + r.width / 2) + 'px';
        guideEl.style.top = (r.top + r.height / 2) + 'px';
      },
      listen: (advance, onCleanup) => {
        const playBtn = container.querySelector('#play-btn');
        if (!playBtn) return;
        const handler = () => { playBtn.removeEventListener('click', handler); advance(); };
        playBtn.addEventListener('click', handler);
        onCleanup(() => { playBtn.removeEventListener('click', handler); });
      },
    },
  ];

  let current = 0;
  let cleanupFn = null;

  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.addEventListener('click', (e) => { e.stopPropagation(); });
  document.body.appendChild(overlay);

  const spotlight = document.createElement('div');
  spotlight.className = 'onboarding-spotlight';
  document.body.appendChild(spotlight);

  const tooltip = document.createElement('div');
  tooltip.className = 'onboarding-tooltip';
  document.body.appendChild(tooltip);

  const guideEl = document.createElement('div');
  guideEl.className = 'onboarding-guide';
  document.body.appendChild(guideEl);

  let _elevatedEl = null;

  function cleanup() {
    if (cleanupFn) { cleanupFn(); cleanupFn = null; }
    guideEl.className = 'onboarding-guide';
    // Reset fixed tooltip size from "완료!" state
    tooltip.style.width = '';
    tooltip.style.height = '';
    tooltip.classList.remove('onboarding-tooltip--complete');
    // Restore previously elevated element
    if (_elevatedEl) {
      _elevatedEl.style.position = '';
      _elevatedEl.style.zIndex = '';
      _elevatedEl = null;
    }
  }

  function advance() {
    cleanup();
    const step = steps[current];
    if (step.showComplete) {
      // Show "완료!" message for 1 second before advancing
      guideEl.className = 'onboarding-guide';
      // Fix tooltip size before replacing content
      const tr = tooltip.getBoundingClientRect();
      tooltip.style.width = tr.width + 'px';
      tooltip.style.height = tr.height + 'px';
      tooltip.innerHTML = `<div class="onboarding-tooltip__desc onboarding-tooltip__desc--complete">${t('tourComplete')}</div>`;
      tooltip.classList.add('onboarding-tooltip--complete');
      setTimeout(() => {
        tooltip.classList.remove('onboarding-tooltip--complete');
        if (current >= steps.length - 1) finish();
        else { current++; showStep(current); }
      }, 1000);
    } else {
      if (current >= steps.length - 1) finish();
      else { current++; showStep(current); }
    }
  }

  function showStep(idx) {
    const step = steps[idx];
    const spotlightSelectors = step.spotlightSelector
      ? (Array.isArray(step.spotlightSelector) ? step.spotlightSelector : [step.spotlightSelector])
      : (Array.isArray(step.selector) ? step.selector : [step.selector]);
    const els = spotlightSelectors.map(s => container.querySelector(s)).filter(Boolean);
    if (els.length === 0) { finish(); return; }
    if (step.onEnter) step.onEnter();

    // Merge bounding boxes of all matched elements
    const rects = els.map(e => e.getBoundingClientRect());
    const rect = {
      left: Math.min(...rects.map(r => r.left)),
      top: Math.min(...rects.map(r => r.top)),
      right: Math.max(...rects.map(r => r.right)),
      bottom: Math.max(...rects.map(r => r.bottom)),
    };
    rect.width = rect.right - rect.left;
    rect.height = rect.bottom - rect.top;
    const pad = 8;
    spotlight.style.left = (rect.left - pad) + 'px';
    spotlight.style.top = (rect.top - pad) + 'px';
    spotlight.style.width = (rect.width + pad * 2) + 'px';
    spotlight.style.height = (rect.height + pad * 2) + 'px';

    tooltip.innerHTML = `
      <div class="onboarding-tooltip__step">${t('tourStep', { current: idx + 1, total: steps.length })}</div>
      <div class="onboarding-tooltip__desc">${t(step.descKey)}</div>
    `;

    // Position tooltip near the spotlight
    const tooltipRect = tooltip.getBoundingClientRect();
    let top = rect.bottom + pad + 12;
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;

    // Keep within viewport
    if (top + tooltipRect.height > window.innerHeight - 16) {
      top = rect.top - pad - 12 - tooltipRect.height;
    }
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipRect.width - 12));
    top = Math.max(12, top);

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.opacity = '1';

    // Listen for action completion
    cleanup();
    if (step.listen) step.listen(advance, (fn) => { cleanupFn = fn; });

    // Elevate interactive element above overlay
    if (step.interactiveSelector) {
      const el = container.querySelector(step.interactiveSelector);
      if (el) {
        el.style.position = 'relative';
        el.style.zIndex = '9001';
        _elevatedEl = el;
      }
    }

    // Show finger guide (after cleanup so it doesn't get reset)
    if (step.guide) step.guide(guideEl, container);
  }

  function finish() {
    cleanup();
    _onboardingActive = false;
    localStorage.setItem(ONBOARDING_KEY, '1');
    // 해금 키가 없으면 빈 배열로 초기화 (기존 사용자와 구분)
    if (!localStorage.getItem(UNLOCK_KEY)) {
      localStorage.setItem(UNLOCK_KEY, JSON.stringify([]));
    }
    overlay.remove();
    spotlight.remove();
    tooltip.remove();
    guideEl.remove();
  }

  showStep(0);
}
