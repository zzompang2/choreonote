import { NoteStore } from '../store/NoteStore.js';
import { StageRenderer } from '../renderer/StageRenderer.js';
import { PlaybackEngine } from '../engine/PlaybackEngine.js';
import { VideoExporter } from '../engine/VideoExporter.js';
import { navigate, setNavigationGuard, clearNavigationGuard } from '../utils/router.js';
import { showToast } from '../utils/toast.js';
import { pushState, undo, redo, canUndo, canRedo, clearHistory } from '../utils/history.js';
import {
  PIXEL_PER_SEC, TIMELINE_PADDING, TIME_UNIT,
  formatTime, floorTime, clamp, roundToGrid, GRID_GAP, HALF_W, HALF_H,
} from '../utils/constants.js';

let engine = null;
let renderer = null;
let noteData = null;
let selectedFormation = 0;
let currentMs = 0;
let unsaved = false;

export async function renderEditor(container, noteId) {
  noteId = Number(noteId);
  noteData = await NoteStore.loadNote(noteId);
  if (!noteData) {
    showToast('노트를 찾을 수 없습니다');
    navigate('/dashboard');
    return;
  }

  container.innerHTML = buildEditorHTML(noteData);

  // Init engine
  engine = new PlaybackEngine();
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
  setupMusicUpload(container, noteId);

  // Initial render
  updateStage();
  updateTimelineMarker();
  highlightFormation();

  // Initialize undo history with current state
  clearHistory();
  saveSnapshot();

  // Request persistent storage
  NoteStore.requestPersistence();
}

