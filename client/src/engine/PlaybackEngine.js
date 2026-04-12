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

    return dancers.map((_, i) => {
      const prev = prevPositions[i] || { x: 0, y: 0 };
      const next = nextPositions[i] || { x: 0, y: 0 };
      return {
        x: prev.x + (next.x - prev.x) * ratio,
        y: prev.y + (next.y - prev.y) * ratio,
      };
    });
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
      return pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 };
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
