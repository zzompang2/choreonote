import { StageRenderer } from '../renderer/StageRenderer.js';
import { STAGE_WIDTH, STAGE_HEIGHT } from '../utils/constants.js';

export class VideoExporter {
  constructor() {
    this.isExporting = false;
    this._mediaRecorder = null;
    this._chunks = [];
    this._cancelRequested = false;

    // Callbacks
    this.onProgress = null; // (percent) => void
    this.onComplete = null; // (blob, mimeType) => void
    this.onError = null;    // (error) => void
  }

  async export({ dancers, formations, audioBlob, duration, is3D, isRotated, showNames, dancerScale, onProgress, onComplete, onError }) {
    if (this.isExporting) return;
    this.isExporting = true;
    this._cancelRequested = false;
    this._chunks = [];
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.onError = onError;

    try {
      // Create offscreen canvas for rendering
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = Math.round(1280 * (STAGE_HEIGHT / STAGE_WIDTH));
      const renderer = new StageRenderer(canvas);
      renderer.showNames = showNames;
      if (dancerScale) renderer.dancerScale = dancerScale;

      // Scale rendering to 720p
      const scaleX = canvas.width / STAGE_WIDTH;
      const scaleY = canvas.height / STAGE_HEIGHT;

      // Set up audio via Web Audio API
      let audioContext = null;
      let audioSource = null;
      let audioDest = null;

      if (audioBlob) {
        audioContext = new AudioContext();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        audioDest = audioContext.createMediaStreamDestination();
        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.connect(audioDest);
        // Do NOT connect to destination — no sound during export
      }

      // Set up video stream from canvas
      const videoStream = canvas.captureStream(30); // 30fps

      // Combine video + audio streams
      let combinedStream;
      if (audioDest) {
        const audioTracks = audioDest.stream.getAudioTracks();
        const videoTracks = videoStream.getVideoTracks();
        combinedStream = new MediaStream([...videoTracks, ...audioTracks]);
      } else {
        combinedStream = videoStream;
      }

      // Determine codec
      let mimeType = 'video/webm;codecs=vp8,opus';
      if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
        mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        mimeType = 'video/webm;codecs=vp9,opus';
      }

      this._mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 2_000_000,
      });

      this._mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this._chunks.push(e.data);
      };

      this._mediaRecorder.onstop = () => {
        this.isExporting = false;
        if (this._cancelRequested) return;

        const blob = new Blob(this._chunks, { type: mimeType });
        this.onComplete?.(blob, mimeType);
      };

      this._mediaRecorder.onerror = (e) => {
        this.isExporting = false;
        this.onError?.(e.error || new Error('녹화 중 오류 발생'));
      };

      // Build a simple playback engine for export (no reuse of main engine to avoid conflicts)
      const calcPositionsAt = (ms) => {
        if (!formations.length || !dancers.length) {
          return dancers.map(() => ({ x: 0, y: 0 }));
        }

        // Find formation at time
        const fIdx = formations.findIndex(f => ms >= f.startTime && ms < f.startTime + f.duration);
        if (fIdx >= 0) {
          return getFormationPositions(fIdx);
        }

        // Before first
        if (ms < formations[0].startTime) return getFormationPositions(0);

        // After last
        const lastF = formations[formations.length - 1];
        if (ms >= lastF.startTime + lastF.duration) return getFormationPositions(formations.length - 1);

        // Between: linear interpolation
        let prevIdx = 0;
        for (let i = formations.length - 1; i >= 0; i--) {
          if (ms >= formations[i].startTime + formations[i].duration) { prevIdx = i; break; }
        }
        const nextIdx = prevIdx + 1;
        if (nextIdx >= formations.length) return getFormationPositions(prevIdx);

        const prevF = formations[prevIdx];
        const nextF = formations[nextIdx];
        const prevEnd = prevF.startTime + prevF.duration;
        const gap = nextF.startTime - prevEnd;
        if (gap <= 0) return getFormationPositions(nextIdx);

        const ratio = (ms - prevEnd) / gap;
        const prevPos = getFormationPositions(prevIdx);
        const nextPos = getFormationPositions(nextIdx);

        return dancers.map((_, i) => ({
          x: prevPos[i].x + (nextPos[i].x - prevPos[i].x) * ratio,
          y: prevPos[i].y + (nextPos[i].y - prevPos[i].y) * ratio,
        }));
      };

      const getFormationPositions = (fIdx) => {
        const f = formations[fIdx];
        if (!f || !f.positions) return dancers.map(() => ({ x: 0, y: 0 }));
        return dancers.map(d => {
          const p = f.positions.find(p => p.dancerId === d.id);
          return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
        });
      };

      // Start recording
      this._mediaRecorder.start(100); // collect data every 100ms

      // Start audio
      if (audioSource) {
        audioSource.start(0);
      }

      // Real-time render loop
      const startTime = performance.now();
      const durationMs = duration;

      const renderFrame = () => {
        if (this._cancelRequested) {
          this._mediaRecorder.stop();
          if (audioSource) try { audioSource.stop(); } catch (_) {}
          if (audioContext) audioContext.close();
          return;
        }

        const elapsed = performance.now() - startTime;
        const ms = Math.min(elapsed, durationMs);

        // Progress
        this.onProgress?.(Math.round(ms / durationMs * 100));

        // Calculate positions and draw
        let positions = calcPositionsAt(ms);
        // Rotate positions if needed
        if (isRotated) {
          positions = positions.map(p => ({ x: -p.x, y: -p.y, angle: ((p.angle || 0) + 180) % 360 }));
        }
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(scaleX, scaleY);

        // Use 3D projection mode for video if enabled
        if (is3D) {
          renderer.is3D = true;
          renderer._projectionMode = 'render';
        }
        renderer.isRotated = false;

        renderer.drawFrame(dancers, positions);
        ctx.restore();

        // Draw watermark
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('ChoreoNote.com', canvas.width - 12, canvas.height - 12);

        if (elapsed >= durationMs) {
          // Done
          this.onProgress?.(100);
          setTimeout(() => {
            this._mediaRecorder.stop();
            if (audioSource) try { audioSource.stop(); } catch (_) {}
            if (audioContext) audioContext.close();
          }, 200); // small delay to flush last frames
          return;
        }

        requestAnimationFrame(renderFrame);
      };

      requestAnimationFrame(renderFrame);

    } catch (err) {
      this.isExporting = false;
      this.onError?.(err);
    }
  }

  cancel() {
    this._cancelRequested = true;
  }
}
