import { StageRenderer } from '../renderer/StageRenderer.js';
import { PlaybackEngine } from '../engine/PlaybackEngine.js';
import { loadShareData } from '../utils/share.js';
import {
  PIXEL_PER_SEC, TIMELINE_PADDING,
  formatTime, floorTime, clamp,
  CANVAS_WIDTH, CANVAS_HEIGHT, HALF_W, HALF_H,
  setStageSize,
} from '../utils/constants.js';
import { t } from '../utils/i18n.js';
import { buildHelpPanelHTML, initEmbeddedChat } from '../components/ChatBot.js';

let engine, renderer, noteData, dancers, formations;
let currentMs = 0;
let selectedFormation = 0;
let pixelsPerSec = PIXEL_PER_SEC;

export async function renderViewer(container, shareId) {
  container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--text-secondary)">${t('shareLoading')}</div>`;

  const rawData = await loadShareData(shareId);
  if (!rawData) {
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--danger)">${t('shareNotFound')}</div>`;
    return;
  }

  noteData = rawData;
  setStageSize(noteData.note.stageWidth || 600, noteData.note.stageHeight || 400);

  const duration = noteData.note.duration || 30000;
  const durationSec = duration / 1000;
  pixelsPerSec = PIXEL_PER_SEC;
  currentMs = 0;
  selectedFormation = 0;

  // dancers/formations에 id 매핑
  dancers = noteData.dancers.map((d, i) => ({ id: i + 1, name: d.name, color: d.color }));
  formations = noteData.formations.map((f, fi) => ({
    ...f,
    id: fi + 1,
    order: fi,
    positions: f.positions.map((p) => ({ ...p, dancerId: p.dancerIndex + 1 })),
  }));

  const timelineWidth = TIMELINE_PADDING * 2 + durationSec * pixelsPerSec;

  const initAudience = noteData.note.audienceDirection || 'top';
  const isMobile = window.innerWidth <= 768;

  container.innerHTML = `
    <div class="viewer${isMobile ? '' : ' viewer--sidebar-open'}">
      <div class="viewer__header">
        <div class="viewer__title">${noteData.note.title || t('shareUntitled')}</div>
        <a href="/#/" class="viewer__logo">ChoreoNote</a>
      </div>

      <div class="viewer__stage">
        <canvas id="stage-canvas"></canvas>
        <div class="stage-zoom-badge" id="stage-zoom-badge"></div>
      </div>

      <div class="editor__sidebar${isMobile ? ' editor__sidebar--hidden' : ''}" id="sidebar">
        <div class="sidebar__panel" id="panel-dancers">
          <div class="sidebar__panel-title">${t('dancersTitle')}</div>
          <div class="sidebar__scroll">
            <div class="dancer-list" id="dancer-list"></div>
          </div>
        </div>
        <div class="sidebar__panel sidebar__panel--hidden" id="panel-settings">
          <div class="sidebar__panel-title">${t('viewTitle')}</div>
          <div class="sidebar__scroll">
            <div class="settings-section">
              <div class="settings-label">${t('viewLabel')}</div>
              <div class="settings-options" id="sidebar-display-options">
                <button class="settings-option settings-option--active" data-display="number">${t('viewNumber')}</button>
                <button class="settings-option" data-display="name">${t('viewName')}</button>
                <button class="settings-option" data-display="none">${t('none')}</button>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-label">${t('audienceDir')}</div>
              <div class="settings-options" id="view-audience-options">
                <button class="settings-option${initAudience === 'top' ? ' settings-option--active' : ''}" data-audience="top">${t('audienceTop')}</button>
                <button class="settings-option${initAudience === 'bottom' ? ' settings-option--active' : ''}" data-audience="bottom">${t('audienceBottom')}</button>
              </div>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
              <div class="settings-label">${t('addMusic')}</div>
              <button class="btn btn--ghost" id="viewer-music-btn" style="width:100%;font-size:12px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                <span id="viewer-music-label">${t('addMusic')}</span>
              </button>
              <input type="file" id="viewer-music-input" accept="audio/*" style="display:none" />
            </div>
          </div>
        </div>
        <div class="sidebar__panel sidebar__panel--hidden" id="panel-help">
          ${buildHelpPanelHTML('viewer')}
        </div>
      </div>

      <div class="sidebar-rail" id="sidebar-rail">
        <button class="sidebar-rail__icon sidebar-rail__icon--active" data-panel="dancers" title="${t('railDancers')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></button>
        <button class="sidebar-rail__icon" data-panel="settings" title="${t('railView')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="6" x2="22" y2="6"/><line x1="2" y1="18" x2="22" y2="18"/><line x1="6" y1="2" x2="6" y2="22"/><line x1="18" y1="2" x2="18" y2="22"/></svg></button>
        <button class="sidebar-rail__icon" data-panel="help" title="${t('railHelp')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></button>
      </div>

      <div class="player-bar">
        <div class="player-bar__row">
          <button class="player-bar__btn" id="play-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path id="play-icon" d="M8 5v14l11-7z"/></svg></button>
          <button class="player-bar__btn" id="stop-btn" title="${t('stopBtn')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg></button>
          <button class="player-bar__btn" id="prev-formation-btn" title="${t('prevFormation')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg></button>
          <button class="player-bar__btn" id="next-formation-btn" title="${t('nextFormation')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
          <span class="player-bar__time" id="time-display">${formatTime(0, true)}</span><span class="player-bar__time player-bar__time--sep">/</span><span class="player-bar__time">${formatTime(duration, true)}</span>
        </div>
      </div>

      <div class="editor__timeline-wrap">
        <div class="editor__timeline" id="timeline-scroll">
          <div class="timeline" id="timeline" style="width:${timelineWidth}px">
            <div class="timeline__ruler" id="timeline-ruler"></div>
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
  `;

  // 모바일 오버레이
  let existingOverlay = document.querySelector('.sidebar-overlay');
  if (existingOverlay) existingOverlay.remove();
  const overlayEl = document.createElement('div');
  overlayEl.className = 'sidebar-overlay';
  document.body.appendChild(overlayEl);

  // --- 엔진 초기화 ---
  engine = new PlaybackEngine();
  engine.duration = duration;
  engine.setFormations(formations, dancers);

  // --- 렌더러 초기화 ---
  const canvas = container.querySelector('#stage-canvas');
  renderer = new StageRenderer(canvas);
  renderer.audienceDirection = noteData.note.audienceDirection || 'top';
  if (noteData.note.dancerShape) renderer.dancerShape = noteData.note.dancerShape;
  if (noteData.note.gridGap) renderer.gridGap = noteData.note.gridGap;
  if (noteData.note.dancerScale) renderer.dancerScale = noteData.note.dancerScale;
  if (noteData.note.showWings === true) renderer.showWings = true;
  if (noteData.note.markers) renderer.markers = noteData.note.markers;
  renderer.hideHandles = true;
  renderer.touchScale = window.innerWidth <= 768 ? 1.4 : 1.0;
  renderer._drawGridCache();

  // --- 스테이지 줌 배지 ---
  const zoomBadge = container.querySelector('#stage-zoom-badge');
  renderer.onZoomChange = (zoom) => {
    zoomBadge.textContent = `${Math.round(zoom * 100)}%`;
    zoomBadge.classList.toggle('stage-zoom-badge--visible', Math.abs(zoom - 1) > 0.01);
  };
  zoomBadge.addEventListener('click', () => renderer.resetZoom());

  // --- 뷰 옵션 ---
  const redraw = () => {
    const positions = engine.calcPositionsAt(currentMs);
    if (positions) {
      renderer.setCurrentState(dancers, positions);
      updateWaypointPaths(currentMs);
      renderer.drawFrame(dancers, positions);
    }
  };

  // --- 사이드바 레일 토글 ---
  setupViewerSidebar(container);

  // --- 댄서 목록 (읽기 전용) ---
  renderViewerDancerList(container);

  // --- 댄서 라벨 (번호/이름/없음) ---
  const displayOptions = container.querySelector('#sidebar-display-options');
  displayOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.settings-option');
    if (!btn) return;
    displayOptions.querySelectorAll('.settings-option').forEach(b => b.classList.remove('settings-option--active'));
    btn.classList.add('settings-option--active');
    const mode = btn.dataset.display;
    renderer.showNumbers = mode === 'number';
    renderer.showNames = mode === 'name';
    redraw();
  });

  // --- 관객 방향 ---
  const audienceOptions = container.querySelector('#view-audience-options');
  let currentAudience = renderer.audienceDirection;
  audienceOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.settings-option');
    if (!btn) return;
    const newDir = btn.dataset.audience;
    const prevFlipped = currentAudience === 'bottom';
    const newFlipped = newDir === 'bottom';

    // top↔bottom 전환 시 좌표 180° 회전
    if (prevFlipped !== newFlipped) {
      for (const f of formations) {
        for (const pos of f.positions) {
          pos.x = -pos.x;
          pos.y = -pos.y;
          pos.angle = ((pos.angle || 0) + 180) % 360;
          if (pos.waypoints) {
            for (const wp of pos.waypoints) { wp.x = -wp.x; wp.y = -wp.y; }
          }
        }
      }
      if (renderer.markers) {
        for (const m of renderer.markers) { m.x = -m.x; m.y = -m.y; }
      }
      engine.setFormations(formations, dancers);
    }

    currentAudience = newDir;
    audienceOptions.querySelectorAll('.settings-option').forEach(b => b.classList.remove('settings-option--active'));
    btn.classList.add('settings-option--active');
    renderer.audienceDirection = newDir;
    renderer._drawGridCache();
    redraw();
  });

  // --- 음악 로드 ---
  setupViewerMusic(container);

  // --- 캔버스 크기 맞추기 ---
  const fitStage = () => {
    const stageContainer = container.querySelector('.viewer__stage');
    if (!stageContainer) return;
    const availW = stageContainer.clientWidth;
    const availH = stageContainer.clientHeight;
    const baseRatio = CANVAS_WIDTH / CANVAS_HEIGHT;
    let w, h;
    if (availW / availH > baseRatio) {
      h = availH;
      w = h * baseRatio;
    } else {
      w = availW;
      h = w / baseRatio;
    }
    const topPad = renderer._3dTopPad || 0;
    const scale = w / CANVAS_WIDTH;
    const topPadCss = Math.round(topPad * scale);
    canvas.style.width = Math.floor(w) + 'px';
    canvas.style.height = Math.floor(h + topPadCss) + 'px';
    canvas.style.marginTop = topPad ? `-${topPadCss}px` : '';
  };
  fitStage();
  window.addEventListener('resize', fitStage);

  // 초기 프레임
  const initPositions = engine.calcPositionsAt(0);
  if (initPositions) {
    renderer.setCurrentState(dancers, initPositions);
    renderer.drawFrame(dancers, initPositions);
  }

  // --- 타임라인 ---
  setupViewerTimeline(container, duration);

  // --- 재생 ---
  setupViewerPlayback(container, duration);
  initEmbeddedChat(container, 'viewer');

  // --- 스페이스바 ---
  const onKeydown = (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      container.querySelector('#play-btn').click();
    }
    if (e.code === 'ArrowUp') {
      e.preventDefault();
      container.querySelector('#prev-formation-btn').click();
    }
    if (e.code === 'ArrowDown') {
      e.preventDefault();
      container.querySelector('#next-formation-btn').click();
    }
    if ((e.key === '=' || e.key === '+') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      container.querySelector('#zoom-in-btn')?.click();
    }
    if (e.key === '-' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      container.querySelector('#zoom-out-btn')?.click();
    }
  };
  document.addEventListener('keydown', onKeydown);
}

