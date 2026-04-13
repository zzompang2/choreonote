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
    this.isSnap = false;
    this.showNames = true;
    this.gridGap = GRID_GAP;
    this.dancerShape = 'pentagon'; // 'pentagon', 'circle', 'heart'
    this.audienceDirection = 'top'; // 'top' or 'bottom'

    // Drag state
    this._dragging = null; // { dancerIndex, startX, startY, offsetX, offsetY }
    this._boxSelect = null; // { startX, startY, endX, endY }
    this._selectedDancers = new Set();

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
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Wing areas (offstage)
    const styles = getComputedStyle(document.documentElement);
    const wingColor = styles.getPropertyValue('--stage-wing').trim() || '#0a0a15';
    const stageColor = styles.getPropertyValue('--stage-bg').trim() || '#1a1a2e';
    this._stageColor = stageColor;

    ctx.fillStyle = wingColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Stage background
    ctx.fillStyle = stageColor;
    ctx.fillRect(WING_SIZE, WING_SIZE, STAGE_WIDTH, STAGE_HEIGHT);

    // Stage border
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(WING_SIZE, WING_SIZE, STAGE_WIDTH, STAGE_HEIGHT);
    ctx.setLineDash([]);

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

    // Audience indicator: rows of seat rectangles
    const isTop = this.audienceDirection === 'top';
    const seatW = 24;
    const seatH = 18;
    const seatGap = 6;
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
  }

  // --- Main Draw ---
  drawFrame(dancers, positions) {
    const ctx = this.ctx;
    // Grid from cache
    ctx.drawImage(this.gridCanvas, 0, 0);

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
      let radius = DANCER_RADIUS;

      // Check if dancer is offstage
      const isOffstage = Math.abs(pos.x) > HALF_W || Math.abs(pos.y) > HALF_H;

      // 3D projection for video export
      if (this.is3D && this._projectionMode === 'render') {
        const projected = this._project3D(pos.x, pos.y);
        screenX = WING_SIZE + HALF_W + projected.x;
        screenY = WING_SIZE + HALF_H + projected.y;
        radius = DANCER_RADIUS * projected.scale;
      }

      const isSelected = this._selectedDancers.has(i);
      ctx.globalAlpha = isOffstage ? 0.4 : 1.0;

      // Compensate CSS transforms so dancers appear upright
      const needsCompensation = this.isRotated || this.is3D;
      if (needsCompensation) {
        ctx.save();
        ctx.translate(screenX, screenY);
        // Undo CSS rotateZ(180deg)
        if (this.isRotated) ctx.rotate(Math.PI);
        // Undo CSS rotateX by scaling Y back (perspective approximation)
        if (this.is3D) {
          const angle = 55 * Math.PI / 180;
          ctx.scale(1, 1 / Math.cos(angle));
        }
        ctx.translate(-screenX, -screenY);
      }

      if (this.is3D) {
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
        const angle = pos.angle || 0;
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

      if (isSelected) {
        if (this.is3D) {
          // Highlight around head
          const headY = screenY - radius * 3.2 - radius * 0.7 * 0.8;
          ctx.beginPath();
          ctx.arc(screenX, headY, radius * 0.7 + 3, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          const angle = pos.angle || 0;
          const rad = angle * Math.PI / 180;
          ctx.beginPath();
          this._drawShape(ctx, screenX, screenY, radius + 2, rad);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Name/index label
      const label = this.showNames ? d.name.slice(0, 3) : String(i + 1);
      ctx.fillStyle = isLightColor(d.color) ? (this._stageColor || '#1a1a2e') : '#ffffff';
      // 3D: label in body center, 2D: label in circle center
      const bodyCenter = screenY - radius * 3.2 * 0.45;
      const labelY = this.is3D ? bodyCenter : screenY;
      const isNumber = !this.showNames;
      const fontSize = this.is3D
        ? Math.round(radius * (isNumber ? 1.0 : 0.75))
        : Math.round(radius * (isNumber ? 1.1 : 0.8));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelOffset = isNumber ? fontSize * 0.15 : 0;
      ctx.fillText(label, screenX, labelY + labelOffset);

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

    // Draw waypoint dots on top of everything
    if (this._waypointPaths) {
      const ox = WING_SIZE + HALF_W;
      const oy = WING_SIZE + HALF_H;
      for (const path of this._waypointPaths) {
        if (path.points.length < 3) continue;
        const cp = path.points[1];
        ctx.beginPath();
        ctx.arc(ox + cp.x, oy + cp.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = path.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
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
      const h = r * 0.85;
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
    const angle = 30 * (Math.PI / 180);
    const projectedY = y * Math.cos(angle);
    const depthFactor = 1 - (y / HALF_H) * 0.15;
    const scale = clamp(depthFactor, 0.7, 1.3);
    return { x: x * scale, y: projectedY, scale };
  }

  set3D(enabled, mode = 'css') {
    this.is3D = enabled;
    this._projectionMode = mode;
    this._updateTransform();
  }

  setRotated(enabled) {
    this.isRotated = enabled;
    this._updateTransform();
  }

  _updateTransform() {
    const wrap = this.canvas.parentElement;
    if (!wrap) return;
    const parts = [];
    if (this.is3D) parts.push('perspective(800px) rotateX(55deg)');
    if (this.isRotated) parts.push('rotateZ(180deg)');
    wrap.style.transform = parts.join(' ') || '';
  }

  // --- Hit Test ---
  hitTest(canvasX, canvasY, positions) {
    for (let i = positions.length - 1; i >= 0; i--) {
      const pos = positions[i];
      if (!pos) continue;
      const dx = (WING_SIZE + HALF_W + pos.x) - canvasX;
      const dy = (WING_SIZE + HALF_H + pos.y) - canvasY;
      if (dx * dx + dy * dy <= DANCER_RADIUS * DANCER_RADIUS) {
        return i;
      }
    }
    return -1;
  }

  // Waypoint hit test (returns {dancerIndex, waypointIndex} or null)
  hitTestWaypoint(canvasX, canvasY) {
    if (!this._waypointPaths) return null;
    for (const path of this._waypointPaths) {
      // Skip start (index 0) and end (last) — only intermediate waypoints
      for (let j = 1; j < path.points.length - 1; j++) {
        const wp = path.points[j];
        const dx = (WING_SIZE + HALF_W + wp.x) - canvasX;
        const dy = (WING_SIZE + HALF_H + wp.y) - canvasY;
        if (dx * dx + dy * dy <= 144) { // 12px radius for easier clicking
          return { dancerIndex: path.dancerIndex, waypointIndex: j - 1 }; // j-1 because points[0] is start
        }
      }
    }
    return null;
  }

  // Find closest path segment for adding waypoint
  findClosestPath(canvasX, canvasY) {
    if (!this._waypointPaths) return null;
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

    // Mouse wheel on dancer: rotate direction
    this.canvas.addEventListener('wheel', (e) => {
      if (!this._positions || !this._dancers) return;
      const { x, y } = this._getCanvasPos(e);
      const hit = this.hitTest(x, y, this._positions);
      if (hit >= 0) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 15 : -15;
        this.onDancerRotate?.(hit, delta);
      }
    }, { passive: false });

    // Right click on waypoint: reset (cancel any active drag)
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._draggingWaypoint = null;
      const { x, y } = this._getCanvasPos(e);
      const wpHit = this.hitTestWaypoint(x, y);
      if (wpHit) {
        this.onWaypointReset?.(wpHit.dancerIndex);
      }
    });

    // Touch support
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onMouseDown(this._touchToMouse(e));
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this._onMouseMove(this._touchToMouse(e));
    }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this._onMouseUp(this._touchToMouse(e, true));
    }, { passive: false });
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
    return {
      x: (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width),
      y: (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height),
    };
  }

  _onMouseDown(e) {
    if (!this._positions || !this._dancers) return;
    if (this.is3D || this.isRotated) return;
    const { x, y } = this._getCanvasPos(e);

    // Check waypoint hit first
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
        // Normal click: start drag
        const pos = this._positions[hit];
        this._dragging = {
          dancerIndex: hit,
          startX: WING_SIZE + HALF_W + pos.x,
          startY: WING_SIZE + HALF_H + pos.y,
          offsetX: x - (WING_SIZE + HALF_W + pos.x),
          offsetY: y - (WING_SIZE + HALF_H + pos.y),
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

    if (this._draggingWaypoint) {
      const newX = x - WING_SIZE - HALF_W;
      const newY = y - WING_SIZE - HALF_H;
      this.onWaypointDrag?.(this._draggingWaypoint.dancerIndex, this._draggingWaypoint.waypointIndex, newX, newY);
      return;
    }

    if (this._dragging) {
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
    if (this._draggingWaypoint) {
      const { x, y } = this._getCanvasPos(e);
      const newX = x - WING_SIZE - HALF_W;
      const newY = y - WING_SIZE - HALF_H;
      this.onWaypointDragEnd?.(this._draggingWaypoint.dancerIndex, this._draggingWaypoint.waypointIndex, newX, newY);
      this._draggingWaypoint = null;
      return;
    }

    if (this._dragging) {
      const { x, y } = this._getCanvasPos(e);
      const newX = x - this._dragging.offsetX - WING_SIZE - HALF_W;
      const newY = y - this._dragging.offsetY - WING_SIZE - HALF_H;
      this.onDancerDragEnd?.(this._dragging.dancerIndex, newX, newY, this._selectedDancers);
      this._dragging = null;
    }

    if (this._boxSelect) {
      this._selectDancersInBox();
      this._boxSelect = null;
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
