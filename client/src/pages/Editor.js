import { NoteStore } from '../store/NoteStore.js';
import { StageRenderer } from '../renderer/StageRenderer.js';
import { PlaybackEngine } from '../engine/PlaybackEngine.js';
import { VideoExporter } from '../engine/VideoExporter.js';
import { navigate, setNavigationGuard, clearNavigationGuard } from '../utils/router.js';
import { showToast } from '../utils/toast.js';
import { pushState, undo, redo, canUndo, canRedo, clearHistory } from '../utils/history.js';
import { getPresetNames, applyPreset } from '../utils/formations.js';
import { toggleTheme, isLightMode } from '../utils/theme.js';
import {
  PIXEL_PER_SEC, TIMELINE_PADDING, TIME_UNIT, WING_SIZE,
  formatTime, floorTime, clamp, roundToGrid, GRID_GAP, HALF_W, HALF_H,
  STAGE_WIDTH, STAGE_HEIGHT, setStageSize,
} from '../utils/constants.js';

let engine = null;
let renderer = null;
let noteData = null;
let selectedFormation = 0;
let selectedFormations = new Set([0]); // multi-select set
let selectedTransition = null; // { fromIdx, toIdx } — selected gap between formations
let currentMs = 0;
let unsaved = false;
let swapMode = false;
let audienceDirection = 'top';
let pixelsPerSec = PIXEL_PER_SEC;
let _renderPresetThumbnails = null; // set by setupSidebar // mutable, for timeline zoom

export async function renderEditor(container, noteId) {
  noteId = Number(noteId);
  noteData = await NoteStore.loadNote(noteId);
  if (!noteData) {
    showToast('노트를 찾을 수 없습니다');
    navigate('/dashboard');
    return;
  }

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

  // Wire callbacks
  setupPlayback(container);
  setupTimeline(container);
  setupSidebar(container);
  setupToolbar(container);
  setupHeader(container, noteId);
  setupSettings(container, noteId);
  setupMusicUpload(container, noteId);

  // Initial render (defer to ensure DOM is fully ready)
  setTimeout(() => {
    renderer._drawGridCache(); // rebuild with CSS variables now available
    updateStage();
    updateTimelineMarker();
    highlightFormation();
    if (noteData.musicBlob) {
      drawWaveform(container, noteData.musicBlob, noteData.note.duration);
    }
  }, 50);

  // Initialize undo history with current state
  clearHistory();
  saveSnapshot();

  // Request persistent storage
  NoteStore.requestPersistence();
}