// ====== 재생 ======

function setupViewerPlayback(container, duration) {
  const playBtn = container.querySelector('#play-btn');
  const playIcon = container.querySelector('#play-icon');
  const stopBtn = container.querySelector('#stop-btn');
  const prevBtn = container.querySelector('#prev-formation-btn');
  const nextBtn = container.querySelector('#next-formation-btn');
  const timeDisplay = container.querySelector('#time-display');

  const playPath = 'M8 5v14l11-7z';
  const pausePath = 'M6 4h4v16H6zM14 4h4v16h-4z';

  engine.onPositionsUpdate = (positions) => {
    renderer.setCurrentState(dancers, positions);
    updateWaypointPaths(currentMs);
    renderer.drawFrame(dancers, positions);
  };

  engine.onTimeUpdate = (ms) => {
    currentMs = ms;
    timeDisplay.textContent = formatTime(ms, true);
    updateMarker();

    // 현재 대형 하이라이트
    const fIdx = formations.findIndex((f) => ms >= f.startTime && ms < f.startTime + f.duration);
    if (fIdx >= 0 && fIdx !== selectedFormation) {
      selectedFormation = fIdx;
      highlightFormation(container);
    }
  };

  engine.onPlaybackEnd = () => {
    playIcon.setAttribute('d', playPath);
  };

  playBtn.addEventListener('click', () => {
    if (engine.isPlaying) {
      engine.pause();
      playIcon.setAttribute('d', playPath);
    } else {
      engine.play(currentMs >= duration ? 0 : undefined);
      playIcon.setAttribute('d', pausePath);
    }
  });

  // 정지 — 처음으로 돌아가기
  stopBtn.addEventListener('click', () => {
    if (engine.isPlaying) engine.pause();
    playIcon.setAttribute('d', playPath);
    seekTo(container, 0, duration);
  });

  // 이전 대형
  prevBtn.addEventListener('click', () => {
    if (formations.length === 0) return;
    const sorted = [...formations].sort((a, b) => a.startTime - b.startTime);
    // 현재 시간보다 이전에 시작하는 대형 찾기
    let target = sorted[0];
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].startTime < currentMs - 50) { target = sorted[i]; break; }
    }
    seekTo(container, target.startTime, duration);
  });

  // 다음 대형
  nextBtn.addEventListener('click', () => {
    if (formations.length === 0) return;
    const sorted = [...formations].sort((a, b) => a.startTime - b.startTime);
    let target = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].startTime > currentMs + 50) { target = sorted[i]; break; }
    }
    seekTo(container, target.startTime, duration);
  });
}

