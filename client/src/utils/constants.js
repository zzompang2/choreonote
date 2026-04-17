export let STAGE_WIDTH = 600;
export let STAGE_HEIGHT = 400;
export let HALF_W = STAGE_WIDTH / 2;
export let HALF_H = STAGE_HEIGHT / 2;

// Canvas includes offstage wings for dancer entry/exit
export const WING_SIZE = 80;
export let CANVAS_WIDTH = STAGE_WIDTH + WING_SIZE * 2;
export let CANVAS_HEIGHT = STAGE_HEIGHT + WING_SIZE * 2;

export function setStageSize(w, h) {
  STAGE_WIDTH = w;
  STAGE_HEIGHT = h;
  HALF_W = w / 2;
  HALF_H = h / 2;
  CANVAS_WIDTH = w + WING_SIZE * 2;
  CANVAS_HEIGHT = h + WING_SIZE * 2;
}
export const GRID_GAP = 30;

export const PIXEL_PER_SEC = 40;
export const TIMELINE_PADDING = 20;
export const TIME_UNIT = 125; // ms — 스냅/시크 단위 (1/8초, 120 BPM 8분음표)
export const MIN_FORMATION_DURATION = 250; // ms — 대형 최소 길이 (드래그/클릭 가능한 최소 크기)
export const DEFAULT_FORMATION_DURATION = 1000; // ms — 새 대형 기본 길이
export const PASTE_FORMATION_DURATION = 1250; // ms — 빈 공간 붙여넣기로 생성되는 대형 길이

export const DANCER_RADIUS = 15;

export function floorTime(ms) {
  return Math.floor(ms / TIME_UNIT) * TIME_UNIT;
}

export function formatTime(ms, withMs = false) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const base = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  if (!withMs) return base;
  const millis = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
  return `${base}.${millis}`;
}

export function roundToGrid(value, gap) {
  return Math.round(value / gap) * gap;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
