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
export const TIME_UNIT = 250; // ms

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