function buildEditorHTML(data) {
  const durationSec = (data.note.duration || 30000) / 1000;
  const timelineWidth = TIMELINE_PADDING * 2 + durationSec * PIXEL_PER_SEC;

  return `
    <div class="editor">
      <div class="editor__header">
        <button class="editor__back" id="back-btn">← </button>
        <input class="editor__title-input" id="title-input" value="${escapeAttr(data.note.title)}" />
        <div class="editor__actions">
          <button class="btn btn--ghost" id="music-btn">음악</button>
          <button class="btn btn--ghost" id="export-json-btn">백업</button>
          <button class="btn btn--ghost" id="export-video-btn">영상</button>
          <button class="btn btn--primary" id="save-btn">저장</button>
        </div>
      </div>

      <div class="player-bar">
        <button class="player-bar__btn" id="play-btn">▶</button>
        <span class="player-bar__time" id="time-display">${formatTime(0, true)}</span>
        <span class="player-bar__time" style="color:var(--text-secondary)">/</span>
        <span class="player-bar__time" id="duration-display">${formatTime(data.note.duration, true)}</span>

        <div class="toolbar__separator"></div>

        <div class="toolbar">
          <button class="toolbar__btn" id="add-formation-btn">+ 대형</button>
          <button class="toolbar__btn" id="del-formation-btn">- 대형</button>
          <button class="toolbar__btn" id="copy-btn">복사</button>
          <button class="toolbar__btn" id="paste-btn">붙여넣기</button>
          <div class="toolbar__separator"></div>
          <button class="toolbar__btn" id="snap-btn">스냅</button>
          <button class="toolbar__btn" id="view-3d-btn">3D</button>
          <button class="toolbar__btn" id="names-btn">이름</button>
        </div>
      </div>

      <div class="editor__main">
        <div class="stage-wrap">
          <canvas id="stage-canvas" class="stage-canvas"></canvas>
        </div>
      </div>

      <div class="editor__sidebar" id="sidebar">
        <div class="sidebar__section">
          <div class="sidebar__section-title">댄서</div>
          <div class="dancer-list" id="dancer-list"></div>
          <button class="btn btn--ghost" id="add-dancer-btn" style="margin-top:8px;width:100%;font-size:12px">+ 댄서 추가</button>
        </div>
      </div>

      <div class="editor__timeline" id="timeline-scroll">
        <div class="timeline" id="timeline" style="width:${timelineWidth}px">
          <div class="timeline__ruler" id="timeline-ruler"></div>
          <div class="timeline__formations" id="timeline-formations"></div>
          <div class="timeline__marker" id="timeline-marker" style="left:${TIMELINE_PADDING}px">
            <div class="timeline__marker-handle"></div>
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
    } else {
      engine.play(currentMs);
      playBtn.textContent = '⏸';
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      playBtn.click();
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
  });

  // Prevent accidental navigation on unsaved changes
  unsaved = true;
  setNavigationGuard(() => unsaved);

  window.onbeforeunload = (e) => {
    if (unsaved) {
      e.preventDefault();
    }
  };

  // Renderer drag callbacks
  renderer.onDancerDragEnd = (dancerIndex, newX, newY, selectedSet) => {
    if (engine.isPlaying || selectedFormation < 0) return;
    const f = noteData.formations[selectedFormation];
    if (!f) return;

    const dancer = noteData.dancers[dancerIndex];
    const pos = f.positions.find((p) => p.dancerId === dancer.id);
    if (pos) {
      const snap = renderer.isSnap;
      pos.x = snap ? roundToGrid(clamp(newX, -HALF_W, HALF_W), GRID_GAP) : clamp(Math.round(newX), -HALF_W, HALF_W);
      pos.y = snap ? roundToGrid(clamp(newY, -HALF_H, HALF_H), GRID_GAP) : clamp(Math.round(newY), -HALF_H, HALF_H);
    }
    updateStage(); saveSnapshot();
  };

  renderer.onDancerDrag = (dancerIndex, newX, newY) => {
    if (engine.isPlaying || selectedFormation < 0) return;
    // Live preview during drag
    const positions = engine.calcPositionsAt(currentMs);
    const snap = renderer.isSnap;
    positions[dancerIndex] = {
      x: snap ? roundToGrid(clamp(newX, -HALF_W, HALF_W), GRID_GAP) : clamp(Math.round(newX), -HALF_W, HALF_W),
      y: snap ? roundToGrid(clamp(newY, -HALF_H, HALF_H), GRID_GAP) : clamp(Math.round(newY), -HALF_H, HALF_H),
    };
    renderer.setCurrentState(noteData.dancers, positions);
    renderer.drawFrame(noteData.dancers, positions);
  };
}

// --- Timeline ---
function setupTimeline(container) {
  const ruler = container.querySelector('#timeline-ruler');
  const formationsEl = container.querySelector('#timeline-formations');
  const timelineScroll = container.querySelector('#timeline-scroll');
  const durationSec = (noteData.note.duration || 30000) / 1000;

  // Ruler ticks
  for (let s = 0; s <= durationSec; s++) {
    const tick = document.createElement('div');
    tick.className = 'timeline__tick';
    tick.style.left = `${TIMELINE_PADDING + s * PIXEL_PER_SEC}px`;
    tick.textContent = formatTime(s * 1000);
    ruler.appendChild(tick);
  }

  // Formation boxes
  renderFormationBoxes(formationsEl);

  // Ruler click to seek
  ruler.addEventListener('click', (e) => {
    const rect = ruler.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ms = floorTime(Math.max(0, (x - TIMELINE_PADDING) / PIXEL_PER_SEC * 1000));
    seekTo(ms);
  });

  // Marker drag
  const marker = container.querySelector('#timeline-marker');
  const handle = marker.querySelector('.timeline__marker-handle');
  let markerDragging = false;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    markerDragging = true;
  });

  document.addEventListener('mousemove', (e) => {
    if (!markerDragging) return;
    const rect = timelineScroll.getBoundingClientRect();
    const scrollLeft = timelineScroll.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const ms = floorTime(clamp((x - TIMELINE_PADDING) / PIXEL_PER_SEC * 1000, 0, noteData.note.duration));
    seekTo(ms);
  });

  document.addEventListener('mouseup', () => {
    markerDragging = false;
  });
}

function renderFormationBoxes(formationsEl) {
  formationsEl.innerHTML = '';
  noteData.formations.forEach((f, i) => {
    const box = document.createElement('div');
    box.className = 'formation-box' + (i === selectedFormation ? ' formation-box--selected' : '');
    box.style.left = `${TIMELINE_PADDING + f.startTime / 1000 * PIXEL_PER_SEC}px`;
    box.style.width = `${f.duration / 1000 * PIXEL_PER_SEC}px`;
    box.textContent = `${i + 1}`;
    box.dataset.index = i;

    // Click to select
    box.addEventListener('click', (e) => {
      if (e.target.classList.contains('formation-box__handle')) return;
      selectedFormation = i;
      seekTo(f.startTime);
      highlightFormation();
    });

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
  let origStart = 0;
  let origDuration = 0;
  let targetFormation = null;
  let didDrag = false;

  el.addEventListener('mousedown', (e) => {
    if (engine.isPlaying) return;
    if (mode !== 'body' && !e.target.classList.contains('formation-box__handle')) return;
    e.stopPropagation();
    startX = e.clientX;
    didDrag = false;
    targetFormation = noteData.formations[fIdx];
    origStart = targetFormation.startTime;
    origDuration = targetFormation.duration;

    const onMove = (ev) => {
      if (Math.abs(ev.clientX - startX) > 3) didDrag = true;
      const dx = ev.clientX - startX;
      const dtMs = Math.round(dx / PIXEL_PER_SEC * 1000 / TIME_UNIT) * TIME_UNIT;

      if (mode === 'body') {
        targetFormation.startTime = Math.max(0, origStart + dtMs);
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

      if (!didDrag && mode === 'body') {
        // Click without drag: select and seek
        selectedFormation = fIdx;
        seekTo(targetFormation.startTime);
        highlightFormation();
        return;
      }

      // Re-sort formations by startTime
      noteData.formations.sort((a, b) => a.startTime - b.startTime);

      // Track selected formation by reference, not index
      selectedFormation = noteData.formations.indexOf(targetFormation);
      if (selectedFormation < 0) selectedFormation = 0;

      // Sync engine with re-sorted formations
      engine.setFormations(noteData.formations, noteData.dancers);

      const formationsEl = document.querySelector('#timeline-formations');
      renderFormationBoxes(formationsEl);
      updateStage(); saveSnapshot();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// --- Sidebar ---
function setupSidebar(container) {
  const list = container.querySelector('#dancer-list');
  const addBtn = container.querySelector('#add-dancer-btn');

  renderDancerList(list);

  addBtn.addEventListener('click', () => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    const idx = noteData.dancers.length;
    const newDancer = {
      id: Date.now(),
      noteId: noteData.note.id,
      name: `댄서${idx + 1}`,
      color: colors[idx % colors.length],
      order: idx,
    };
    noteData.dancers.push(newDancer);

    // Add position to all formations
    for (const f of noteData.formations) {
      f.positions.push({ dancerId: newDancer.id, x: 0, y: 0 });
    }

    engine.setFormations(noteData.formations, noteData.dancers);
    renderDancerList(list);
    updateStage(); saveSnapshot();
  });
}

function renderDancerList(list) {
  list.innerHTML = noteData.dancers.map((d, i) => `
    <div class="dancer-item" data-index="${i}">
      <input type="color" class="dancer-item__color" value="${d.color}" data-color="${i}" />
      <input class="dancer-item__name" value="${escapeAttr(d.name)}" data-name="${i}" />
      <button class="dancer-item__remove" data-remove="${i}">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-name]').forEach((input) => {
    input.addEventListener('change', (e) => {
      noteData.dancers[Number(e.target.dataset.name)].name = e.target.value;
      updateStage(); saveSnapshot();
    });
  });

  list.querySelectorAll('[data-color]').forEach((input) => {
    input.addEventListener('input', (e) => {
      noteData.dancers[Number(e.target.dataset.color)].color = e.target.value;
      updateStage();
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
      updateStage(); saveSnapshot();
    });
  });
}