// ====== 타임라인 ======

function setupViewerTimeline(container, duration) {
  const ruler = container.querySelector('#timeline-ruler');
  const formationsEl = container.querySelector('#timeline-formations');
  const timelineScroll = container.querySelector('#timeline-scroll');
  const durationSec = duration / 1000;

  // 눈금
  buildRulerTicks(ruler, durationSec);

  // 대형 박스
  renderFormationBoxes(formationsEl);

  // Shift+휠 가로 스크롤
  timelineScroll.addEventListener('wheel', (e) => {
    if (e.shiftKey) {
      e.preventDefault();
      timelineScroll.scrollLeft += e.deltaY || e.deltaX;
    }
  }, { passive: false });

  // 빈 영역 클릭 → seek
  formationsEl.addEventListener('click', (e) => {
    if (e.target !== formationsEl) return;
    const rect = formationsEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ms = floorTime(Math.max(0, (x - TIMELINE_PADDING) / pixelsPerSec * 1000));
    seekTo(container, ms, duration);
  });

  // 대형 박스 클릭 → seek + 선택
  formationsEl.addEventListener('click', (e) => {
    const box = e.target.closest('.formation-box');
    if (!box) return;
    const idx = Number(box.dataset.index);
    const f = formations[idx];
    selectedFormation = idx;
    seekTo(container, f.startTime, duration);
    highlightFormation(container);
  });

  // 룰러/마커 드래그 → scrub
  const marker = container.querySelector('#timeline-marker');
  const handle = marker.querySelector('.timeline__marker-handle');
  let rulerDragging = false;

  function rulerSeek(e) {
    const rect = ruler.getBoundingClientRect();
    const cx = e.clientX !== undefined ? e.clientX : (e.touches ? e.touches[0].clientX : 0);
    const x = cx - rect.left;
    const ms = floorTime(clamp((x - TIMELINE_PADDING) / pixelsPerSec * 1000, 0, duration));
    seekTo(container, ms, duration);
  }

  ruler.addEventListener('mousedown', (e) => { e.preventDefault(); rulerDragging = true; rulerSeek(e); });
  ruler.addEventListener('touchstart', (e) => { e.preventDefault(); rulerDragging = true; rulerSeek(e); }, { passive: false });
  handle.addEventListener('mousedown', (e) => { e.preventDefault(); rulerDragging = true; });
  handle.addEventListener('touchstart', (e) => { e.preventDefault(); rulerDragging = true; }, { passive: false });

  document.addEventListener('mousemove', (e) => { if (rulerDragging) rulerSeek(e); });
  document.addEventListener('touchmove', (e) => { if (rulerDragging) rulerSeek(e); }, { passive: false });
  document.addEventListener('mouseup', () => { rulerDragging = false; });
  document.addEventListener('touchend', () => { rulerDragging = false; });

  // --- 스크롤바 ---
  const scrollbar = container.querySelector('#timeline-scrollbar');
  const thumb = container.querySelector('#scrollbar-thumb');

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

  // 썸 드래그
  let thumbDrag = null;
  thumb.addEventListener('mousedown', (e) => { e.preventDefault(); thumbDrag = { startX: e.clientX, startScroll: timelineScroll.scrollLeft }; });
  thumb.addEventListener('touchstart', (e) => { e.preventDefault(); thumbDrag = { startX: e.touches[0].clientX, startScroll: timelineScroll.scrollLeft }; }, { passive: false });

  function thumbDragMove(clientX) {
    if (!thumbDrag) return;
    const trackW = scrollbar.clientWidth;
    const contentW = container.querySelector('#timeline').scrollWidth;
    const viewW = timelineScroll.clientWidth;
    const dx = clientX - thumbDrag.startX;
    const thumbW = parseFloat(thumb.style.width);
    const trackRange = trackW - thumbW;
    if (trackRange > 0) {
      timelineScroll.scrollLeft = thumbDrag.startScroll + (dx / trackRange) * (contentW - viewW);
    }
  }

  document.addEventListener('mousemove', (e) => thumbDragMove(e.clientX));
  document.addEventListener('touchmove', (e) => { if (thumbDrag) { e.preventDefault(); thumbDragMove(e.touches[0].clientX); } }, { passive: false });
  document.addEventListener('mouseup', () => { thumbDrag = null; });
  document.addEventListener('touchend', () => { thumbDrag = null; });

  scrollbar.addEventListener('click', (e) => {
    if (e.target !== scrollbar) return;
    const rect = scrollbar.getBoundingClientRect();
    const clickRatio = (e.clientX - rect.left) / rect.width;
    const contentW = container.querySelector('#timeline').scrollWidth;
    const viewW = timelineScroll.clientWidth;
    timelineScroll.scrollLeft = clickRatio * (contentW - viewW);
  });

  // --- 줌 ---
  const ZOOM_LEVELS = [20, 30, 40, 60, 80, 120, 160];

  function rebuildTimeline() {
    const timelineWidth = TIMELINE_PADDING * 2 + durationSec * pixelsPerSec;
    container.querySelector('#timeline').style.width = `${timelineWidth}px`;
    ruler.innerHTML = '';
    buildRulerTicks(ruler, durationSec);
    renderFormationBoxes(formationsEl);
    updateMarker();
    updateScrollbar();
    container.querySelector('#zoom-label').textContent = `${Math.round(pixelsPerSec / PIXEL_PER_SEC * 100)}%`;
  }

  function zoomAroundMarker(newPPS) {
    const markerPx = TIMELINE_PADDING + currentMs / 1000 * pixelsPerSec;
    const markerScreenX = markerPx - timelineScroll.scrollLeft;
    pixelsPerSec = newPPS;
    rebuildTimeline();
    const newMarkerPx = TIMELINE_PADDING + currentMs / 1000 * pixelsPerSec;
    timelineScroll.scrollLeft = newMarkerPx - markerScreenX;
    updateScrollbar();
  }

  container.querySelector('#zoom-in-btn').addEventListener('click', () => {
    const curIdx = ZOOM_LEVELS.findIndex(z => z >= pixelsPerSec);
    if (curIdx < ZOOM_LEVELS.length - 1) zoomAroundMarker(ZOOM_LEVELS[curIdx + 1]);
  });
  container.querySelector('#zoom-out-btn').addEventListener('click', () => {
    const curIdx = ZOOM_LEVELS.findIndex(z => z >= pixelsPerSec);
    if (curIdx > 0) zoomAroundMarker(ZOOM_LEVELS[curIdx - 1]);
  });
}

