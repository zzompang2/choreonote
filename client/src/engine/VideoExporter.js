import { StageRenderer } from '../renderer/StageRenderer.js';
import { STAGE_WIDTH, STAGE_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT, WING_SIZE } from '../utils/constants.js';

function interpolateWithWaypoints(start, end, waypoints, t) {
  if (waypoints.length === 1) {
    const pt = waypoints[0];
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
  // Multiple waypoints: piecewise linear
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

  async export({ dancers, formations, audioBlob, duration, is3D, showNames, showNumbers, dancerShape, gridGap, dancerScale, audienceDirection, showWings, markers, onProgress, onComplete, onError }) {
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
      const renderer = new StageRenderer(canvas);
      // 에디터 뷰 옵션을 그대로 반영 — 이전엔 dancerShape/showNumbers/gridGap이 누락돼 기본값(pentagon/숫자표시/기본그리드)으로 내보내짐
      renderer.showNames = !!showNames;
      if (typeof showNumbers === 'boolean') renderer.showNumbers = showNumbers;
      if (dancerShape) renderer.dancerShape = dancerShape;
      if (gridGap) renderer.gridGap = gridGap;
      renderer.audienceDirection = audienceDirection || 'top';
      renderer.showWings = !!showWings;
      const exportMarkers = (markers || []).map(m => ({ ...m }));
      renderer.markers = exportMarkers;
      renderer.showMarkers = exportMarkers.length > 0;
      if (dancerScale) renderer.dancerScale = dancerScale;
      renderer._drawGridCache();

      // Export canvas: include wings if showWings is on, otherwise add audience margin
      const audienceMargin = 65; // stageGap(24) + 2 rows of seats(18+5+18)
      const dir = audienceDirection || 'top';
      const hasAudience = !showWings;
      const baseW = showWings ? CANVAS_WIDTH : STAGE_WIDTH;
      const baseH = showWings ? CANVAS_HEIGHT : (STAGE_HEIGHT + (hasAudience ? audienceMargin : 0));
      // 1080p + 6Mbps — 이전 720p·2Mbps는 모션 많을 때 지지직 현상
      const exportWidth = 1920;
      const exportHeight = Math.round(exportWidth * (baseH / baseW));
      canvas.width = exportWidth;
      canvas.height = exportHeight;

      const scaleX = exportWidth / baseW;
      const scaleY = exportHeight / baseH;

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
        videoBitsPerSecond: 6_000_000,
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

        return dancers.map((d, i) => {
          const prev = prevPos[i];
          const next = nextPos[i];

          // Angle interpolation (shortest path)
          let angleDiff = (next.angle || 0) - (prev.angle || 0);
          if (angleDiff > 180) angleDiff -= 360;
          if (angleDiff < -180) angleDiff += 360;
          const angle = (((prev.angle || 0) + angleDiff * ratio) + 360) % 360;

          // Waypoint interpolation
          const nextPosData = nextF.positions.find(p => p.dancerId === d.id);
          const waypoints = nextPosData?.waypoints;
          if (waypoints && waypoints.length > 0) {
            const pos = interpolateWithWaypoints(prev, next, waypoints, ratio);
            return { ...pos, angle };
          }

          return {
            x: prev.x + (next.x - prev.x) * ratio,
            y: prev.y + (next.y - prev.y) * ratio,
            angle,
          };
        });
      };

      const getFormationPositions = (fIdx) => {
        const f = formations[fIdx];
        if (!f || !f.positions) return dancers.map(() => ({ x: 0, y: 0 }));
        return dancers.map(d => {
          const p = f.positions.find(p => p.dancerId === d.id);
          return p ? { x: p.x, y: p.y, angle: p.angle || 0 } : { x: 0, y: 0, angle: 0 };
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
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(scaleX, scaleY);
        if (!showWings) {
          const offsetY = hasAudience && dir === 'top'
            ? -(WING_SIZE - audienceMargin)
            : -WING_SIZE;
          ctx.translate(-WING_SIZE, offsetY);
        }

        renderer.is3D = !!is3D;
        if (is3D) renderer._projectionMode = 'render';

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
