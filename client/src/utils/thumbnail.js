import { DANCER_RADIUS } from './constants.js';

/**
 * 대형 데이터를 캔버스에 썸네일로 렌더링.
 * Dashboard 노트 카드, 마켓 프리셋 카드 등에서 공통 사용.
 */
export function renderFormationThumbnail(canvas, { dancers, positions, stageWidth, stageHeight, dancerShape, dancerScale, showWings, hideOffstage, showAudience }) {
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
    drawStageGrid(ctx, pad, pad, w - pad * 2, h - pad * 2);
    return;
  }

  const halfW = stageWidth / 2;
  const halfH = stageHeight / 2;

  // 관객석 strip (ex. 상세 모달 캔버스)
  const audienceTop = showAudience === 'top';
  const audienceBottom = showAudience === 'bottom';
  const seatRowH = 6;
  const seatRowSpacing = 2;
  const seatStageGap = 4;
  const seatStripH = (audienceTop || audienceBottom)
    ? seatRowH * 2 + seatRowSpacing + seatStageGap
    : 0;

  const wingRatio = showWings ? 0.08 : 0;
  const stageX = w * wingRatio;
  const stageY = h * wingRatio + (audienceTop ? seatStripH : 0);
  const stageW = w * (1 - wingRatio * 2);
  const stageH = h * (1 - wingRatio * 2) - seatStripH;
  const scaleX = stageW / stageWidth;
  const scaleY = stageH / stageHeight;
  const scale = Math.min(scaleX, scaleY);

  const hasAudience = audienceTop || audienceBottom;
  ctx.fillStyle = (showWings || hasAudience) ? wingBg : cardBg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = stageBg;
  ctx.fillRect(stageX, stageY, stageW, stageH);

  drawStageGrid(ctx, stageX, stageY, stageW, stageH);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 2]);
  ctx.strokeRect(stageX, stageY, stageW, stageH);
  ctx.setLineDash([]);

  if (audienceTop || audienceBottom) {
    const seatW = 14;
    const seatHGap = 3;
    const cols = Math.max(1, Math.floor((stageW - seatHGap) / (seatW + seatHGap)));
    const totalW = cols * seatW + (cols - 1) * seatHGap;
    const seatStartX = stageX + (stageW - totalW) / 2;
    for (let r = 0; r < 2; r++) {
      const rowY = audienceTop
        ? stageY - seatStageGap - seatRowH - r * (seatRowH + seatRowSpacing)
        : stageY + stageH + seatStageGap + r * (seatRowH + seatRowSpacing);
      ctx.fillStyle = `rgba(255,255,255,${r === 0 ? 0.22 : 0.11})`;
      for (let c = 0; c < cols; c++) {
        ctx.fillRect(seatStartX + c * (seatW + seatHGap), rowY, seatW, seatRowH);
      }
    }
  }

  const r = DANCER_RADIUS * dancerScale * scale;
  for (const pos of positions) {
    const dancer = dancers.find(d => d.id === pos.dancerId);
    if (!dancer) continue;

    const cx = stageX + stageW / 2 + pos.x * scale;
    const cy = stageY + stageH / 2 + pos.y * scale;
    const isOffstage = Math.abs(pos.x) > halfW || Math.abs(pos.y) > halfH;
    if (hideOffstage && isOffstage) continue;
    ctx.globalAlpha = isOffstage ? 0.4 : 1.0;

    const angle = (pos.angle || 0) * Math.PI / 180;

    ctx.beginPath();
    drawThumbnailShape(ctx, cx, cy, r, angle, dancerShape);
    ctx.fillStyle = dancer.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;
}

function drawStageGrid(ctx, x, y, w, h) {
  const isLight = document.documentElement.classList.contains('light');
  const minor = isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.08)';
  const major = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.16)';
  ctx.save();
  ctx.strokeStyle = minor;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const gx = x + (w * i) / 4;
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
  }
  for (let j = 1; j < 4; j++) {
    const gy = y + (h * j) / 4;
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
  }
  ctx.stroke();
  ctx.strokeStyle = major;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  ctx.restore();
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