// ====== 헬퍼 ======

function seekTo(container, ms, duration) {
  if (engine.isPlaying) engine.pause();
  currentMs = ms;
  engine.seek(ms);
  container.querySelector('#time-display').textContent = formatTime(ms, true);
  updateMarker();

  const positions = engine.calcPositionsAt(ms);
  if (positions) {
    renderer.setCurrentState(dancers, positions);
    updateWaypointPaths(ms);
    renderer.drawFrame(dancers, positions);
  }

  // 대형 선택
  const fIdx = formations.findIndex((f) => ms >= f.startTime && ms < f.startTime + f.duration);
  if (fIdx >= 0) {
    selectedFormation = fIdx;
    highlightFormation(container);
  }

  // 재생 아이콘 복원
  const playIcon = container.querySelector('#play-icon');
  if (playIcon) playIcon.setAttribute('d', 'M8 5v14l11-7z');
}

function updateMarker() {
  const marker = document.querySelector('#timeline-marker');
  if (marker) marker.style.left = `${TIMELINE_PADDING + currentMs / 1000 * pixelsPerSec}px`;
}

function updateWaypointPaths(ms) {
  renderer._waypointPaths = null;

  // 동선 구간(두 대형 사이 갭)에 있는지 확인
  const sorted = formations.map((f, i) => ({ f, i })).sort((a, b) => a.f.startTime - b.f.startTime);
  for (let s = 0; s < sorted.length - 1; s++) {
    const fromF = sorted[s].f;
    const toF = sorted[s + 1].f;
    const fromEnd = fromF.startTime + fromF.duration;
    if (ms >= fromEnd && ms < toF.startTime) {
      // 동선 구간 — 모든 댄서의 경로 표시
      const paths = [];
      for (let i = 0; i < dancers.length; i++) {
        const d = dancers[i];
        const fromPos = fromF.positions.find(p => p.dancerId === d.id);
        const toPos = toF.positions.find(p => p.dancerId === d.id);
        if (fromPos && toPos) {
          const wp = toPos.waypoints || [{ x: Math.round((fromPos.x + toPos.x) / 2), y: Math.round((fromPos.y + toPos.y) / 2), t: 0.5 }];
          paths.push({
            dancerId: d.id,
            dancerIndex: i,
            color: d.color,
            points: [{ x: fromPos.x, y: fromPos.y }, ...wp, { x: toPos.x, y: toPos.y }],
          });
        }
      }
      renderer._waypointPaths = paths;
      return;
    }
  }
}