// --- Toolbar ---
function setupToolbar(container) {
  const addBtn = container.querySelector('#add-formation-btn');
  const delBtn = container.querySelector('#del-formation-btn');
  const copyBtn = container.querySelector('#copy-btn');
  const pasteBtn = container.querySelector('#paste-btn');
  const snapBtn = container.querySelector('#snap-btn');
  const view3dBtn = container.querySelector('#view-3d-btn');
  const namesBtn = container.querySelector('#names-btn');
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
    if (selectedFormation < 0) {
      showToast('붙여넣을 대형을 선택하세요');
      return;
    }
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

  snapBtn.addEventListener('click', () => {
    renderer.isSnap = !renderer.isSnap;
    snapBtn.classList.toggle('toolbar__btn--active', renderer.isSnap);
  });

  view3dBtn.addEventListener('click', () => {
    const is3D = !renderer.is3D;
    renderer.set3D(is3D, 'css');
    view3dBtn.classList.toggle('toolbar__btn--active', is3D);
    updateStage();
  });

  namesBtn.addEventListener('click', () => {
    renderer.showNames = !renderer.showNames;
    namesBtn.classList.toggle('toolbar__btn--active', renderer.showNames);
    updateStage();
  });
  namesBtn.classList.add('toolbar__btn--active'); // default on
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
  const origGuard = navigationGuard;
  const cleanupAutoSave = () => clearInterval(autoSaveInterval);
  window.addEventListener('hashchange', cleanupAutoSave, { once: true });

  container.querySelector('#export-json-btn').addEventListener('click', async () => {
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

  // Video export
  const videoExporter = new VideoExporter();
  const exportVideoBtn = container.querySelector('#export-video-btn');

  // Export overlay to block editing
  const overlay = document.createElement('div');
  overlay.className = 'export-overlay';
  overlay.innerHTML = `
    <div class="export-overlay__box">
      <div class="export-overlay__text">영상 내보내는 중...</div>
      <div class="export-overlay__progress" id="export-progress">0%</div>
      <button class="btn btn--danger" id="export-cancel-btn">취소</button>
    </div>
  `;

  exportVideoBtn.addEventListener('click', () => {
    if (videoExporter.isExporting) return;
    if (engine.isPlaying) engine.pause();

    const is3D = renderer.is3D;

    // Show overlay
    container.appendChild(overlay);
    const progressEl = overlay.querySelector('#export-progress');
    overlay.querySelector('#export-cancel-btn').addEventListener('click', () => {
      videoExporter.cancel();
      overlay.remove();
      showToast('영상 내보내기 취소됨');
    });

    videoExporter.export({
      dancers: noteData.dancers,
      formations: noteData.formations,
      audioBlob: noteData.musicBlob,
      duration: noteData.note.duration,
      is3D,
      showNames: renderer.showNames,
      onProgress: (percent) => {
        progressEl.textContent = `${percent}%`;
      },
      onComplete: (blob, mimeType) => {
        overlay.remove();
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
        overlay.remove();
        showToast('영상 내보내기 실패: ' + err.message);
      },
    });
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
    const timelineWidth = TIMELINE_PADDING * 2 + durationSec * PIXEL_PER_SEC;
    const timeline = container.querySelector('#timeline');
    timeline.style.width = `${timelineWidth}px`;

    const ruler = container.querySelector('#timeline-ruler');
    ruler.innerHTML = '';
    for (let s = 0; s <= durationSec; s++) {
      const tick = document.createElement('div');
      tick.className = 'timeline__tick';
      tick.style.left = `${TIMELINE_PADDING + s * PIXEL_PER_SEC}px`;
      tick.textContent = formatTime(s * 1000);
      ruler.appendChild(tick);
    }

    showToast(`음악 로드됨: ${file.name}`);
  });
}

// --- Helpers ---
function seekTo(ms) {
  if (engine.isPlaying) engine.pause();
  currentMs = ms;
  engine.seek(ms);

  const positions = engine.calcPositionsAt(ms);
  renderer.setCurrentState(noteData.dancers, positions);
  renderer.drawFrame(noteData.dancers, positions);

  document.querySelector('#time-display').textContent = formatTime(ms, true);
  updateTimelineMarker();

  // Auto-select formation, or deselect if in empty space
  const fIdx = noteData.formations.findIndex((f) => ms >= f.startTime && ms < f.startTime + f.duration);
  if (fIdx >= 0) {
    selectedFormation = fIdx;
  } else {
    selectedFormation = -1;
  }
  highlightFormation();

  document.querySelector('#play-btn').textContent = '▶';
}

function updateStage() {
  const positions = engine.calcPositionsAt(currentMs);
  renderer.setCurrentState(noteData.dancers, positions);
  renderer.drawFrame(noteData.dancers, positions);
}

function updateTimelineMarker() {
  const marker = document.querySelector('#timeline-marker');
  if (marker) {
    marker.style.left = `${TIMELINE_PADDING + currentMs / 1000 * PIXEL_PER_SEC}px`;
  }
}

function highlightFormation() {
  document.querySelectorAll('.formation-box').forEach((box, i) => {
    box.classList.toggle('formation-box--selected', i === selectedFormation);
  });
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

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
