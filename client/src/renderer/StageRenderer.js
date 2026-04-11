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

    // Drag state
    this._dragging = null; // { dancerIndex, startX, startY, offsetX, offsetY }
    this._boxSelect = null; // { startX, startY, endX, endY }
    this._selectedDancers = new Set();

    this._setupEvents();
  }

  // --- Grid Cache (drawn once) ---
  _drawGridCache() {
    const ctx = this.gridCanvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Wing areas (offstage)
    ctx.fillStyle = '#0a0a15';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Stage background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(WING_SIZE, WING_SIZE, STAGE_WIDTH, STAGE_HEIGHT);

    // Stage border
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(WING_SIZE, WING_SIZE, STAGE_WIDTH, STAGE_HEIGHT);
    ctx.setLineDash([]);

    // Grid lines (inside stage only)
    const ox = WING_SIZE; // stage origin x
    const oy = WING_SIZE; // stage origin y
    for (let x = HALF_W % GRID_GAP; x < STAGE_WIDTH; x += GRID_GAP) {
      const isMajor = Math.round(Math.abs(x - HALF_W) / GRID_GAP) % 4 === 0;
      ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)';
      ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(ox + x, oy);
      ctx.lineTo(ox + x, oy + STAGE_HEIGHT);
      ctx.stroke();
    }
    for (let y = HALF_H % GRID_GAP; y < STAGE_HEIGHT; y += GRID_GAP) {
      const isMajor = Math.round(Math.abs(y - HALF_H) / GRID_GAP) % 4 === 0;
      ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)';
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
  }

  // --- Main Draw ---
  drawFrame(dancers, positions) {
    const ctx = this.ctx;
    // Grid from cache
    ctx.drawImage(this.gridCanvas, 0, 0);

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
        // 2D mode: flat circle + subtle shadow
        ctx.beginPath();
        ctx.arc(screenX, screenY + 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
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
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Name/index label
      const label = this.showNames ? d.name.slice(0, 3) : String(i + 1);
      ctx.fillStyle = isLightColor(d.color) ? '#1a1a2e' : '#ffffff';
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
  }

  // --- 3D Projection (for video export) ---
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
    if (mode === 'css') {
      this.canvas.style.transform = enabled
        ? 'perspective(800px) rotateX(30deg)'
        : '';
      this.canvas.style.transformOrigin = 'center center';
    }
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

  // --- Mouse Events ---
  _setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
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
    const { x, y } = this._getCanvasPos(e);
    const hit = this.hitTest(x, y, this._positions);

    if (hit >= 0) {
      const pos = this._positions[hit];
      this._dragging = {
        dancerIndex: hit,
        startX: WING_SIZE + HALF_W + pos.x,
        startY: WING_SIZE + HALF_H + pos.y,
        offsetX: x - (WING_SIZE + HALF_W + pos.x),
        offsetY: y - (WING_SIZE + HALF_H + pos.y),
      };
      if (!this._selectedDancers.has(hit)) {
        if (!e.shiftKey) this._selectedDancers.clear();
        this._selectedDancers.add(hit);
      }
      this.onDancerSelect?.(hit);
    } else {
      this._selectedDancers.clear();
      this._boxSelect = { startX: x, startY: y, endX: x, endY: y };
      this.onDancerSelect?.(-1);
    }
  }

  _onMouseMove(e) {
    const { x, y } = this._getCanvasPos(e);

    if (this._dragging) {
      const newX = x - this._dragging.offsetX - WING_SIZE - HALF_W;
      const newY = y - this._dragging.offsetY - WING_SIZE - HALF_H;
      this.onDancerDrag?.(this._dragging.dancerIndex, newX, newY, this._selectedDancers);
    }

    if (this._boxSelect) {
      this._boxSelect.endX = x;
      this._boxSelect.endY = y;
    }
  }

  _onMouseUp(e) {
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
    }
  }

  _selectDancersInBox() {
    if (!this._boxSelect || !this._positions) return;
    const { startX, startY, endX, endY } = this._boxSelect;
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    this._selectedDancers.clear();
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