function highlightFormation(container) {
  container.querySelectorAll('.formation-box').forEach((box, i) => {
    box.classList.toggle('formation-box--selected', i === selectedFormation);
    box.classList.toggle('formation-box--active', i === selectedFormation);
  });
}

function renderFormationBoxes(formationsEl) {
  formationsEl.innerHTML = '';
  formations.forEach((f, i) => {
    const box = document.createElement('div');
    box.className = 'formation-box' + (i === selectedFormation ? ' formation-box--selected formation-box--active' : '');
    box.style.left = `${TIMELINE_PADDING + f.startTime / 1000 * pixelsPerSec}px`;
    box.style.width = `${f.duration / 1000 * pixelsPerSec}px`;
    box.dataset.index = i;
    box.style.cursor = 'pointer';

    // 댄서 배치 dot 썸네일
    const boxH = 44;
    const pad = 4;
    const stageW = HALF_W * 2;
    const stageH = HALF_H * 2;
    const scale = (boxH - pad * 2) / stageH;
    const thumbW = stageW * scale;
    const thumbH = stageH * scale;
    const ox = pad + thumbW / 2;
    const oy = boxH / 2;

    const thumb = document.createElement('div');
    thumb.className = 'formation-box__thumb';

    const outline = document.createElement('div');
    outline.className = 'formation-box__stage';
    outline.style.left = `${pad}px`;
    outline.style.top = `${pad}px`;
    outline.style.width = `${thumbW}px`;
    outline.style.height = `${thumbH}px`;
    thumb.appendChild(outline);

    for (const pos of f.positions) {
      const dancer = dancers.find(d => d.id === pos.dancerId);
      if (!dancer) continue;
      const dot = document.createElement('div');
      dot.className = 'formation-box__dot';
      dot.style.left = `${ox + pos.x * scale}px`;
      dot.style.top = `${oy + pos.y * scale}px`;
      dot.style.background = dancer.color || '#4ECDC4';
      thumb.appendChild(dot);
    }
    box.appendChild(thumb);

    formationsEl.appendChild(box);
  });

  // 동선 구간 화살표
  updateTransitionConnectors(formationsEl);
}

