import { DANCER_RADIUS } from './constants.js';

/**
 * 대형 데이터를 캔버스에 썸네일로 렌더링.
 * Dashboard 노트 카드, 마켓 프리셋 카드 등에서 공통 사용.
 */
export function renderFormationThumbnail(canvas, { dancers, positions, stageWidth, stageHeight, dancerShape, dancerScale, showWings }) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  const styles = getComputedStyle(document.documentElement);
  const stageBg = styles.getPropertyValue('--stage-bg').trim() || '#1a1a2e';
  const wingBg = styles.getPropertyValue('--stage-wing').trim() || '#0a0a15';
  const cardBg = styles.getPropertyValue('--bg-card').trim() || '#16213e';

  if (!positions || positions.length === 0) {
    ctx.fillStyle = wingBg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = stageBg;
    const pad = 6;
    ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);
    return;
  }

  const halfW = stageWidth / 2;
  const halfH = stageHeight / 2;

  const wingRatio = showWings ? 0.08 : 0;
  const stageX = w * wingRatio;
  const stageY = h * wingRatio;
  const stageW = w * (1 - wingRatio * 2);
  const stageH = h * (1 - wingRatio * 2);
  const scaleX = stageW / stageWidth;
  const scaleY = stageH / stageHeight;
  const scale = Math.min(scaleX, scaleY);

  ctx.fillStyle = showWings ? wingBg : cardBg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = stageBg;
  ctx.fillRect(stageX, stageY, stageW, stageH);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 2]);
  ctx.strokeRect(stageX, stageY, stageW, stageH);
  ctx.setLineDash([]);

  const r = DANCER_RADIUS * dancerScale * scale;
  for (const pos of positions) {
    const dancer = dancers.find(d => d.id === pos.dancerId);
    if (!dancer) continue;

    const cx = stageX + stageW / 2 + pos.x * scale;
    const cy = stageY + stageH / 2 + pos.y * scale;
    const isOffstage = Math.abs(pos.x) > halfW || Math.abs(pos.y) > halfH;
    ctx.globalAlpha = isOffstage ? 0.4 : 1.0;

    const angle = (pos.angle || 0) * Math.PI / 180;

    ctx.beginPath();
    drawThumbnailShape(ctx, cx, cy, r, angle, dancerShape);
    ctx.fillStyle = dancer.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;
}

export function drawThumbnailShape(ctx, cx, cy, r, rotation, shape) {
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
