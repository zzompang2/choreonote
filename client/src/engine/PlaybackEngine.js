import { floorTime, TIME_UNIT } from '../utils/constants.js';

export class PlaybackEngine {
  constructor() {
    this.audioContext = null;
    this.sourceNode = null;
    this.audioBuffer = null;
    this.gainNode = null;

    this.isPlaying = false;
    this._startTime = 0; // AudioContext time when playback started
    this._startOffset = 0; // position in song when play was pressed (seconds)

    this.formations = [];
    this.dancers = [];

    this._rafId = null;

    // Callbacks
    this.onTimeUpdate = null; // (ms) => void
    this.onPositionsUpdate = null; // (positions[]) => void
    this.onFormationChange = null; // (formationIndex) => void
    this.onPlaybackEnd = null;
  }

  async loadAudio(blob) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }
    const arrayBuffer = await blob.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
  }

  get duration() {
    if (this._manualDuration) return this._manualDuration;
    return this.audioBuffer ? this.audioBuffer.duration * 1000 : 30000;
  }

  set duration(ms) {
    this._manualDuration = ms;
  }

  get currentTime() {
    if (!this.isPlaying || !this.audioContext) return this._startOffset * 1000;
    const elapsed = this.audioContext.currentTime - this._startTime;
    return (this._startOffset + elapsed) * 1000;
  }

  get snappedTime() {
    return floorTime(this.currentTime);
  }

  setFormations(formations, dancers) {
    this.formations = formations;
    this.dancers = dancers;
  }

  play(fromMs = null) {
    if (this.isPlaying) return;
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }

    const offset = fromMs !== null ? fromMs / 1000 : this._startOffset;
    this._startOffset = offset;

    if (this.audioBuffer) {
      this.sourceNode = this.audioContext.createBufferSource();
      this.sourceNode.buffer = this.audioBuffer;
      this.sourceNode.connect(this.gainNode);
      this.sourceNode.start(0, offset);
      // Don't stop playback when audio ends — animation may continue beyond audio
      this.sourceNode.onended = () => {
        this.sourceNode = null;
      };
    }

    this._startTime = this.audioContext.currentTime;
    this.isPlaying = true;
    this._animate();
  }

  pause() {
    if (!this.isPlaying) return;

    // Read current time BEFORE setting isPlaying=false (getter depends on it)
    const elapsed = this.audioContext.currentTime - this._startTime;
    const ms = (this._startOffset + elapsed) * 1000;

    this.isPlaying = false;
    this._startOffset = ms / 1000;

    if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch (_) {}
      this.sourceNode = null;
    }
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    this.onTimeUpdate?.(ms);
    this.onPositionsUpdate?.(this.calcPositionsAt(ms));
  }

  seek(ms) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this._startOffset = ms / 1000;
    this.onTimeUpdate?.(ms);
    this.onPositionsUpdate?.(this.calcPositionsAt(ms));
    if (wasPlaying) this.play(ms);
  }

  _animate() {
    if (!this.isPlaying) return;
    const ms = this.currentTime;

    if (ms >= this.duration) {
      this.pause();
      this.onPlaybackEnd?.();
      return;
    }

    this.onTimeUpdate?.(ms);
    this.onPositionsUpdate?.(this.calcPositionsAt(ms));

    // Check which formation we're in
    const fIdx = this._findFormationAt(ms);
    this.onFormationChange?.(fIdx);

    this._rafId = requestAnimationFrame(() => this._animate());
  }

  // --- Position Interpolation (ported from Stage.js calcPositionAt) ---
  calcPositionsAt(ms) {
    const { formations, dancers } = this;
    if (!formations.length || !dancers.length) {
      return dancers.map(() => ({ x: 0, y: 0 }));
    }

    const fIdx = this._findFormationAt(ms);

    // Inside a formation box
    if (fIdx >= 0) {
      return this._getFormationPositions(fIdx);
    }

    // Before first formation
    if (ms < formations[0].startTime) {
      return this._getFormationPositions(0);
    }

    // After last formation
    const lastF = formations[formations.length - 1];
    if (ms >= lastF.startTime + lastF.duration) {
      return this._getFormationPositions(formations.length - 1);
    }

    // Between formations: linear interpolation
    const prevIdx = this._findPrevFormation(ms);
    const nextIdx = prevIdx + 1;
    if (nextIdx >= formations.length) {
      return this._getFormationPositions(prevIdx);
    }

    const prevF = formations[prevIdx];
    const nextF = formations[nextIdx];
    const prevEnd = prevF.startTime + prevF.duration;
    const gapDuration = nextF.startTime - prevEnd;

    if (gapDuration <= 0) {
      return this._getFormationPositions(nextIdx);
    }

    const ratio = (ms - prevEnd) / gapDuration;
    const prevPositions = this._getFormationPositions(prevIdx);
    const nextPositions = this._getFormationPositions(nextIdx);

    return dancers.map((dancer, i) => {
      const prev = prevPositions[i] || { x: 0, y: 0 };
      const next = nextPositions[i] || { x: 0, y: 0 };

      // Check for waypoints on the destination formation's position
      const nextF = formations[nextIdx];
      const posData = nextF.positions.find(p => p.dancerId === dancer.id);
      const waypoints = posData?.waypoints;

      // Interpolate angle (shortest path rotation)
      const prevAngle = prev.angle || 0;
      const nextAngle = next.angle || 0;
      let angleDiff = nextAngle - prevAngle;
      if (angleDiff > 180) angleDiff -= 360;
      if (angleDiff < -180) angleDiff += 360;
      const interpAngle = ((prevAngle + angleDiff * ratio) + 360) % 360;

      if (waypoints && waypoints.length > 0) {
        const result = this._interpolateWithWaypoints(prev, next, waypoints, ratio);
        result.angle = interpAngle;
        return result;
      }

      return {
        x: prev.x + (next.x - prev.x) * ratio,
        y: prev.y + (next.y - prev.y) * ratio,
        angle: interpAngle,
      };
    });
  }

  _interpolateWithWaypoints(start, end, waypoints, t) {
    // Single waypoint: Quadratic Bezier that PASSES THROUGH the waypoint at t=0.5
    // Reverse-calculate control point: cp = 2*passthrough - 0.5*(start+end)
    if (waypoints.length === 1) {
      const pt = waypoints[0]; // passthrough point
      const cp = {
        x: 2 * pt.x - 0.5 * (start.x + end.x),
        y: 2 * pt.y - 0.5 * (start.y + end.y),
      };
      const u = 1 - t;
      return {
        x: u * u * start.x + 2 * u * t * cp.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * cp.y + t * t * end.y,
      };
    }

    // Multiple waypoints: piecewise linear fallback
    const points = [
      { x: start.x, y: start.y, t: 0 },
      ...waypoints.slice().sort((a, b) => a.t - b.t),
      { x: end.x, y: end.y, t: 1 },
    ];
    for (let i = 0; i < points.length - 1; i++) {
      if (t >= points[i].t && t <= points[i + 1].t) {
        const segT = (t - points[i].t) / (points[i + 1].t - points[i].t);
        return {
          x: points[i].x + (points[i + 1].x - points[i].x) * segT,
          y: points[i].y + (points[i + 1].y - points[i].y) * segT,
        };
      }
    }
    return { x: end.x, y: end.y };
  }

  _findFormationAt(ms) {
    for (let i = 0; i < this.formations.length; i++) {
      const f = this.formations[i];
      if (ms >= f.startTime && ms < f.startTime + f.duration) return i;
    }
    return -1;
  }

  _findPrevFormation(ms) {
    for (let i = this.formations.length - 1; i >= 0; i--) {
      const f = this.formations[i];
      if (ms >= f.startTime + f.duration) return i;
    }
    return 0;
  }

  _getFormationPositions(fIdx) {
    const f = this.formations[fIdx];
    if (!f || !f.positions) return this.dancers.map(() => ({ x: 0, y: 0 }));

    return this.dancers.map((dancer) => {
      const pos = f.positions.find((p) => p.dancerId === dancer.id);
      return pos ? { x: pos.x, y: pos.y, angle: pos.angle || 0 } : { x: 0, y: 0, angle: 0 };
    });
  }

  // For video export: get AudioContext destination stream
  getAudioStream() {
    if (!this.audioContext) return null;
    const dest = this.audioContext.createMediaStreamDestination();
    this.gainNode.connect(dest);
    return dest.stream;
  }

  destroy() {
    this.pause();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