function updateTransitionConnectors(formationsEl) {
  formationsEl.querySelectorAll('.transition-connector').forEach(el => el.remove());
  const indexed = formations.map((f, i) => ({ f, i })).sort((a, b) => a.f.startTime - b.f.startTime);
  for (let s = 0; s < indexed.length - 1; s++) {
    const fromF = indexed[s].f;
    const toF = indexed[s + 1].f;
    const fromEnd = fromF.startTime + fromF.duration;
    if (toF.startTime <= fromEnd) continue;
    const left = TIMELINE_PADDING + fromEnd / 1000 * pixelsPerSec;
    const width = (toF.startTime - fromEnd) / 1000 * pixelsPerSec;
    if (width < 4) continue;
    const connector = document.createElement('div');
    connector.className = 'transition-connector';
    connector.style.left = `${left}px`;
    connector.style.width = `${width}px`;

    const h = 44;
    const connPad = 6;
    const x1 = connPad, y1 = h / 2;
    const x2 = width - connPad, y2 = h / 2;
    const wobble = Math.min(8, width * 0.08);
    const cx = width / 2, cy = h / 2 - wobble;
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

// ====== 사이드바 ======

function setupViewerSidebar(container) {
  const viewer = container.querySelector('.viewer');
  const sidebar = container.querySelector('#sidebar');
  const railIcons = container.querySelectorAll('.sidebar-rail__icon');
  const panels = container.querySelectorAll('.sidebar__panel');
  const isMobile = () => window.innerWidth <= 768;
  let activePanel = null;

  // 모바일 오버레이 (body에 추가됨)
  const overlay = document.querySelector('.sidebar-overlay');

  function closePanel() {
    sidebar.classList.add('editor__sidebar--hidden');
    railIcons.forEach(ic => ic.classList.remove('sidebar-rail__icon--active'));
    activePanel = null;
    overlay.classList.remove('sidebar-overlay--visible');
    if (viewer) viewer.classList.remove('viewer--sidebar-open');
  }

  function openPanel(name) {
    if (activePanel === name && !sidebar.classList.contains('editor__sidebar--hidden')) {
      closePanel();
      return;
    }
    sidebar.classList.remove('editor__sidebar--hidden');
    panels.forEach(p => p.classList.add('sidebar__panel--hidden'));
    const target = container.querySelector(`#panel-${name}`);
    if (target) target.classList.remove('sidebar__panel--hidden');
    railIcons.forEach(ic => ic.classList.toggle('sidebar-rail__icon--active', ic.dataset.panel === name));
    activePanel = name;

    if (isMobile()) {
      overlay.classList.add('sidebar-overlay--visible');
    } else {
      viewer.classList.add('viewer--sidebar-open');
    }
  }

  railIcons.forEach(ic => {
    ic.addEventListener('click', () => openPanel(ic.dataset.panel));
  });

  overlay.addEventListener('click', closePanel);

  // 모바일: 레일 하단 위치 → 바텀시트 max-height 계산용
  if (isMobile()) {
    sidebar.classList.add('editor__sidebar--hidden');
    railIcons.forEach(ic => ic.classList.remove('sidebar-rail__icon--active'));
    activePanel = null;

    const rail = container.querySelector('#sidebar-rail');
    if (rail) {
      const updateRailTop = () => {
        const rect = rail.getBoundingClientRect();
        sidebar.style.setProperty('--mobile-rail-top', `${rect.bottom}px`);
      };
      updateRailTop();
      window.addEventListener('resize', updateRailTop);
    }
  }

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      overlay.classList.remove('sidebar-overlay--visible');
    } else {
      closePanel();
    }
  });
}

