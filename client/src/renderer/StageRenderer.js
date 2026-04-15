import { STAGE_WIDTH, STAGE_HEIGHT, HALF_W, HALF_H, GRID_GAP, DANCER_RADIUS, WING_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, clamp } from '../utils/constants.js';

export class StageRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;

    // Offscreen canvas for grid cache
    this.gridCanvas = document.createElement('canvas');
    this.gridCanvas.width = CANVAS_WIDTH;
    this.gridCanvas.height = CANVAS_HEIGHT;
    this._drawGridCache();

    this.is3D = false;
    this._3dTopPad = 0;
    this.isSnap = false;
    this.showNames = false;
    this.showNumbers = true;
    this.gridGap = GRID_GAP;
    this.dancerShape = 'pentagon'; // 'pentagon', 'circle', 'heart'
    this.audienceDirection = 'top'; // 'top' or 'bottom'
    this.dancerScale = 1.0; // 0.5 ~ 2.0
    this.touchScale = 1.0; // mobile touch boost (set from Editor.js)
    this.showWings = false; // show offstage wing areas
    this.hideHandles = false; // hide rotation handles when no formation selected

    // Drag state
    this._dragging = null; // { dancerIndex, startX, startY, offsetX, offsetY }
    this._draggingRotate = null; // { dancerIndex, centerX, centerY }
    this._boxSelect = null; // { startX, startY, endX, endY }
    this._selectedDancers = new Set();
    this._swapHighlight = new Set(); // separate highlight for swap mode (no handle, amber)

    // Markers
    this.markers = []; // [{ id, x, y, type, label }]
    this.showMarkers = true;
    this.markerEditMode = false;
    this._draggingMarker = null; // { markerIndex, offsetX, offsetY }
    this._resizingMarker = null; // { markerIndex, startX, startY, origW, origH }
    this._selectedMarker = -1;
    this.onMarkerChange = null; // callback when markers are modified

    this._setupEvents();
  }

  // --- Grid Cache (drawn once) ---
  resize() {
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    this.gridCanvas.width = CANVAS_WIDTH;
    this.gridCanvas.height = CANVAS_HEIGHT;
    this._drawGridCache();
  }

  _drawGridCache() {
    const ctx = this.gridCanvas.getContext('2d');
    const topPad = this._3dTopPad || 0;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT + topPad);
    ctx.save();
    ctx.translate(0, topPad);

    // Wing areas (offstage)
    const styles = getComputedStyle(document.documentElement);
    const wingColor = styles.getPropertyValue('--stage-wing').trim() || '#0a0a15';
    const stageColor = styles.getPropertyValue('--stage-bg').trim() || '#1a1a2e';
    this._stageColor = stageColor;

    if (this.showWings) {
      ctx.fillStyle = wingColor;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    // showWings off: leave wing area transparent so 3D tilt doesn't show a colored border

    // Stage background
    ctx.fillStyle = stageColor;
    ctx.fillRect(WING_SIZE, WING_SIZE, STAGE_WIDTH, STAGE_HEIGHT);

    // Stage border
    if (this.showWings) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(WING_SIZE, WING_SIZE, STAGE_WIDTH, STAGE_HEIGHT);
      ctx.setLineDash([]);
    }

    // Grid lines (inside stage only)
    const ox = WING_SIZE;
    const oy = WING_SIZE;
    const gap = this.gridGap;
    for (let x = HALF_W % gap; x < STAGE_WIDTH; x += gap) {
      const isMajor = Math.round(Math.abs(x - HALF_W) / gap) % 4 === 0;
      ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(ox + x, oy);
      ctx.lineTo(ox + x, oy + STAGE_HEIGHT);
      ctx.stroke();
    }
    for (let y = HALF_H % gap; y < STAGE_HEIGHT; y += gap) {
      const isMajor = Math.round(Math.abs(y - HALF_H) / gap) % 4 === 0;
      ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy + y);
      ctx.lineTo(ox + STAGE_WIDTH, oy + y);
      ctx.stroke();
    }

    // Center cross
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox + HALF_W, oy);
    ctx.lineTo(ox + HALF_W, oy + STAGE_HEIGHT);
    ctx.moveTo(ox, oy + HALF_H);
    ctx.lineTo(ox + STAGE_WIDTH, oy + HALF_H);
    ctx.stroke();

    // Audience indicator: rows of seat rectangles (skip if 'none')
    if (this.audienceDirection === 'none') { ctx.restore(); return; }
    const isTop = this.audienceDirection === 'top';
    const seatW = 32;
    const seatH = 18;
    const seatGap = 5;
    const cols = Math.floor((STAGE_WIDTH - seatGap) / (seatW + seatGap));
    const rows = 2;
    const totalW = cols * seatW + (cols - 1) * seatGap;
    const startX = WING_SIZE + (STAGE_WIDTH - totalW) / 2;
    const stageGap = 24;

    for (let r = 0; r < rows; r++) {
      const rowY = isTop
        ? WING_SIZE - stageGap - seatH - r * (seatH + 5)
        : WING_SIZE + STAGE_HEIGHT + stageGap + r * (seatH + 5);
      const alpha = r === 0 ? 0.12 : 0.06;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      for (let c = 0; c < cols; c++) {
        const sx = startX + c * (seatW + seatGap);
        ctx.fillRect(sx, rowY, seatW, seatH);
      }
    }
    ctx.restore();
  }

  // --- 3D Stage Projection (for video export) ---
  _draw3DStage(ctx) {
    const ox = WING_SIZE + HALF_W;
    const oy = WING_SIZE + HALF_H;

    // Project stage corners
    const corners = [
      { x: -HALF_W, y: -HALF_H }, // top-left
      { x:  HALF_W, y: -HALF_H }, // top-right
      { x:  HALF_W, y:  HALF_H }, // bottom-right
      { x: -HALF_W, y:  HALF_H }, // bottom-left
    ].map(c => {
      const p = this._project3D(c.x, c.y);
      return { x: ox + p.x, y: oy + p.y };
    });

    const styles = getComputedStyle(document.documentElement);
    const wingColor = styles.getPropertyValue('--stage-wing').trim() || '#0a0a15';
    const stageColor = styles.getPropertyValue('--stage-bg').trim() || '#1a1a2e';

    // Background (behind stage, for audience seats visibility)
    ctx.fillStyle = wingColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Stage background
    ctx.fillStyle = stageColor;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fill();

    // Grid lines
    const gap = this.gridGap;

    // Vertical grid lines (skip stage edges)
    for (let x = HALF_W % gap; x < STAGE_WIDTH; x += gap) {
      const lx = x - HALF_W;
      if (Math.abs(lx) >= HALF_W - 0.5) continue;
      const isMajor = Math.round(Math.abs(lx) / gap) % 4 === 0;
      ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = isMajor ? 1 : 0.5;
      const top = this._project3D(lx, -HALF_H);
      const bot = this._project3D(lx,  HALF_H);
      ctx.beginPath();
      ctx.moveTo(ox + top.x, oy + top.y);
      ctx.lineTo(ox + bot.x, oy + bot.y);
      ctx.stroke();
    }

    // Horizontal grid lines (skip stage edges)
    for (let y = HALF_H % gap; y < STAGE_HEIGHT; y += gap) {
      const ly = y - HALF_H;
      if (Math.abs(ly) >= HALF_H - 0.5) continue;
      const isMajor = Math.round(Math.abs(ly) / gap) % 4 === 0;
      ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = isMajor ? 1 : 0.5;
      const left  = this._project3D(-HALF_W, ly);
      const right = this._project3D( HALF_W, ly);
      ctx.beginPath();
      ctx.moveTo(ox + left.x,  oy + left.y);
      ctx.lineTo(ox + right.x, oy + right.y);
      ctx.stroke();
    }

    // Center cross
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    const cTop = this._project3D(0, -HALF_H);
    const cBot = this._project3D(0,  HALF_H);
    const cLeft  = this._project3D(-HALF_W, 0);
    const cRight = this._project3D( HALF_W, 0);
    ctx.beginPath();
    ctx.moveTo(ox + cTop.x, oy + cTop.y);
    ctx.lineTo(ox + cBot.x, oy + cBot.y);
    ctx.moveTo(ox + cLeft.x,  oy + cLeft.y);
    ctx.lineTo(ox + cRight.x, oy + cRight.y);
    ctx.stroke();

    // Audience seats (projected)
    if (this.audienceDirection !== 'none') {
      const isTop = this.audienceDirection === 'top';
      const seatW = 32, seatH = 18, seatGap = 5, stageGap = 24;
      const cols = Math.floor((STAGE_WIDTH - seatGap) / (seatW + seatGap));
      const rows = 2;
      const totalW = cols * seatW + (cols - 1) * seatGap;
      const startLocalX = -totalW / 2;

      for (let r = 0; r < rows; r++) {
        const localY = isTop
          ? -HALF_H - stageGap - seatH - r * (seatH + 5)
          : HALF_H + stageGap + r * (seatH + 5);
        const alpha = r === 0 ? 0.12 : 0.06;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        for (let c = 0; c < cols; c++) {
          const lx = startLocalX + c * (seatW + seatGap);
          const tl = this._project3D(lx, localY);
          const tr = this._project3D(lx + seatW, localY);
          const br = this._project3D(lx + seatW, localY + seatH);
          const bl = this._project3D(lx, localY + seatH);
          ctx.beginPath();
          ctx.moveTo(ox + tl.x, oy + tl.y);
          ctx.lineTo(ox + tr.x, oy + tr.y);
          ctx.lineTo(ox + br.x, oy + br.y);
          ctx.lineTo(ox + bl.x, oy + bl.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // --- Main Draw ---
  drawFrame(dancers, positions) {
    const ctx = this.ctx;
    const topPad = this._3dTopPad || 0;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT + topPad);

    // Grid: use projected 3D stage for render mode, flat cache otherwise
    if (this.is3D && this._projectionMode === 'render') {
      this._draw3DStage(ctx);
    } else {
      ctx.drawImage(this.gridCanvas, 0, 0);
    }
    ctx.save();
    ctx.translate(0, topPad);

    // Draw markers (below waypoints and dancers)
    if (this.showMarkers && this.markers.length > 0) {
      this._drawMarkers(ctx);
    }

    // Draw waypoint path curves (below dancers)
    if (this._waypointPaths) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      for (const path of this._waypointPaths) {
        if (path.points.length < 3) continue;
        const ox = WING_SIZE + HALF_W;
        const oy = WING_SIZE + HALF_H;
        const start = path.points[0];
        const pt = path.points[1]; // passthrough point
        const end = path.points[path.points.length - 1];
        // Reverse-calculate Bezier control point so curve passes through pt at t=0.5
        const cpx = 2 * pt.x - 0.5 * (start.x + end.x);
        const cpy = 2 * pt.y - 0.5 * (start.y + end.y);

        ctx.strokeStyle = path.color + '80';
        ctx.beginPath();
        ctx.moveTo(ox + start.x, oy + start.y);
        ctx.quadraticCurveTo(ox + cpx, oy + cpy, ox + end.x, oy + end.y);
        ctx.stroke();

        // Start marker: small square
        ctx.setLineDash([]);
        const ss = 3;
        ctx.fillStyle = path.color + '90';
        ctx.fillRect(ox + start.x - ss, oy + start.y - ss, ss * 2, ss * 2);

        // End marker: small triangle pointing along curve direction
        const ts = 4;
        const ex = ox + end.x;
        const ey = oy + end.y;
        const dx = end.x - cpx;
        const dy = end.y - cpy;
        const angle = Math.atan2(dy, dx);
        ctx.fillStyle = path.color + '90';
        ctx.beginPath();
        ctx.moveTo(ex + Math.cos(angle) * ts, ey + Math.sin(angle) * ts);
        ctx.lineTo(ex + Math.cos(angle + 2.4) * ts, ey + Math.sin(angle + 2.4) * ts);
        ctx.lineTo(ex + Math.cos(angle - 2.4) * ts, ey + Math.sin(angle - 2.4) * ts);
        ctx.closePath();
        ctx.fill();

        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Build draw order: in 3D mode, sort by y (back to front)
    const drawOrder = dancers.map((d, i) => i);
    if (this.is3D) {
      drawOrder.sort((a, b) => (positions[a]?.y || 0) - (positions[b]?.y || 0));
    }

    // Draw dancers
    for (const i of drawOrder) {
      const d = dancers[i];
      const pos = positions[i];
      if (!pos) continue;

      let screenX = WING_SIZE + HALF_W + pos.x;
      let screenY = WING_SIZE + HALF_H + pos.y;
      const scaledRadius = DANCER_RADIUS * this.dancerScale * this.touchScale;
      let radius = scaledRadius;

      // Check if dancer is offstage
      const isOffstage = Math.abs(pos.x) > HALF_W || Math.abs(pos.y) > HALF_H;

      // 3D projection (video export only — UI uses CSS transform)
      if (this.is3D && this._projectionMode === 'render') {
        const projected = this._project3D(pos.x, pos.y);
        screenX = WING_SIZE + HALF_W + projected.x;
        screenY = WING_SIZE + HALF_H + projected.y;
        radius = scaledRadius * projected.scale;
      }

      const isSelected = this._selectedDancers.has(i);
      ctx.globalAlpha = this.markerEditMode ? 0.25 : (isOffstage ? 0.4 : 1.0);

      // Compensate CSS transforms so dancers appear upright (skip in render mode)
      const needsCompensation = !this._force2DRender && this.is3D && this._projectionMode !== 'render';
      if (needsCompensation) {
        ctx.save();
        ctx.translate(screenX, screenY);
        const angle = 55 * Math.PI / 180;
        ctx.scale(1, 1 / Math.cos(angle));
        ctx.translate(-screenX, -screenY);
      }

      if (this.is3D && !this._force2DRender) {
        // 3D mode: simple person silhouette
        // Base position = screenY, figure extends upward
        const r = radius;
        const headR = r * 0.7;
        const bodyH = r * 3.2;
        const shoulderW = r * 1.1;
        const waistW = r * 0.55;
        const neckY = screenY - bodyH;
        const headY = neckY - headR * 0.8;

        // Drop shadow (ellipse at feet)
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + 3, r * 0.8, r * 0.25, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fill();

        // Body (trapezoid: shoulders → waist) with gradient
        const bodyGrad = ctx.createLinearGradient(screenX - shoulderW, 0, screenX + shoulderW, 0);
        bodyGrad.addColorStop(0, darkenColor(d.color, 25));
        bodyGrad.addColorStop(0.35, lightenColor(d.color, 15));
        bodyGrad.addColorStop(0.5, lightenColor(d.color, 20));
        bodyGrad.addColorStop(0.65, lightenColor(d.color, 10));
        bodyGrad.addColorStop(1, darkenColor(d.color, 30));

        ctx.beginPath();
        ctx.moveTo(screenX - shoulderW, neckY + headR * 0.3);
        ctx.lineTo(screenX - waistW, screenY);
        ctx.lineTo(screenX + waistW, screenY);
        ctx.lineTo(screenX + shoulderW, neckY + headR * 0.3);
        ctx.closePath();
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // Head (circle with gradient for 3D feel)
        const headGrad = ctx.createRadialGradient(
          screenX - headR * 0.25, headY - headR * 0.25, headR * 0.1,
          screenX, headY, headR
        );
        headGrad.addColorStop(0, lightenColor(d.color, 40));
        headGrad.addColorStop(0.7, d.color);
        headGrad.addColorStop(1, darkenColor(d.color, 30));

        ctx.beginPath();
        ctx.arc(screenX, headY, headR, 0, Math.PI * 2);
        ctx.fillStyle = headGrad;
        ctx.fill();

        // Neck connection
        ctx.beginPath();
        ctx.moveTo(screenX - headR * 0.5, headY + headR * 0.7);
        ctx.lineTo(screenX - shoulderW * 0.5, neckY + headR * 0.3);
        ctx.lineTo(screenX + shoulderW * 0.5, neckY + headR * 0.3);
        ctx.lineTo(screenX + headR * 0.5, headY + headR * 0.7);
        ctx.closePath();
        ctx.fillStyle = d.color;
        ctx.fill();
      } else {
        // 2D mode: shape with direction
        // In rotated mode, compensation flips 180° so add 180° to angle to counteract
        const angle = (pos.angle || 0);
        const rad = angle * Math.PI / 180;

        // Shadow
        ctx.beginPath();
        this._drawShape(ctx, screenX, screenY + 2, radius, rad);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Shape
        ctx.beginPath();
        this._drawShape(ctx, screenX, screenY, radius, rad);
        ctx.fillStyle = d.color;
        ctx.fill();
      }

      const isSwapHighlighted = this._swapHighlight.has(i);
      if (isSelected || isSwapHighlighted) {
        const highlightColor = isSwapHighlighted ? '#F59E0B' : '#ffffff';
        if (this.is3D && !this._force2DRender) {
          // Highlight around head
          const headY = screenY - radius * 3.2 - radius * 0.7 * 0.8;
          ctx.beginPath();
          ctx.arc(screenX, headY, radius * 0.7 + 3, 0, Math.PI * 2);
          ctx.strokeStyle = highlightColor;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          const angle = (pos.angle || 0);
          const rad = angle * Math.PI / 180;
          ctx.beginPath();
          this._drawShape(ctx, screenX, screenY, radius + 2, rad);
          ctx.strokeStyle = highlightColor;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Direction handle (line + circle) — only for real selection, not swap, not when no formation selected
          if (isSelected && !isSwapHighlighted && !this.is3D && !this._waypointPaths && !this.hideHandles) {
            const handleLen = radius + 14 * this.touchScale;
            const handleR = 4 * this.touchScale;
            const hx = screenX + Math.sin(rad) * handleLen;
            const hy = screenY - Math.cos(rad) * handleLen;
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(hx, hy);
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(hx, hy, handleR, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
          }
        }
      }

      // Label: number, name, or none
      let label = '';
      let isNumber = false;
      if (this.showNumbers) {
        label = String(i + 1);
        isNumber = true;
      } else if (this.showNames) {
        const numMatch = d.name.match(/\d+$/);
        label = (numMatch && d.name.length > 3) ? numMatch[0] : d.name.slice(0, 3);
      }
      if (!label) { /* skip label drawing */ } else {
      ctx.fillStyle = isLightColor(d.color) ? (this._stageColor || '#1a1a2e') : '#ffffff';
      const use3D = this.is3D && !this._force2DRender;
      const bodyCenter = screenY - radius * 3.2 * 0.45;
      const labelY = use3D ? bodyCenter : screenY;
      const fontSize = use3D
        ? Math.round(radius * (isNumber ? 1.0 : 0.75))
        : Math.round(radius * (isNumber ? 1.1 : 0.8));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelOffset = isNumber ? fontSize * 0.15 : 0;
      ctx.fillText(label, screenX, labelY + labelOffset);
      } // end label block

      if (needsCompensation) {
        ctx.restore();
      }
      ctx.globalAlpha = 1.0;
    }

    // Box selection rect
    if (this._boxSelect) {
      const { startX, startY, endX, endY } = this._boxSelect;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        Math.min(startX, endX), Math.min(startY, endY),
        Math.abs(endX - startX), Math.abs(endY - startY)
      );
      ctx.setLineDash([]);
    }

    // Draw waypoint dots on top of everything (only for selected dancers)
    if (this._waypointPaths && this._selectedDancers.size > 0) {
      const ox = WING_SIZE + HALF_W;
      const oy = WING_SIZE + HALF_H;
      for (const path of this._waypointPaths) {
        if (path.points.length < 3) continue;
        if (!this._selectedDancers.has(path.dancerIndex)) continue;
        const cp = path.points[1];
        ctx.beginPath();
        ctx.arc(ox + cp.x, oy + cp.y, 6 * this.touchScale, 0, Math.PI * 2);
        ctx.fillStyle = path.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- 3D Projection (for video export) ---
  // Shape drawing: supports 'pentagon', 'circle', 'heart'
  _drawShape(ctx, cx, cy, r, rotation) {
    const shape = this.dancerShape || 'pentagon';
    if (shape === 'circle') {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      return;
    }
    if (shape === 'heart') {
      // Inverted heart: wide, standard proportions, tip = direction
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation + Math.PI);
      const w = r * 1.2;
      const h = r * 1.05;
      ctx.moveTo(0, h); // bottom tip
      ctx.bezierCurveTo(w * 0.3, h * 0.6, w, h * 0.1, w, -h * 0.35);
      ctx.bezierCurveTo(w, -h * 0.85, w * 0.5, -h, 0, -h * 0.5);
      ctx.bezierCurveTo(-w * 0.5, -h, -w, -h * 0.85, -w, -h * 0.35);
      ctx.bezierCurveTo(-w, h * 0.1, -w * 0.3, h * 0.6, 0, h);
      ctx.closePath();
      ctx.restore();
      return;
    }
    // Default: house pentagon (pointy top = direction, wider body)
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

  _project3D(x, y) {
    // Emulate CSS: perspective(800px) rotateX(55deg)
    const perspective = 800;
    const angle = 55 * Math.PI / 180;
    const z = -y * Math.sin(angle);
    const scale = perspective / (perspective + z);
    return {
      x: x * scale,
      y: y * Math.cos(angle) * scale,
      scale,
    };
  }

  set3D(enabled, mode = 'css') {
    this.is3D = enabled;
    this._projectionMode = mode;
    // In 3D CSS mode, extend canvas top to prevent silhouette clipping
    const topPad = (enabled && mode === 'css') ? Math.round(DANCER_RADIUS * this.dancerScale * 4) : 0;
    this._3dTopPad = topPad;
    this.canvas.height = CANVAS_HEIGHT + topPad;
    this.gridCanvas.height = CANVAS_HEIGHT + topPad;
    this._drawGridCache();
    this._updateTransform();
  }

  _updateTransform() {
    const wrap = this.canvas.parentElement;
    if (!wrap) return;
    const topPad = this._3dTopPad || 0;
    if (this.is3D) {
      wrap.style.transformOrigin = `center ${WING_SIZE + HALF_H + topPad}px`;
      wrap.style.transform = 'perspective(800px) rotateX(55deg)';
    } else {
      wrap.style.transformOrigin = '';
      wrap.style.transform = '';
    }
  }

  // --- Hit Test ---
  // Minimum hit radius: at least 22 physical px converted to canvas coords
  _minHitRadius() {
    const minPhysical = 22;
    return this._cssScale ? minPhysical * this._cssScale : DANCER_RADIUS;
  }

  hitTest(canvasX, canvasY, positions) {
    const r = Math.max(DANCER_RADIUS * this.dancerScale * this.touchScale, this._minHitRadius());
    const r2 = r * r;
    for (let i = positions.length - 1; i >= 0; i--) {
      const pos = positions[i];
      if (!pos) continue;
      const dx = (WING_SIZE + HALF_W + pos.x) - canvasX;
      const dy = (WING_SIZE + HALF_H + pos.y) - canvasY;
      if (dx * dx + dy * dy <= r2) {
        return i;
      }
    }
    return -1;
  }

  // Direction handle hit test (returns dancerIndex or -1)
  hitTestRotateHandle(canvasX, canvasY) {
    if (this.is3D || this._waypointPaths) return -1;
    if (!this._positions || !this._dancers) return -1;
    const minR = this._minHitRadius();
    const handleLen = Math.max(DANCER_RADIUS * this.dancerScale * this.touchScale, minR) + 14 * this.touchScale;
    const hitR = Math.max(8 * this.dancerScale * this.touchScale, minR * 0.6);
    for (const i of this._selectedDancers) {
      const pos = this._positions[i];
      if (!pos) continue;
      const cx = WING_SIZE + HALF_W + pos.x;
      const cy = WING_SIZE + HALF_H + pos.y;
      const rad = (pos.angle || 0) * Math.PI / 180;
      const hx = cx + Math.sin(rad) * handleLen;
      const hy = cy - Math.cos(rad) * handleLen;
      const dx = hx - canvasX;
      const dy = hy - canvasY;
      if (dx * dx + dy * dy <= hitR * hitR) return i;
    }
    return -1;
  }

  // Waypoint hit test (returns {dancerIndex, waypointIndex} or null)
  hitTestWaypoint(canvasX, canvasY) {
    if (!this._waypointPaths || this._selectedDancers.size === 0) return null;
    for (const path of this._waypointPaths) {
      if (!this._selectedDancers.has(path.dancerIndex)) continue;
      // Skip start (index 0) and end (last) — only intermediate waypoints
      for (let j = 1; j < path.points.length - 1; j++) {
        const wp = path.points[j];
        const dx = (WING_SIZE + HALF_W + wp.x) - canvasX;
        const dy = (WING_SIZE + HALF_H + wp.y) - canvasY;
        const wpHitR = Math.max(12, this._minHitRadius());
        if (dx * dx + dy * dy <= wpHitR * wpHitR) {
          return { dancerIndex: path.dancerIndex, waypointIndex: j - 1 }; // j-1 because points[0] is start
        }
      }
    }
    return null;
  }

  // Find closest path segment for adding waypoint
  findClosestPath(canvasX, canvasY) {
    if (!this._waypointPaths || this._selectedDancers.size === 0) return null;
    const px = canvasX - WING_SIZE - HALF_W;
    const py = canvasY - WING_SIZE - HALF_H;
    let bestDist = 20; // max distance in px
    let bestResult = null;

    for (const path of this._waypointPaths) {
      for (let j = 0; j < path.points.length - 1; j++) {
        const a = path.points[j];
        const b = path.points[j + 1];
        // Point-to-segment distance
        const abx = b.x - a.x, aby = b.y - a.y;
        const apx = px - a.x, apy = py - a.y;
        const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby || 1)));
        const projX = a.x + t * abx, projY = a.y + t * aby;
        const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
        if (dist < bestDist) {
          bestDist = dist;
          // Calculate t value for the waypoint (interpolate between segment t values)
          const segStartT = j === 0 ? 0 : path.points[j].t;
          const segEndT = j === path.points.length - 2 ? 1 : path.points[j + 1].t;
          const wpT = segStartT + t * (segEndT - segStartT);
          bestResult = { dancerIndex: path.dancerIndex, x: Math.round(px), y: Math.round(py), t: wpT, segIndex: j };
        }
      }
    }
    return bestResult;
  }

  // --- Mouse & Touch Events ---
  _setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    document.addEventListener('mousemove', (e) => this._onMouseMove(e));
    document.addEventListener('mouseup', (e) => this._onMouseUp(e));

    // Mouse wheel on selected dancers: rotate direction (debounced snapshot)
    let _wheelRotateTimer = null;
    this.canvas.addEventListener('wheel', (e) => {
      if (!this._positions || !this._dancers) return;
      if (this._selectedDancers.size === 0) return;
      const { x, y } = this._getCanvasPos(e);
      const hit = this.hitTest(x, y, this._positions);
      if (hit >= 0 && this._selectedDancers.has(hit)) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 15 : -15;
        for (const idx of this._selectedDancers) {
          this.onDancerRotate?.(idx, delta);
        }
        clearTimeout(_wheelRotateTimer);
        _wheelRotateTimer = setTimeout(() => this.onDancerRotateEnd?.(hit), 400);
      }
    }, { passive: false });

    // Prevent context menu on canvas
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Double-click on waypoint: reset (mouse)
    this.canvas.addEventListener('dblclick', (e) => {
      this._draggingWaypoint = null;
      const { x, y } = this._getCanvasPos(e);
      const wpHit = this.hitTestWaypoint(x, y);
      if (wpHit) {
        this.onWaypointReset?.(wpHit.dancerIndex);
      }
    });

    // Pointer-based double-tap + long press (works with Apple Pencil + touch)
    let _ptrLastTap = 0;
    let _ptrLastPos = { x: 0, y: 0 };
    let _ptrLongTimer = null;
    let _ptrLongFired = false;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return; // handled by dblclick/mousedown
      const pos = this._getCanvasPos(e);
      const now = Date.now();

      // Double-tap detection (300ms, 20px distance)
      const dx = pos.x - _ptrLastPos.x, dy = pos.y - _ptrLastPos.y;
      if (now - _ptrLastTap < 300 && dx * dx + dy * dy < 400) {
        _ptrLastTap = 0;
        this._draggingWaypoint = null;
        const wpHit = this.hitTestWaypoint(pos.x, pos.y);
        if (wpHit) {
          this.onWaypointReset?.(wpHit.dancerIndex);
          return;
        }
      }
      _ptrLastTap = now;
      _ptrLastPos = { x: pos.x, y: pos.y };

      // Long press detection
      _ptrLongFired = false;
      _ptrLongTimer = setTimeout(() => {
        const wpHit = this.hitTestWaypoint(pos.x, pos.y);
        if (wpHit) {
          _ptrLongFired = true;
          this._draggingWaypoint = null;
          this.onWaypointReset?.(wpHit.dancerIndex);
        }
      }, 500);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return;
      if (_ptrLongTimer) { clearTimeout(_ptrLongTimer); _ptrLongTimer = null; }
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      if (_ptrLongTimer) { clearTimeout(_ptrLongTimer); _ptrLongTimer = null; }
    });

    // Touch support: two-finger tap = shift key (multi-select) + long press = waypoint reset
    let _longPressTimer = null;
    let _longPressFired = false;
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      _longPressFired = false;
      const touch = e.touches[0];
      const pos = this._getCanvasPos({ clientX: touch.clientX, clientY: touch.clientY });
      _longPressTimer = setTimeout(() => {
        const wpHit = this.hitTestWaypoint(pos.x, pos.y);
        if (wpHit) {
          _longPressFired = true;
          this._draggingWaypoint = null;
          this.onWaypointReset?.(wpHit.dancerIndex);
        }
      }, 500);
      const mouseEvt = this._touchToMouse(e);
      if (e.touches.length >= 2) {
        mouseEvt.shiftKey = true;
      }
      this._onMouseDown(mouseEvt);
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
      if (this._dragging || this._draggingWaypoint || this._draggingRotate || this._boxSelect || this._draggingMarker || this._resizingMarker) {
        e.preventDefault();
        this._onMouseMove(this._touchToMouse(e));
      }
    }, { passive: false });
    document.addEventListener('touchend', (e) => {
      if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
      if (!_longPressFired) {
        this._onMouseUp(this._touchToMouse(e, true));
      }
      _longPressFired = false;
    });
  }

  _touchToMouse(e, isEnd = false) {
    const touch = isEnd ? e.changedTouches[0] : e.touches[0];
    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
      shiftKey: e.shiftKey,
      preventDefault: () => {},
    };
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    this._cssScale = CANVAS_WIDTH / rect.width; // cache for hit tests
    return {
      x: (e.clientX - rect.left) * this._cssScale,
      y: (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height),
    };
  }

  _onMouseDown(e) {
    if (!this._positions || !this._dancers) return;
    if (this.is3D) return;
    const { x, y } = this._getCanvasPos(e);

    // Marker edit mode: handle marker interactions
    if (this.markerEditMode) {
      // Check resize handle first (for selected prop marker)
      if (this.hitTestMarkerResize(x, y)) {
        const m = this.markers[this._selectedMarker];
        this._resizingMarker = {
          markerIndex: this._selectedMarker,
          startX: x,
          startY: y,
          origW: m.width || StageRenderer.MARKER_DEFAULTS[m.type]?.w || 30,
          origH: m.height || StageRenderer.MARKER_DEFAULTS[m.type]?.h || 30,
        };
        return;
      }
      const mHit = this.hitTestMarker(x, y);
      if (mHit >= 0) {
        this._selectedMarker = mHit;
        const m = this.markers[mHit];
        this._draggingMarker = {
          markerIndex: mHit,
          offsetX: x - (WING_SIZE + HALF_W + m.x),
          offsetY: y - (WING_SIZE + HALF_H + m.y),
          started: false,
          originX: x,
          originY: y,
        };
      } else {
        this._selectedMarker = -1;
      }
      if (this._dancers && this._positions) {
        this.drawFrame(this._dancers, this._positions);
      }
      this.onMarkerChange?.();
      return;
    }

    // Check rotation handle hit first
    const rotHit = this.hitTestRotateHandle(x, y);
    if (rotHit >= 0) {
      const pos = this._positions[rotHit];
      const info = {
        dancerIndex: rotHit,
        centerX: WING_SIZE + HALF_W + pos.x,
        centerY: WING_SIZE + HALF_H + pos.y,
        startAngle: pos.angle || 0,
      };
      // Multi-select: store initial angles for all selected dancers
      if (this._selectedDancers.size > 1 && this._selectedDancers.has(rotHit)) {
        info.startAngles = new Map();
        for (const idx of this._selectedDancers) {
          info.startAngles.set(idx, this._positions[idx]?.angle || 0);
        }
      }
      this._draggingRotate = info;
      return;
    }

    // Check waypoint hit
    const wpHit = this.hitTestWaypoint(x, y);
    if (wpHit) {
      this._draggingWaypoint = { ...wpHit, offsetX: 0, offsetY: 0 };
      return;
    }

    const hit = this.hitTest(x, y, this._positions);

    if (hit >= 0) {
      if (e.shiftKey) {
        // Shift+click: toggle selection only, no drag
        if (this._selectedDancers.has(hit)) {
          this._selectedDancers.delete(hit);
        } else {
          this._selectedDancers.add(hit);
        }
        this.onDancerSelect?.(hit);
        if (this._dancers && this._positions) {
          this.drawFrame(this._dancers, this._positions);
        }
      } else {
        // Normal click: prepare drag (actual drag starts after dead zone)
        const pos = this._positions[hit];
        this._dragging = {
          dancerIndex: hit,
          startX: WING_SIZE + HALF_W + pos.x,
          startY: WING_SIZE + HALF_H + pos.y,
          offsetX: x - (WING_SIZE + HALF_W + pos.x),
          offsetY: y - (WING_SIZE + HALF_H + pos.y),
          originX: x,
          originY: y,
          started: false,
        };
        if (!this._selectedDancers.has(hit)) {
          this._selectedDancers.clear();
          this._selectedDancers.add(hit);
        }
        this.onDancerSelect?.(hit);
        if (this._dancers && this._positions) {
          this.drawFrame(this._dancers, this._positions);
        }
      }
    } else {
      if (!e.shiftKey) {
        this._selectedDancers.clear();
      }
      this._shiftDrag = e.shiftKey;
      this._boxSelect = { startX: x, startY: y, endX: x, endY: y };
      this.onDancerSelect?.(-1);
    }
  }

  _onMouseMove(e) {
    const { x, y } = this._getCanvasPos(e);

    // Marker resize
    if (this._resizingMarker) {
      const rm = this._resizingMarker;
      const m = this.markers[rm.markerIndex];
      const dx = x - rm.startX, dy = y - rm.startY;
      m.width = clamp(rm.origW + dx * 2, 10, 300);
      m.height = clamp(rm.origH + dy * 2, 10, 300);
      if (this._dancers && this._positions) {
        this.drawFrame(this._dancers, this._positions);
      }
      return;
    }

    // Marker drag
    if (this._draggingMarker) {
      const dm = this._draggingMarker;
      const dx = x - dm.originX;
      const dy = y - dm.originY;
      if (!dm.started && dx * dx + dy * dy > 25) dm.started = true;
      if (dm.started) {
        const m = this.markers[dm.markerIndex];
        let newX = x - dm.offsetX - WING_SIZE - HALF_W;
        let newY = y - dm.offsetY - WING_SIZE - HALF_H;
        if (this.isSnap) {
          const gap = 15;
          newX = Math.round(newX / gap) * gap;
          newY = Math.round(newY / gap) * gap;
        }
        m.x = clamp(newX, -HALF_W, HALF_W);
        m.y = clamp(newY, -HALF_H, HALF_H);
        if (this._dancers && this._positions) {
          this.drawFrame(this._dancers, this._positions);
        }
      }
      return;
    }

    if (this._draggingRotate) {
      const dx = x - this._draggingRotate.centerX;
      const dy = y - this._draggingRotate.centerY;
      let angleDeg = Math.atan2(dx, -dy) * 180 / Math.PI; // 0° = up
      // Snap to 15° increments
      angleDeg = Math.round(angleDeg / 15) * 15;
      // Normalize to 0-360
      angleDeg = ((angleDeg % 360) + 360) % 360;
      if (this._draggingRotate.startAngles) {
        // Multi-select: apply same delta to all selected dancers
        const delta = angleDeg - this._draggingRotate.startAngle;
        for (const [idx, initAngle] of this._draggingRotate.startAngles) {
          const newAngle = ((initAngle + delta) % 360 + 360) % 360;
          this.onDancerRotate?.(idx, newAngle, true);
        }
      } else {
        this.onDancerRotate?.(this._draggingRotate.dancerIndex, angleDeg, true);
      }
      return;
    }

    if (this._draggingWaypoint) {
      const newX = x - WING_SIZE - HALF_W;
      const newY = y - WING_SIZE - HALF_H;
      this.onWaypointDrag?.(this._draggingWaypoint.dancerIndex, this._draggingWaypoint.waypointIndex, newX, newY);
      return;
    }

    if (this._dragging) {
      // Dead zone: require minimum movement before starting drag
      if (!this._dragging.started) {
        const dx = x - this._dragging.originX;
        const dy = y - this._dragging.originY;
        const threshold = Math.max(5, this._cssScale ? 5 * this._cssScale : 5);
        if (dx * dx + dy * dy < threshold * threshold) return;
        this._dragging.started = true;
      }
      const newX = x - this._dragging.offsetX - WING_SIZE - HALF_W;
      const newY = y - this._dragging.offsetY - WING_SIZE - HALF_H;
      this.onDancerDrag?.(this._dragging.dancerIndex, newX, newY, this._selectedDancers);
    }

    if (this._boxSelect) {
      this._boxSelect.endX = x;
      this._boxSelect.endY = y;
      // Redraw to show selection rectangle
      if (this._dancers && this._positions) {
        this.drawFrame(this._dancers, this._positions);
      }
    }
  }

  _onMouseUp(e) {
    if (this._resizingMarker) {
      this._resizingMarker = null;
      this.onMarkerChange?.();
      return;
    }

    if (this._draggingMarker) {
      if (this._draggingMarker.started) {
        this.onMarkerChange?.();
      }
      this._draggingMarker = null;
      return;
    }

    if (this._draggingRotate) {
      this.onDancerRotateEnd?.(this._draggingRotate.dancerIndex);
      this._draggingRotate = null;
      return;
    }

    if (this._draggingWaypoint) {
      const { x, y } = this._getCanvasPos(e);
      const newX = x - WING_SIZE - HALF_W;
      const newY = y - WING_SIZE - HALF_H;
      this.onWaypointDragEnd?.(this._draggingWaypoint.dancerIndex, this._draggingWaypoint.waypointIndex, newX, newY);
      this._draggingWaypoint = null;
      return;
    }

    if (this._dragging) {
      if (this._dragging.started) {
        const { x, y } = this._getCanvasPos(e);
        const newX = x - this._dragging.offsetX - WING_SIZE - HALF_W;
        const newY = y - this._dragging.offsetY - WING_SIZE - HALF_H;
        this.onDancerDragEnd?.(this._dragging.dancerIndex, newX, newY, this._selectedDancers);
      }
      this._dragging = null;
    }

    if (this._boxSelect) {
      this._selectDancersInBox();
      this._boxSelect = null;
      // Notify selection change for sidebar sync
      this.onDancerSelect?.(-1);
      // Redraw to show selected dancers highlight
      if (this._dancers && this._positions) {
        this.drawFrame(this._dancers, this._positions);
      }
    }
  }

  _selectDancersInBox() {
    if (!this._boxSelect || !this._positions) return;
    const { startX, startY, endX, endY } = this._boxSelect;
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    if (!this._shiftDrag) {
      this._selectedDancers.clear();
    }
    for (let i = 0; i < this._positions.length; i++) {
      const pos = this._positions[i];
      if (!pos) continue;
      const sx = WING_SIZE + HALF_W + pos.x;
      const sy = WING_SIZE + HALF_H + pos.y;
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
        this._selectedDancers.add(i);
      }
    }
  }

  // Store current state for event handlers
  setCurrentState(dancers, positions) {
    this._dancers = dancers;
    this._positions = positions;
  }

  // Callbacks (set by App)
  onDancerSelect = null;
  onDancerDrag = null;
  onDancerDragEnd = null;
  onWaypointDrag = null;
  onWaypointDragEnd = null;
  onWaypointReset = null;
  onDancerRotate = null;
  onDancerRotateEnd = null;

  // --- Markers ---
  // Point markers (x, dot, flag): no size, icon only
  // Prop markers (amp, desk, chair, plug): have width/height, rendered as rect
  static MARKER_DEFAULTS = {
    x:      { w: 0, h: 0 },
    rect:   { w: 40, h: 30 },
    circle: { w: 30, h: 30 },
  };

  _isPointMarker(type) {
    return !type || type === 'x';
  }

  _drawMarkers(ctx) {
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      let cx, cy;
      if (this.is3D && this._projectionMode === 'render') {
        const p = this._project3D(m.x, m.y);
        cx = WING_SIZE + HALF_W + p.x;
        cy = WING_SIZE + HALF_H + p.y;
      } else {
        cx = WING_SIZE + HALF_W + m.x;
        cy = WING_SIZE + HALF_H + m.y;
      }
      const isSelected = this.markerEditMode && this._selectedMarker === i;
      const isPoint = this._isPointMarker(m.type);

      ctx.save();
      ctx.globalAlpha = this.markerEditMode ? 0.9 : 0.5;

      if (isPoint) {
        // Point marker: small icon
        const MARKER_R = 8;
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(cx, cy, MARKER_R + 4, 0, Math.PI * 2);
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, MARKER_R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        this._drawMarkerIcon(ctx, cx, cy, MARKER_R * 0.6, m.type);
      } else {
        // Sized marker: rect or circle
        const w = m.width || StageRenderer.MARKER_DEFAULTS[m.type]?.w || 30;
        const h = m.height || StageRenderer.MARKER_DEFAULTS[m.type]?.h || 30;
        const isCircle = m.type === 'circle';
        const is3DRender = this.is3D && this._projectionMode === 'render';

        if (is3DRender) {
          const ox = WING_SIZE + HALF_W;
          const oy = WING_SIZE + HALF_H;
          const hw = w / 2, hh = h / 2;
          const corners = [
            this._project3D(m.x - hw, m.y - hh),
            this._project3D(m.x + hw, m.y - hh),
            this._project3D(m.x + hw, m.y + hh),
            this._project3D(m.x - hw, m.y + hh),
          ].map(p => ({ x: ox + p.x, y: oy + p.y }));

          // Projected ellipse radii from corners
          const pRx = Math.abs(corners[1].x - corners[0].x) / 2;
          const pRy = Math.abs(corners[2].y - corners[0].y) / 2;

          const drawShape = () => {
            ctx.beginPath();
            if (isCircle) {
              ctx.ellipse(cx, cy, pRx, pRy, 0, 0, Math.PI * 2);
            } else {
              ctx.moveTo(corners[0].x, corners[0].y);
              for (let j = 1; j < 4; j++) ctx.lineTo(corners[j].x, corners[j].y);
              ctx.closePath();
            }
          };

          // Fill
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          drawShape();
          ctx.fill();

          // Hatch lines (clipped)
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 0.5;
          drawShape();
          ctx.clip();
          const minX = Math.min(...corners.map(c => c.x));
          const maxX = Math.max(...corners.map(c => c.x));
          const minY = Math.min(...corners.map(c => c.y));
          const maxY = Math.max(...corners.map(c => c.y));
          const span = maxX - minX + maxY - minY;
          ctx.beginPath();
          for (let d = -span; d < span; d += 8) {
            ctx.moveTo(minX + Math.max(0, d), minY + Math.max(0, -d));
            ctx.lineTo(minX + Math.min(maxX - minX, d + (maxY - minY)), minY + Math.min(maxY - minY, (maxY - minY) - d));
          }
          ctx.stroke();
          ctx.restore();

          // Border
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          drawShape();
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          const rx = cx - w / 2, ry = cy - h / 2;

          // Selection outline
          if (isSelected) {
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = 2;
            if (isCircle) {
              ctx.beginPath();
              ctx.ellipse(cx, cy, w / 2 + 3, h / 2 + 3, 0, 0, Math.PI * 2);
              ctx.stroke();
            } else {
              ctx.strokeRect(rx - 3, ry - 3, w + 6, h + 6);
            }
          }

          // Fill
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          if (isCircle) {
            ctx.beginPath();
            ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(rx, ry, w, h);
          }

          // Hatch lines
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 0.5;
          if (isCircle) {
            ctx.beginPath();
            ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.clip();
          }
          ctx.beginPath();
          for (let d = -w - h; d < w + h; d += 8) {
            ctx.moveTo(rx + Math.max(0, d), ry + Math.max(0, -d));
            ctx.lineTo(rx + Math.min(w, d + h), ry + Math.min(h, h - d));
          }
          ctx.stroke();
          ctx.restore();

          // Border
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          if (isCircle) {
            ctx.beginPath();
            ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.strokeRect(rx, ry, w, h);
          }
          ctx.setLineDash([]);

          // Resize handle (edit mode + selected)
          if (isSelected) {
            const hs = 4;
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(rx + w - hs, ry + h - hs, hs * 2, hs * 2);
          }
        }
      }

      ctx.restore();

      // Label
      if (m.label) {
        ctx.save();
        ctx.globalAlpha = this.markerEditMode ? 0.9 : 0.5;
        if (isPoint) {
          ctx.font = '9px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.fillText(m.label, cx, cy + 11);
        } else {
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText(m.label, cx, cy);
        }
        ctx.restore();
      }
    }
  }

  _drawMarkerIcon(ctx, cx, cy, r, type) {
    if (type === 'x') {
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
    }
    // rect and circle have no icon — shape is the visual
  }

  hitTestMarker(canvasX, canvasY) {
    if (!this.showMarkers) return -1;
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      const mcx = WING_SIZE + HALF_W + m.x;
      const mcy = WING_SIZE + HALF_H + m.y;
      if (this._isPointMarker(m.type)) {
        const dx = mcx - canvasX, dy = mcy - canvasY;
        if (dx * dx + dy * dy <= 144) return i; // r=12
      } else {
        const w = m.width || StageRenderer.MARKER_DEFAULTS[m.type]?.w || 30;
        const h = m.height || StageRenderer.MARKER_DEFAULTS[m.type]?.h || 30;
        if (m.type === 'circle') {
          const dx = (mcx - canvasX) / (w / 2), dy = (mcy - canvasY) / (h / 2);
          if (dx * dx + dy * dy <= 1) return i;
        } else {
          if (canvasX >= mcx - w / 2 && canvasX <= mcx + w / 2 &&
              canvasY >= mcy - h / 2 && canvasY <= mcy + h / 2) return i;
        }
      }
    }
    return -1;
  }

  hitTestMarkerResize(canvasX, canvasY) {
    if (!this.showMarkers || this._selectedMarker < 0) return false;
    const m = this.markers[this._selectedMarker];
    if (this._isPointMarker(m.type)) return false;
    const w = m.width || StageRenderer.MARKER_DEFAULTS[m.type]?.w || 30;
    const h = m.height || StageRenderer.MARKER_DEFAULTS[m.type]?.h || 30;
    const cx = WING_SIZE + HALF_W + m.x;
    const cy = WING_SIZE + HALF_H + m.y;
    const hx = cx + w / 2, hy = cy + h / 2;
    const dx = canvasX - hx, dy = canvasY - hy;
    return dx * dx + dy * dy <= 64; // 8px radius
  }
}

function parseColor(hex) {
  hex = hex.replace('#', '');
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
}

function toHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lightenColor(hex, amount) {
  const { r, g, b } = parseColor(hex);
  return toHex(r + amount, g + amount, b + amount);
}

function darkenColor(hex, amount) {
  const { r, g, b } = parseColor(hex);
  return toHex(r - amount, g - amount, b - amount);
}

function isLightColor(hex) {
  const { r, g, b } = parseColor(hex);
  // Relative luminance formula (sRGB)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55;
}