function buildEditorHTML(data) {
  const durationSec = (data.note.duration || 30000) / 1000;
  const timelineWidth = TIMELINE_PADDING * 2 + durationSec * pixelsPerSec;

  return `
    <div class="editor">
      <div class="editor__header">
        <button class="editor__back" id="back-btn">← </button>
        <input class="editor__title-input" id="title-input" value="${escapeAttr(data.note.title)}" />
        <div class="editor__actions">
          <button class="btn btn--ghost" id="music-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>음악 넣기</button>
          <button class="btn btn--ghost" id="export-video-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>영상 저장</button>
          <button class="btn btn--primary" id="save-btn">저장</button>
        </div>
      </div>

      <div class="editor__main">
        <div class="stage-container">
          <div class="stage-wrap">
            <canvas id="stage-canvas" class="stage-canvas"></canvas>
          </div>
          <div class="stage-3d-banner" id="stage-3d-banner">미리보기 모드 — 클릭하면 편집 모드로</div>
        </div>
      </div>

      <div class="sidebar-rail" id="sidebar-rail">
        <button class="sidebar-rail__icon sidebar-rail__icon--active" data-panel="dancers" title="댄서"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></button>
        <button class="sidebar-rail__icon" data-panel="presets" title="추천 대열"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></button>
        <button class="sidebar-rail__icon" data-panel="view" title="뷰 모드"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button class="sidebar-rail__icon" data-panel="settings" title="설정"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
      </div>
      <div class="editor__sidebar" id="sidebar">
        <div class="sidebar__panel" id="panel-dancers">
          <div class="sidebar__panel-title">댄서</div>
          <div class="sidebar__scroll">
            <div class="dancer-list" id="dancer-list"></div>
          </div>
          <div class="sidebar__actions">
            <button class="btn btn--ghost" id="add-dancer-btn" style="width:100%;font-size:12px">+ 댄서 추가</button>
            <button class="btn btn--ghost" id="batch-color-btn" style="width:100%;font-size:12px">선택 댄서 색 변경</button>
          </div>
        </div>
        <div class="sidebar__panel sidebar__panel--hidden" id="panel-presets">
          <div class="sidebar__panel-title">추천 대열</div>
          <div class="sidebar__scroll">
            <div class="preset-spacing">
              <span class="settings-label">간격</span>
              <button class="btn btn--ghost settings-btn-sm" id="preset-spacing-down">−</button>
              <span id="preset-spacing-value">50</span>
              <button class="btn btn--ghost settings-btn-sm" id="preset-spacing-up">+</button>
            </div>
            <div class="preset-grid" id="preset-grid"></div>
          </div>
        </div>
        <div class="sidebar__panel sidebar__panel--hidden" id="panel-view">
          <div class="sidebar__panel-title">뷰 모드</div>
          <div class="sidebar__scroll" style="padding:12px 16px">
            <div class="settings-section">
              <div class="settings-label">스테이지 뷰</div>
              <div class="settings-options">
                <button class="toolbar__btn" id="sidebar-3d-btn">3D</button>
                <button class="toolbar__btn" id="sidebar-rotate-btn">회전</button>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-label">표시</div>
              <div class="settings-options">
                <button class="toolbar__btn" id="sidebar-names-btn">이름</button>
              </div>
            </div>
          </div>
        </div>
        <div class="sidebar__panel sidebar__panel--hidden" id="panel-settings">
          <div class="sidebar__panel-title">설정</div>
          <div class="sidebar__scroll" style="padding:12px 16px">
            <div class="settings-section">
              <div class="settings-label">무대 크기</div>
              <div class="settings-options" id="settings-stage-options">
                <button class="settings-option" data-stage="400x260">작은 무대</button>
                <button class="settings-option settings-option--active" data-stage="600x400">보통</button>
                <button class="settings-option" data-stage="800x500">넓은 무대</button>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-label">격자 간격</div>
              <div class="settings-options" id="settings-grid-options">
                <button class="settings-option" data-grid="15">촘촘</button>
                <button class="settings-option settings-option--active" data-grid="30">보통</button>
                <button class="settings-option" data-grid="60">넓음</button>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-label">노래 길이</div>
              <div class="settings-row">
                <span id="settings-duration">${formatDurationFull(data.note.duration)}</span>
                <button class="btn btn--ghost settings-btn-sm" id="settings-duration-btn">변경</button>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-label">댄서 모양</div>
              <div class="settings-options" id="settings-shape-options">
                <button class="settings-option settings-option--active" data-shape="pentagon">⬠ 오각형</button>
                <button class="settings-option" data-shape="circle">● 원형</button>
                <button class="settings-option" data-shape="heart">♡ 하트</button>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-label">객석 방향</div>
              <div class="settings-options" id="settings-audience-options">
                <button class="settings-option settings-option--active" data-audience="top">↑ 위쪽</button>
                <button class="settings-option" data-audience="bottom">↓ 아래쪽</button>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-label">테마</div>
              <div class="settings-options" id="settings-theme-options">
                <button class="settings-option${isLightMode() ? '' : ' settings-option--active'}" data-theme="dark">다크</button>
                <button class="settings-option${isLightMode() ? ' settings-option--active' : ''}" data-theme="light">라이트</button>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-label">백업</div>
              <div class="settings-row" style="flex-direction:column;gap:6px">
                <button class="btn btn--ghost" id="settings-export-btn" style="width:100%;font-size:12px">JSON 내보내기</button>
                <button class="btn btn--ghost" id="settings-import-btn" style="width:100%;font-size:12px">JSON 가져오기</button>
                <input type="file" id="settings-import-file" accept=".json" style="display:none" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="player-bar">
        <button class="player-bar__btn" id="play-btn">▶</button>
        <span class="player-bar__time" id="time-display">${formatTime(0, true)}</span>
        <span class="player-bar__time" style="color:var(--text-secondary)">/</span>
        <span class="player-bar__time" id="duration-display">${formatTime(data.note.duration, true)}</span>
        <span class="player-bar__music-name" id="music-name">${data.note.musicName ? escapeAttr(data.note.musicName) : '음악 없음'}</span>

        <div class="toolbar__separator"></div>

        <div class="toolbar">
          <button class="toolbar__btn" id="undo-btn" title="실행 취소 (Ctrl+Z)">↩</button>
          <button class="toolbar__btn" id="redo-btn" title="다시 실행 (Ctrl+Shift+Z)">↪</button>
          <div class="toolbar__separator"></div>
          <button class="toolbar__btn" id="add-formation-btn" title="현재 위치에 대형 추가">+ 대형</button>
          <button class="toolbar__btn" id="del-formation-btn" title="선택된 대형 삭제">− 대형</button>
          <button class="toolbar__btn" id="swap-btn" title="댄서 두 명 위치 교환">교환</button>
          <button class="toolbar__btn" id="copy-btn" title="대형 복사 (Ctrl+C)">복사</button>
          <button class="toolbar__btn" id="paste-btn" title="대형 붙여넣기 (Ctrl+V)">붙여넣기</button>
          <div class="toolbar__separator"></div>
          <button class="toolbar__btn" id="snap-btn" title="격자에 맞추기">격자</button>
        </div>
      </div>

      <div class="editor__timeline-wrap">
        <div class="editor__timeline" id="timeline-scroll">
          <div class="timeline" id="timeline" style="width:${timelineWidth}px">
          <div class="timeline__ruler" id="timeline-ruler"></div>
          <canvas class="timeline__waveform" id="timeline-waveform"></canvas>
          <div class="timeline__formations" id="timeline-formations"></div>
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
    <input type="file" id="music-file" accept="audio/*" style="display:none" />
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
    playBtn.textContent = '▶';
  };

  playBtn.addEventListener('click', () => {
    if (engine.isPlaying) {
      engine.pause();
      playBtn.textContent = '▶';
      seekTo(currentMs);
    } else {
      selectedFormation = -1;
      selectedFormations.clear();
      selectedTransition = null;
      highlightFormation();
      highlightTransition();
      engine.play(currentMs);
      playBtn.textContent = '⏸';
    }
  });

  // Keyboard shortcuts (remove previous listener to avoid duplicates)
  if (window._choreoKeyHandler) {
    document.removeEventListener('keydown', window._choreoKeyHandler);
  }
  window._choreoKeyHandler = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      const btn = document.querySelector('#play-btn');
      if (btn) btn.click();
    }
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
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
      e.preventDefault();
      const snapshot = undo();
      if (snapshot) {
        restoreSnapshot(snapshot);
        showToast('실행 취소');
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && e.shiftKey) {
      e.preventDefault();
      const snapshot = redo();
      if (snapshot) {
        restoreSnapshot(snapshot);
        showToast('다시 실행');
      }
    }
    if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
      e.preventDefault();
      toggleShortcutHelp(container);
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

  renderer.onDancerDragEnd = (dancerIndex, newX, newY, selectedSet) => {
    if (swapMode) return;
    if (engine.isPlaying || selectedFormation < 0) return;
    const f = noteData.formations[selectedFormation];
    if (!f) return;
    const snap = renderer.isSnap;
    const gap = 15; // fixed snap unit
    const limit = { minX: -(HALF_W + WING_SIZE - 20), maxX: HALF_W + WING_SIZE - 20, minY: -(HALF_H + WING_SIZE - 20), maxY: HALF_H + WING_SIZE - 20 };

    if (selectedSet.size > 1 && selectedSet.has(dancerIndex) && dragStartPositions) {
      const origPos = dragStartPositions.get(dancerIndex);
      const rawDx = newX - origPos.x;
      const rawDy = newY - origPos.y;
      const snappedAnchorX = snap ? roundToGrid(clamp(newX, limit.minX, limit.maxX), gap) : clamp(Math.round(newX), limit.minX, limit.maxX);
      const snappedAnchorY = snap ? roundToGrid(clamp(newY, limit.minY, limit.maxY), gap) : clamp(Math.round(newY), limit.minY, limit.maxY);
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
        pos.x = snap ? roundToGrid(clamp(newX, limit.minX, limit.maxX), gap) : clamp(Math.round(newX), limit.minX, limit.maxX);
        pos.y = snap ? roundToGrid(clamp(newY, limit.minY, limit.maxY), gap) : clamp(Math.round(newY), limit.minY, limit.maxY);
      }
    }
    dragStartPositions = null;
    updateStage(); saveSnapshot();
  };

  renderer.onDancerDrag = (dancerIndex, newX, newY, selectedSet) => {
    if (swapMode) return;
    if (engine.isPlaying || selectedFormation < 0) return;
    const positions = engine.calcPositionsAt(currentMs);
    const snap = renderer.isSnap;
    const gap = 15; // fixed snap unit
    const limit = { minX: -(HALF_W + WING_SIZE - 20), maxX: HALF_W + WING_SIZE - 20, minY: -(HALF_H + WING_SIZE - 20), maxY: HALF_H + WING_SIZE - 20 };

    // Capture start positions on first drag frame
    if (!dragStartPositions) {
      dragStartPositions = new Map();
      for (let i = 0; i < positions.length; i++) {
        dragStartPositions.set(i, { x: positions[i].x, y: positions[i].y, angle: positions[i].angle || 0 });
      }
    }

    if (selectedSet && selectedSet.size > 1 && selectedSet.has(dancerIndex)) {
      const origPos = dragStartPositions.get(dancerIndex);
      const snappedAnchorX = snap ? roundToGrid(clamp(newX, limit.minX, limit.maxX), gap) : clamp(Math.round(newX), limit.minX, limit.maxX);
      const snappedAnchorY = snap ? roundToGrid(clamp(newY, limit.minY, limit.maxY), gap) : clamp(Math.round(newY), limit.minY, limit.maxY);
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
      positions[dancerIndex] = {
        x: snap ? roundToGrid(clamp(newX, limit.minX, limit.maxX), gap) : clamp(Math.round(newX), limit.minX, limit.maxX),
        y: snap ? roundToGrid(clamp(newY, limit.minY, limit.maxY), gap) : clamp(Math.round(newY), limit.minY, limit.maxY),
        angle: positions[dancerIndex]?.angle || 0,
      };
    }
    renderer.setCurrentState(noteData.dancers, positions);
    renderer.drawFrame(noteData.dancers, positions);
  };

  // Dancer rotation (mouse wheel)
  renderer.onDancerRotate = (dancerIndex, delta) => {
    if (engine.isPlaying || selectedFormation < 0) return;
    const f = noteData.formations[selectedFormation];
    if (!f) return;
    const d = noteData.dancers[dancerIndex];
    const pos = f.positions.find(p => p.dancerId === d.id);
    if (!pos) return;
    pos.angle = ((pos.angle || 0) + delta + 360) % 360;
    updateStage(); saveSnapshot();
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
      showToast(`${d.name} 경로 초기화됨`);
    }
  };
}

// --- Timeline ---
function setupTimeline(container) {
  const ruler = container.querySelector('#timeline-ruler');
  const formationsEl = container.querySelector('#timeline-formations');
  const timelineScroll = container.querySelector('#timeline-scroll');
  const durationSec = (noteData.note.duration || 30000) / 1000;

  // Mouse wheel → horizontal scroll
  timelineScroll.addEventListener('wheel', (e) => {
    e.preventDefault();
    timelineScroll.scrollLeft += e.deltaY || e.deltaX;
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

  timelineScroll.addEventListener('scroll', updateScrollbar);
  window.addEventListener('resize', updateScrollbar);
  setTimeout(updateScrollbar, 100);

  // Thumb drag
  let thumbDrag = null;
  thumb.addEventListener('mousedown', (e) => {
    e.preventDefault();
    thumbDrag = { startX: e.clientX, startScroll: timelineScroll.scrollLeft };
  });

  document.addEventListener('mousemove', (e) => {
    if (!thumbDrag) return;
    const trackW = scrollbar.clientWidth;
    const contentW = container.querySelector('#timeline').scrollWidth;
    const viewW = timelineScroll.clientWidth;
    const dx = e.clientX - thumbDrag.startX;
    const scrollRange = contentW - viewW;
    const thumbW = parseFloat(thumb.style.width);
    const trackRange = trackW - thumbW;
    if (trackRange > 0) {
      timelineScroll.scrollLeft = thumbDrag.startScroll + (dx / trackRange) * scrollRange;
    }
  });

  document.addEventListener('mouseup', () => {
    thumbDrag = null;
  });

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
  noteData.formations.forEach((f, i) => {
    const box = document.createElement('div');
    box.className = 'formation-box' + (selectedFormations.has(i) ? ' formation-box--selected' : '');
    box.style.left = `${TIMELINE_PADDING + f.startTime / 1000 * pixelsPerSec}px`;
    box.style.width = `${f.duration / 1000 * pixelsPerSec}px`;
    box.textContent = `${i + 1}`;
    box.dataset.index = i;

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
}

function setupFormationDrag(el, fIdx, mode) {
  let startX = 0;
  let origStarts = {}; // { fIdx: origStartTime } for multi-drag
  let origStart = 0;
  let origDuration = 0;
  let targetFormation = null;
  let didDrag = false;
  let shiftKey = false;

  function onStart(e) {
    if (engine.isPlaying) return;
    if (mode !== 'body' && !e.target.classList.contains('formation-box__handle')) return;
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

      if (mode === 'body') {
        if (Object.keys(origStarts).length > 1) {
          // Multi-drag: move all selected formations
          for (const [idx, orig] of Object.entries(origStarts)) {
            noteData.formations[Number(idx)].startTime = Math.max(0, orig + dtMs);
          }
        } else {
          targetFormation.startTime = Math.max(0, origStart + dtMs);
        }
      } else if (mode === 'left') {
        const newStart = origStart + dtMs;
        const newDur = origDuration - dtMs;
        if (newDur >= TIME_UNIT && newStart >= 0) {
          targetFormation.startTime = newStart;
          targetFormation.duration = newDur;
        }
      } else if (mode === 'right') {
        const newDur = origDuration + dtMs;
        if (newDur >= TIME_UNIT) {
          targetFormation.duration = newDur;
        }
      }

      const formationsEl = document.querySelector('#timeline-formations');
      renderFormationBoxes(formationsEl);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      if (!didDrag) {
        // Click without drag: select and seek
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
        // Seek to clicked position within the box
        const scrollEl = document.querySelector('#timeline-scroll');
        const clickX = startX - scrollEl.getBoundingClientRect().left + scrollEl.scrollLeft;
        const clickMs = floorTime(clamp((clickX - TIMELINE_PADDING) / pixelsPerSec * 1000, 0, noteData.note.duration));
        seekTo(clickMs);
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
        showToast('대형이 겹칩니다');
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

      // Check if current time is still inside selected formation
      const currentFIdx = noteData.formations.findIndex((f) => currentMs >= f.startTime && currentMs < f.startTime + f.duration);
      if (currentFIdx >= 0) {
        selectedFormation = currentFIdx;
        if (!selectedFormations.has(currentFIdx)) {
          selectedFormations.clear();
          selectedFormations.add(currentFIdx);
        }
      } else {
        selectedFormation = -1;
        selectedFormations.clear();
      }

      const formationsEl = document.querySelector('#timeline-formations');
      renderFormationBoxes(formationsEl);
      highlightFormation();
      updateStage(); saveSnapshot();
    };

    const onTouchMove = (ev) => { ev.preventDefault(); onMove(ev); };
    const onTouchEnd = () => { onUp(); document.removeEventListener('touchmove', onTouchMove); document.removeEventListener('touchend', onTouchEnd); };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }

  el.addEventListener('mousedown', onStart);
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onStart({ clientX: e.touches[0].clientX, target: e.target, shiftKey: e.shiftKey, stopPropagation() {}, preventDefault() {} });
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

  function renderPresetThumbnails() {
    presetGrid.innerHTML = '';
    const names = getPresetNames();
    const count = noteData.dancers.length;
    for (const name of names) {
      const positions = applyPreset(name, count, presetSpacing, HALF_W, HALF_H);
      if (!positions) continue;

      const card = document.createElement('div');
      card.className = 'preset-card';

      // Mini canvas thumbnail
      const cvs = document.createElement('canvas');
      cvs.width = 120;
      cvs.height = 80;
      const ctx = cvs.getContext('2d');

      // Background
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--stage-bg').trim() || '#1a1a2e';
      ctx.fillRect(0, 0, 120, 80);

      // Draw dots
      for (let i = 0; i < positions.length && i < noteData.dancers.length; i++) {
        const p = positions[i];
        const sx = 60 + p.x * 0.15;
        const sy = 40 + p.y * 0.15;
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = noteData.dancers[i]?.color || '#4ECDC4';
        ctx.fill();
      }

      card.appendChild(cvs);

      const label = document.createElement('div');
      label.className = 'preset-card__name';
      label.textContent = name;
      card.appendChild(label);

      card.addEventListener('click', () => {
        if (selectedFormation < 0) {
          showToast('대열을 먼저 선택하세요');
          return;
        }
        const f = noteData.formations[selectedFormation];
        for (let i = 0; i < f.positions.length && i < positions.length; i++) {
          f.positions[i].x = positions[i].x;
          f.positions[i].y = positions[i].y;
        }
        updateStage(); saveSnapshot();
        showToast(`${name} 대열 적용됨`);
      });

      presetGrid.appendChild(card);
    }
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

  renderDancerList(list);

  addBtn.addEventListener('click', () => {
    const colors = [
      '#EF4444', '#3B82F6', '#22C55E', '#EAB308',
      '#F97316', '#A855F7', '#EC4899', '#06B6D4',
      '#1F2937', '#F1F5F9', '#92400E', '#6B7280',
    ];
    const idx = noteData.dancers.length;
    const newDancer = {
      id: Date.now(),
      noteId: noteData.note.id,
      name: `댄서${idx + 1}`,
      color: colors[idx % colors.length],
      order: idx,
    };
    noteData.dancers.push(newDancer);

    // Add position to all formations (offstage left, stacked vertically)
    const offstageX = -(HALF_W + Math.round(WING_SIZE / 2));
    // Count existing offstage dancers to stack vertically
    const offstageCount = noteData.dancers.filter((d, i) => {
      if (i === noteData.dancers.length - 1) return false; // skip the one we just added
      const f0 = noteData.formations[0];
      if (!f0) return false;
      const pos = f0.positions.find(p => p.dancerId === d.id);
      return pos && Math.abs(pos.x) > HALF_W;
    }).length;
    const offstageY = -HALF_H + 40 + offstageCount * 40;

    for (const f of noteData.formations) {
      const defaultAngle = audienceDirection === 'bottom' ? 180 : 0;
      f.positions.push({ dancerId: newDancer.id, x: offstageX, y: clamp(offstageY, -HALF_H, HALF_H), angle: defaultAngle });
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

  // Batch color change for selected dancers
  container.querySelector('#batch-color-btn').addEventListener('click', () => {
    const selected = renderer._selectedDancers;
    if (!selected || selected.size === 0) {
      showToast('스테이지에서 댄서를 먼저 선택하세요');
      return;
    }

    document.querySelectorAll('.color-palette-popup').forEach(p => p.remove());

    const popup = document.createElement('div');
    popup.className = 'color-palette-popup';
    popup.style.position = 'fixed';
    popup.style.zIndex = '300';
    const bRect = container.querySelector('#batch-color-btn').getBoundingClientRect();
    popup.style.left = `${bRect.left}px`;
    popup.style.top = `${bRect.top - 6}px`;
    popup.style.transform = 'translateY(-100%)';

    popup.innerHTML = PALETTE.map(c =>
      `<div class="color-palette__swatch" data-swatch="${c}" style="background:${c}"></div>`
    ).join('') + `<label class="color-palette__custom"><input type="color" value="#ffffff" />커스텀</label>`;

    popup.querySelectorAll('[data-swatch]').forEach(swatch => {
      swatch.addEventListener('click', (ev) => {
        ev.stopPropagation();
        for (const idx of selected) {
          noteData.dancers[idx].color = swatch.dataset.swatch;
        }
        renderDancerList(list);
        updateStage(); saveSnapshot();
        popup.remove();
        showToast(`${selected.size}명 색상 변경됨`);
      });
    });

    popup.querySelector('input[type="color"]').addEventListener('input', (ev) => {
      for (const idx of selected) {
        noteData.dancers[idx].color = ev.target.value;
      }
      updateStage();
    });

    popup.querySelector('input[type="color"]').addEventListener('change', () => {
      renderDancerList(list);
      saveSnapshot();
      popup.remove();
    });

    document.body.appendChild(popup);
    setTimeout(() => {
      const close = (e) => {
        if (!popup.contains(e.target)) {
          popup.remove();
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  });

}

const PALETTE = [
  '#EF4444', '#3B82F6', '#22C55E', '#EAB308',
  '#F97316', '#A855F7', '#EC4899', '#06B6D4',
  '#1F2937', '#F1F5F9', '#92400E', '#6B7280',
];

function renderDancerList(list) {
  list.innerHTML = noteData.dancers.map((d, i) => `
    <div class="dancer-item" data-index="${i}">
      <div class="dancer-item__color-btn" data-colorbtn="${i}" style="background:${d.color}"></div>
      <input class="dancer-item__name" value="${escapeAttr(d.name)}" data-name="${i}" />
      <button class="dancer-item__remove" data-remove="${i}">✕</button>
    </div>
  `).join('');

  // Color palette popup
  list.querySelectorAll('[data-colorbtn]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.colorbtn);
      // Close any existing popup
      document.querySelectorAll('.color-palette-popup').forEach(p => p.remove());

      const popup = document.createElement('div');
      popup.className = 'color-palette-popup';
      popup.innerHTML = PALETTE.map(c =>
        `<div class="color-palette__swatch${c === noteData.dancers[idx].color ? ' color-palette__swatch--active' : ''}" data-swatch="${c}" style="background:${c}"></div>`
      ).join('') + `<label class="color-palette__custom"><input type="color" value="${noteData.dancers[idx].color}" />커스텀</label>`;

      popup.querySelectorAll('[data-swatch]').forEach((swatch) => {
        swatch.addEventListener('click', (ev) => {
          ev.stopPropagation();
          noteData.dancers[idx].color = swatch.dataset.swatch;
          btn.style.background = swatch.dataset.swatch;
          updateStage(); saveSnapshot();
          popup.remove();
        });
      });

      popup.querySelector('input[type="color"]').addEventListener('input', (ev) => {
        noteData.dancers[idx].color = ev.target.value;
        btn.style.background = ev.target.value;
        updateStage();
      });

      popup.querySelector('input[type="color"]').addEventListener('change', () => {
        saveSnapshot();
        popup.remove();
      });

      btn.parentElement.appendChild(popup);

      // Close popup on outside click
      const closePopup = (ev) => {
        if (!popup.contains(ev.target) && ev.target !== btn) {
          popup.remove();
          document.removeEventListener('click', closePopup);
        }
      };
      setTimeout(() => document.addEventListener('click', closePopup), 0);
    });
  });

  list.querySelectorAll('[data-name]').forEach((input) => {
    input.addEventListener('change', (e) => {
      noteData.dancers[Number(e.target.dataset.name)].name = e.target.value;
      updateStage(); saveSnapshot();
    });
  });

  list.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (noteData.dancers.length <= 1) {
        showToast('최소 1명의 댄서가 필요합니다');
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

  undoBtn.addEventListener('click', () => {
    const snapshot = undo();
    if (snapshot) {
      restoreSnapshot(snapshot);
      showToast('실행 취소');
    }
  });

  redoBtn.addEventListener('click', () => {
    const snapshot = redo();
    if (snapshot) {
      restoreSnapshot(snapshot);
      showToast('다시 실행');
    }
  });
  let copiedPositions = null;

  addBtn.addEventListener('click', () => {
    const newStart = floorTime(currentMs);
    // Check overlap
    const overlaps = noteData.formations.some((f) =>
      newStart < f.startTime + f.duration && newStart + TIME_UNIT * 5 > f.startTime
    );
    if (overlaps) {
      showToast('다른 대형과 겹칩니다');
      return;
    }

    const newFormation = {
      id: Date.now(),
      noteId: noteData.note.id,
      startTime: newStart,
      duration: TIME_UNIT * 5,
      order: noteData.formations.length,
      positions: (() => {
        const currentPositions = engine.calcPositionsAt(currentMs);
        return noteData.dancers.map((d, i) => ({
          dancerId: d.id,
          x: Math.round(currentPositions[i]?.x || 0),
          y: Math.round(currentPositions[i]?.y || 0),
        }));
      })(),
    };
    noteData.formations.push(newFormation);
    noteData.formations.sort((a, b) => a.startTime - b.startTime);

    selectedFormation = noteData.formations.indexOf(newFormation);
    engine.setFormations(noteData.formations, noteData.dancers);

    const formationsEl = container.querySelector('#timeline-formations');
    renderFormationBoxes(formationsEl);
    updateStage(); saveSnapshot();
    showToast('대형 추가됨');
  });

  delBtn.addEventListener('click', () => {
    if (noteData.formations.length <= 1) {
      showToast('최소 1개의 대형이 필요합니다');
      return;
    }
    if (!confirm('이 대형을 삭제할까요?')) return;
    noteData.formations.splice(selectedFormation, 1);
    selectedFormation = Math.min(selectedFormation, noteData.formations.length - 1);
    engine.setFormations(noteData.formations, noteData.dancers);

    const formationsEl = container.querySelector('#timeline-formations');
    renderFormationBoxes(formationsEl);
    updateStage(); saveSnapshot();
    showToast('대형 삭제됨');
  });

  copyBtn.addEventListener('click', () => {
    if (selectedFormation < 0) {
      showToast('복사할 대형을 선택하세요');
      return;
    }
    const f = noteData.formations[selectedFormation];
    copiedPositions = f.positions.map((p) => ({ dancerId: p.dancerId, x: p.x, y: p.y }));
    showToast('대형 복사됨');
  });

  pasteBtn.addEventListener('click', () => {
    if (!copiedPositions) {
      showToast('복사된 대형이 없습니다');
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
        }
      }
      updateStage(); saveSnapshot();
      showToast('대형 붙여넣기 완료');
    } else {
      // Empty space: create new formation with copied positions
      const newStart = floorTime(currentMs);
      const overlaps = noteData.formations.some((f) =>
        newStart < f.startTime + f.duration && newStart + TIME_UNIT * 5 > f.startTime
      );
      if (overlaps) {
        showToast('다른 대형과 겹칩니다');
        return;
      }

      const newFormation = {
        id: Date.now(),
        noteId: noteData.note.id,
        startTime: newStart,
        duration: TIME_UNIT * 5,
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
      showToast('새 대형으로 붙여넣기 완료');
    }
  });

  // Keyboard shortcuts for copy/paste
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
      copyBtn.click();
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
      e.preventDefault();
      pasteBtn.click();
    }
  });

  // Swap mode
  swapMode = false;
  let swapFirst = -1;

  swapBtn.addEventListener('click', () => {
    swapMode = !swapMode;
    swapFirst = -1;
    swapBtn.classList.toggle('toolbar__btn--active', swapMode);
    renderer._selectedDancers.clear();
    updateStage();
    if (swapMode) {
      showToast('교환할 첫 번째 댄서를 클릭하세요');
    }
  });

  renderer.onDancerSelect = (dancerIndex) => {
    // Always update stage to refresh waypoint path filtering
    if (selectedTransition) updateStage();

    if (!swapMode) return;
    if (dancerIndex < 0) {
      // Empty space click: cancel first selection
      if (swapFirst >= 0) {
        swapFirst = -1;
        renderer._selectedDancers.clear();
        updateStage();
        showToast('선택 취소됨');
      }
      return;
    }
    if (selectedFormation < 0) {
      showToast('대열을 먼저 선택하세요');
      return;
    }

    if (swapFirst < 0) {
      swapFirst = dancerIndex;
      // Highlight first selected dancer
      renderer._selectedDancers.clear();
      renderer._selectedDancers.add(dancerIndex);
      updateStage();
      showToast(`${noteData.dancers[dancerIndex].name} 선택됨 — 두 번째 댄서를 클릭하세요`);
    } else {
      if (swapFirst === dancerIndex) {
        // Deselect
        swapFirst = -1;
        renderer._selectedDancers.clear();
        updateStage();
        showToast('선택 취소됨');
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

        renderer._selectedDancers.clear();
        renderer._selectedDancers.add(swapFirst);
        renderer._selectedDancers.add(dancerIndex);

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
            renderer._selectedDancers.clear();
            updateStage(); saveSnapshot();
            showToast(`${d1.name} ↔ ${d2.name} 교환 완료`);
          }
        };
        requestAnimationFrame(animate);
      }

      // Ready for next swap
      swapFirst = -1;
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

  function toggle3D(forceOff) {
    const is3D = forceOff ? false : !renderer.is3D;
    renderer.set3D(is3D, 'css');
    if (is3D) renderer._selectedDancers.clear();
    updateBanner();
    updateViewButtons();
    updateStage();
  }

  function toggleRotate(forceOff) {
    const isRotated = forceOff ? false : !renderer.isRotated;
    renderer.setRotated(isRotated);
    if (isRotated) renderer._selectedDancers.clear();
    updateBanner();
    updateViewButtons();
    updateStage();
  }

  function updateViewButtons() {
    const btn3d = container.querySelector('#sidebar-3d-btn');
    const btnRotate = container.querySelector('#sidebar-rotate-btn');
    if (btn3d) btn3d.classList.toggle('toolbar__btn--active', renderer.is3D);
    if (btnRotate) btnRotate.classList.toggle('toolbar__btn--active', renderer.isRotated);
  }

  function updateBanner() {
    const is3D = renderer.is3D;
    const isRotated = renderer.isRotated;
    const visible = is3D || isRotated;
    let text = '';
    if (is3D && isRotated) text += '3D + 회전 뷰';
    else if (is3D) text += '3D 뷰';
    else if (isRotated) text += '회전 뷰';
    text += ' — 클릭하면 편집 모드로';
    banner3d.textContent = text;
    banner3d.classList.toggle('stage-3d-banner--visible', visible);
  }

  banner3d.addEventListener('click', () => {
    if (renderer.is3D) toggle3D(true);
    if (renderer.isRotated) toggleRotate(true);
  });

  // Sidebar rail: icon click toggles panels
  const sidebar = container.querySelector('#sidebar');
  const railIcons = container.querySelectorAll('.sidebar-rail__icon');
  const panels = {
    dancers: container.querySelector('#panel-dancers'),
    presets: container.querySelector('#panel-presets'),
    view: container.querySelector('#panel-view'),
    settings: container.querySelector('#panel-settings'),
  };
  let activePanel = 'dancers';

  function openPanel(name) {
    if (activePanel === name && !sidebar.classList.contains('editor__sidebar--hidden')) {
      // Same icon clicked: close sidebar
      sidebar.classList.add('editor__sidebar--hidden');
      railIcons.forEach(ic => ic.classList.remove('sidebar-rail__icon--active'));
      activePanel = null;
      return;
    }
    // Open/switch panel
    sidebar.classList.remove('editor__sidebar--hidden');
    Object.values(panels).forEach(p => p.classList.add('sidebar__panel--hidden'));
    if (panels[name]) panels[name].classList.remove('sidebar__panel--hidden');
    railIcons.forEach(ic => ic.classList.toggle('sidebar-rail__icon--active', ic.dataset.panel === name));
    activePanel = name;
  }

  railIcons.forEach(ic => {
    ic.addEventListener('click', () => openPanel(ic.dataset.panel));
  });

  // View mode buttons in sidebar
  const sidebar3dBtn = container.querySelector('#sidebar-3d-btn');
  const sidebarRotateBtn = container.querySelector('#sidebar-rotate-btn');
  const sidebarNamesBtn = container.querySelector('#sidebar-names-btn');

  sidebar3dBtn.addEventListener('click', () => toggle3D());
  sidebarRotateBtn.addEventListener('click', () => toggleRotate());
  sidebarNamesBtn.addEventListener('click', () => {
    renderer.showNames = !renderer.showNames;
    sidebarNamesBtn.classList.toggle('toolbar__btn--active', renderer.showNames);
    updateStage();
  });
  sidebarNamesBtn.classList.add('toolbar__btn--active');

  // Mobile overlay
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }
  overlay.addEventListener('click', () => {
    sidebar.classList.add('editor__sidebar--hidden');
    railIcons.forEach(ic => ic.classList.remove('sidebar-rail__icon--active'));
    activePanel = null;
    overlay.classList.remove('sidebar-overlay--visible');
  });

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
      sidebar.classList.add('editor__sidebar--hidden');
      overlay.classList.remove('sidebar-overlay--visible');
    }
  });
}

// --- Header ---
function setupHeader(container, noteId) {
  container.querySelector('#back-btn').addEventListener('click', () => navigate('/dashboard'));

  async function saveToDB(silent = false) {
    const title = container.querySelector('#title-input').value;
    await NoteStore.updateNoteTitle(noteId, title);
    await NoteStore.saveNote(noteId, {
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
    if (!silent) showToast('저장 완료!');
  }

  container.querySelector('#save-btn').addEventListener('click', () => saveToDB());

  // Auto-save every 30 seconds when there are unsaved changes
  const autoSaveInterval = setInterval(async () => {
    if (unsaved) {
      await saveToDB(true);
      showToast('자동 저장됨', 1500);
    }
  }, 30000);

  // Clean up interval when leaving editor
  const cleanupAutoSave = () => clearInterval(autoSaveInterval);
  window.addEventListener('hashchange', cleanupAutoSave, { once: true });

  // Export JSON moved to settings panel

  // Video export
  const videoExporter = new VideoExporter();
  const exportVideoBtn = container.querySelector('#export-video-btn');

  // Export option dialog
  const optionDialog = document.createElement('div');
  optionDialog.className = 'export-overlay';
  optionDialog.innerHTML = `
    <div class="export-overlay__box">
      <div class="export-overlay__text">영상 내보내기</div>
      <div class="settings-section">
        <div class="settings-label">뷰</div>
        <div class="export-options">
          <button class="btn btn--ghost export-option-btn export-option--active" data-view="2d">2D</button>
          <button class="btn btn--ghost export-option-btn" data-view="3d">3D</button>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-label">관객 방향</div>
        <div class="export-options">
          <button class="btn btn--ghost export-option-btn" data-dir="normal">↑ 위쪽</button>
          <button class="btn btn--ghost export-option-btn" data-dir="rotated">↓ 아래쪽</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn--primary" id="export-start-btn">내보내기</button>
        <button class="btn btn--danger" id="export-option-cancel">취소</button>
      </div>
    </div>
  `;

  // Export progress overlay
  const progressOverlay = document.createElement('div');
  progressOverlay.className = 'export-overlay';
  progressOverlay.innerHTML = `
    <div class="export-overlay__box">
      <div class="export-overlay__text">영상 내보내는 중...</div>
      <div class="export-overlay__progress" id="export-progress">0%</div>
      <button class="btn btn--danger" id="export-cancel-btn">취소</button>
    </div>
  `;

  exportVideoBtn.addEventListener('click', () => {
    if (videoExporter.isExporting) return;
    if (engine.isPlaying) engine.pause();

    // Set defaults based on current view mode
    optionDialog.querySelectorAll('[data-view]').forEach(b => {
      b.classList.toggle('export-option--active',
        (b.dataset.view === '3d') === renderer.is3D);
    });
    optionDialog.querySelectorAll('[data-dir]').forEach(b => {
      const isBottom = audienceDirection === 'bottom';
      b.classList.toggle('export-option--active',
        (b.dataset.dir === 'rotated') === isBottom);
    });

    // Show option dialog
    container.appendChild(optionDialog);

    optionDialog.querySelector('#export-option-cancel').onclick = () => {
      optionDialog.remove();
    };

    // Toggle selection within each group
    optionDialog.querySelectorAll('.export-options').forEach(group => {
      group.querySelectorAll('.export-option-btn').forEach(btn => {
        btn.onclick = () => {
          group.querySelectorAll('.export-option-btn').forEach(b => b.classList.remove('export-option--active'));
          btn.classList.add('export-option--active');
        };
      });
    });

    optionDialog.querySelector('#export-start-btn').onclick = () => {
      const is3D = optionDialog.querySelector('[data-view].export-option--active')?.dataset.view === '3d';
      const isRotated = optionDialog.querySelector('[data-dir].export-option--active')?.dataset.dir === 'rotated';
      optionDialog.remove();
      startExport(is3D, isRotated);
    };
  });

  function startExport(is3D, isRotated = false) {
    container.appendChild(progressOverlay);
    const progressEl = progressOverlay.querySelector('#export-progress');
    progressEl.textContent = '0%';
    progressOverlay.querySelector('#export-cancel-btn').onclick = () => {
      videoExporter.cancel();
      progressOverlay.remove();
      showToast('영상 내보내기 취소됨');
    };

    videoExporter.export({
      dancers: noteData.dancers,
      formations: noteData.formations,
      audioBlob: noteData.musicBlob,
      duration: noteData.note.duration,
      is3D,
      isRotated,
      showNames: renderer.showNames,
      onProgress: (percent) => {
        progressEl.textContent = `${percent}%`;
      },
      onComplete: (blob, mimeType) => {
        progressOverlay.remove();
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${noteData.note.title || 'choreonote'}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`영상 다운로드 완료 (${ext.toUpperCase()})`);
      },
      onError: (err) => {
        progressOverlay.remove();
        showToast('영상 내보내기 실패: ' + err.message);
      },
    });
  }
}

// --- Settings Panel ---
function setupSettings(container, noteId) {
  // Stage size options
  const stageOptions = container.querySelector('#settings-stage-options');
  stageOptions.querySelectorAll('[data-stage]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [newW, newH] = btn.dataset.stage.split('x').map(Number);
      const oldW = STAGE_WIDTH;
      const oldH = STAGE_HEIGHT;
      if (newW === oldW && newH === oldH) return;

      // Ask user about dancer positions
      const scale = confirm('댄서 위치를 새 무대 크기에 맞게 조정할까요?\n\n확인: 비율에 맞게 조정\n취소: 현재 좌표 유지');

      setStageSize(newW, newH);
      renderer.resize();

      if (scale) {
        const scaleX = newW / oldW;
        const scaleY = newH / oldH;
        for (const f of noteData.formations) {
          for (const pos of f.positions) {
            pos.x = Math.round(pos.x * scaleX);
            pos.y = Math.round(pos.y * scaleY);
            if (pos.waypoints) {
              for (const wp of pos.waypoints) {
                wp.x = Math.round(wp.x * scaleX);
                wp.y = Math.round(wp.y * scaleY);
              }
            }
          }
        }
      }

      // Clamp all positions to canvas bounds with padding for dancer shape
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
      saveSnapshot();

      stageOptions.querySelectorAll('.settings-option').forEach(b => b.classList.remove('settings-option--active'));
      btn.classList.add('settings-option--active');
      showToast(`무대 크기: ${newW} × ${newH}`);
    });
  });

  // Grid gap options
  const gridOptions = container.querySelector('#settings-grid-options');
  gridOptions.querySelectorAll('[data-grid]').forEach(btn => {
    btn.addEventListener('click', () => {
      renderer.gridGap = Number(btn.dataset.grid);
      renderer._drawGridCache();
      updateStage();
      gridOptions.querySelectorAll('.settings-option').forEach(b => b.classList.remove('settings-option--active'));
      btn.classList.add('settings-option--active');
    });
  });

  // Duration
  const durationEl = container.querySelector('#settings-duration');
  container.querySelector('#settings-duration-btn').addEventListener('click', () => {
    const currentSec = Math.round(noteData.note.duration / 1000);
    const input = prompt('노래 길이 (초)', currentSec);
    if (input === null) return;
    const newSec = parseInt(input, 10);
    if (isNaN(newSec) || newSec < 10 || newSec > 600) {
      showToast('10초 ~ 600초 사이로 입력해주세요');
      return;
    }
    const newDuration = newSec * 1000;
    noteData.note.duration = newDuration;
    engine.duration = newDuration;
    durationEl.textContent = formatDurationFull(newDuration);
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
    if (noteData.musicBlob) drawWaveform(container, noteData.musicBlob, newDuration);
    showToast(`노래 길이: ${newSec}초`);
  });

  // Dancer shape options
  const shapeOptions = container.querySelector('#settings-shape-options');
  shapeOptions.querySelectorAll('[data-shape]').forEach(btn => {
    btn.addEventListener('click', () => {
      renderer.dancerShape = btn.dataset.shape;
      shapeOptions.querySelectorAll('.settings-option').forEach(b => b.classList.remove('settings-option--active'));
      btn.classList.add('settings-option--active');
      updateStage();
    });
  });

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

  // Audience direction
  const audienceOptions = container.querySelector('#settings-audience-options');
  audienceOptions.querySelectorAll('[data-audience]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prevDirection = audienceDirection;
      audienceDirection = btn.dataset.audience;
      renderer.audienceDirection = audienceDirection;
      renderer._drawGridCache();
      audienceOptions.querySelectorAll('.settings-option').forEach(b => b.classList.remove('settings-option--active'));
      btn.classList.add('settings-option--active');

      // Rotate all positions and angles 180° (like flipping the stage)
      if (prevDirection !== audienceDirection) {
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
        engine.setFormations(noteData.formations, noteData.dancers);
        saveSnapshot();
      }
      updateStage();
      showToast(`객석: ${audienceDirection === 'top' ? '위쪽' : '아래쪽'}`);
    });
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
    showToast('백업 파일 다운로드됨');
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
      showToast('파일을 불러올 수 없습니다: ' + err.message);
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
      showToast('20MB 이하 파일만 가능합니다');
      return;
    }

    showToast('음악 로딩 중...');

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
      showToast('10초 ~ 10분 사이의 음악만 가능합니다');
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

    // Rebuild timeline
    const durationSec = durationMs / 1000;
    const timelineWidth = TIMELINE_PADDING * 2 + durationSec * pixelsPerSec;
    const timeline = container.querySelector('#timeline');
    timeline.style.width = `${timelineWidth}px`;

    const ruler = container.querySelector('#timeline-ruler');
    ruler.innerHTML = '';
    buildRulerTicks(ruler, durationSec);

    drawWaveform(container, blob, durationMs);
    container.querySelector('#music-name').textContent = file.name;
    showToast(`음악 로드됨: ${file.name}`);
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
  highlightFormation();
  highlightTransition();
  updateStage();

  document.querySelector('#play-btn').textContent = '▶';
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
}

function updateTimelineMarker() {
  const marker = document.querySelector('#timeline-marker');
  if (marker) {
    marker.style.left = `${TIMELINE_PADDING + currentMs / 1000 * pixelsPerSec}px`;
  }
}

function highlightFormation() {
  document.querySelectorAll('.formation-box').forEach((box, i) => {
    box.classList.toggle('formation-box--selected', selectedFormations.has(i));
  });
}

function highlightTransition() {
  // Remove existing highlight
  document.querySelectorAll('.transition-highlight').forEach(el => el.remove());

  if (!selectedTransition) return;
  const { fromIdx, toIdx } = selectedTransition;
  const fromF = noteData.formations[fromIdx];
  const toF = noteData.formations[toIdx];
  if (!fromF || !toF) return;

  const fromEnd = fromF.startTime + fromF.duration;
  const left = TIMELINE_PADDING + fromEnd / 1000 * pixelsPerSec;
  const width = (toF.startTime - fromEnd) / 1000 * pixelsPerSec;

  const highlight = document.createElement('div');
  highlight.className = 'transition-highlight';
  highlight.style.left = `${left}px`;
  highlight.style.width = `${width}px`;

  const formationsEl = document.querySelector('#timeline-formations');
  if (formationsEl) formationsEl.appendChild(highlight);
}

async function drawWaveform(container, audioBlob, durationMs) {
  const canvas = container.querySelector('#timeline-waveform');
  if (!canvas || !audioBlob) return;

  const durationSec = durationMs / 1000;
  const width = TIMELINE_PADDING * 2 + durationSec * pixelsPerSec;
  const height = 50;
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
      positions: f.positions.map(p => ({ ...p })),
    })),
    selectedFormation,
    currentMs,
  };
}

function saveSnapshot() {
  pushState(takeSnapshot());
  unsaved = true;
}

function restoreSnapshot(snapshot) {
  if (!snapshot) return;
  noteData.dancers = snapshot.dancers;
  noteData.formations = snapshot.formations;
  selectedFormation = snapshot.selectedFormation;
  currentMs = snapshot.currentMs;

  engine.setFormations(noteData.formations, noteData.dancers);
  engine.seek(currentMs);

  // Re-render everything
  const formationsEl = document.querySelector('#timeline-formations');
  renderFormationBoxes(formationsEl);
  const dancerList = document.querySelector('#dancer-list');
  if (dancerList) renderDancerList(dancerList);
  updateStage();
  updateTimelineMarker();
  highlightFormation();
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
      <div class="shortcut-modal__title">키보드 단축키</div>
      <div class="shortcut-modal__list">
        <div class="shortcut-row"><kbd>Space</kbd><span>재생 / 정지</span></div>
        <div class="shortcut-row"><kbd>←</kbd> <kbd>→</kbd><span>250ms 이동</span></div>
        <div class="shortcut-row"><kbd>Ctrl+Z</kbd><span>실행 취소</span></div>
        <div class="shortcut-row"><kbd>Ctrl+Shift+Z</kbd><span>다시 실행</span></div>
        <div class="shortcut-row"><kbd>Ctrl+C</kbd><span>대형 복사</span></div>
        <div class="shortcut-row"><kbd>Ctrl+V</kbd><span>대형 붙여넣기</span></div>
        <div class="shortcut-row"><kbd>Shift+클릭</kbd><span>대형 다중 선택</span></div>
        <div class="shortcut-row"><kbd>?</kbd><span>이 도움말 열기/닫기</span></div>
      </div>
      <button class="btn btn--ghost shortcut-modal__close" id="shortcut-close">닫기</button>
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
  return `${min}분 ${String(sec).padStart(2, '0')}초 (총 ${totalSec}초)`;
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