function renderViewerDancerList(container) {
  const list = container.querySelector('#dancer-list');
  list.innerHTML = dancers.map((d, i) => `
    <div class="dancer-item" data-index="${i}">
      <span class="dancer-item__number">${i + 1}</span>
      <div class="dancer-item__color" style="background:${d.color}"></div>
      <span class="dancer-item__name-label">${d.name || `Dancer ${i + 1}`}</span>
    </div>
  `).join('');
}

function setupViewerMusic(container) {
  const musicBtn = container.querySelector('#viewer-music-btn');
  const musicInput = container.querySelector('#viewer-music-input');
  const musicLabel = container.querySelector('#viewer-music-label');

  musicBtn.addEventListener('click', () => musicInput.click());

  musicInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await engine.loadAudio(file);
      musicLabel.textContent = file.name;
    } catch (err) {
      console.error('Music load error:', err);
    }
  });
}

function buildRulerTicks(ruler, durationSec) {
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

  for (let sec = 0; sec <= durationSec; sec += subInterval) {
    const px = TIMELINE_PADDING + sec * pixelsPerSec;
    const isMajor = Math.abs(sec % majorInterval) < 0.001;
    const isMinor = !isMajor && Math.abs(sec % minorInterval) < 0.001;

    const line = document.createElement('div');
    line.className = 'timeline__tick-line' + (isMajor ? ' timeline__tick-line--major' : isMinor ? ' timeline__tick-line--minor' : ' timeline__tick-line--sub');
    line.style.left = `${px}px`;
    ruler.appendChild(line);

    if (isMajor) {
      const label = document.createElement('div');
      label.className = 'timeline__tick-label';
      label.style.left = `${px}px`;
      label.textContent = formatTime(sec * 1000);
      ruler.appendChild(label);
    }
  }
}
