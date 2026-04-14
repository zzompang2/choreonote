import { describe, it, expect, beforeEach } from 'vitest';
import { PlaybackEngine } from '../engine/PlaybackEngine.js';

// 테스트용 헬퍼: 대형 + 포지션 데이터 생성
function makeFormation(startTime, duration, positions) {
  return {
    startTime,
    duration,
    positions: positions.map(([dancerId, x, y, angle, waypoints]) => ({
      dancerId,
      x,
      y,
      angle: angle || 0,
      waypoints: waypoints || undefined,
    })),
  };
}

const DANCERS = [{ id: 1 }, { id: 2 }];

describe('calcPositionsAt - 보간', () => {
  let engine;

  beforeEach(() => {
    engine = new PlaybackEngine();
  });

  it('대형이 없으면 모든 댄서 (0,0)', () => {
    engine.setFormations([], DANCERS);
    const pos = engine.calcPositionsAt(500);
    expect(pos).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  });

  it('대형 내부: 정확한 포지션 반환', () => {
    engine.setFormations(
      [makeFormation(0, 1000, [[1, 100, 50, 90], [2, -100, -50, 180]])],
      DANCERS,
    );
    const pos = engine.calcPositionsAt(500);
    expect(pos[0]).toEqual({ x: 100, y: 50, angle: 90 });
    expect(pos[1]).toEqual({ x: -100, y: -50, angle: 180 });
  });

  it('첫 대형 이전: 첫 대형 포지션 반환', () => {
    engine.setFormations(
      [makeFormation(1000, 1000, [[1, 10, 20], [2, 30, 40]])],
      DANCERS,
    );
    const pos = engine.calcPositionsAt(0);
    expect(pos[0].x).toBe(10);
    expect(pos[0].y).toBe(20);
  });

  it('마지막 대형 이후: 마지막 대형 포지션 반환', () => {
    engine.setFormations(
      [makeFormation(0, 1000, [[1, 10, 20], [2, 30, 40]])],
      DANCERS,
    );
    const pos = engine.calcPositionsAt(5000);
    expect(pos[0].x).toBe(10);
  });

  it('두 대형 사이: 선형 보간', () => {
    engine.setFormations(
      [
        makeFormation(0, 1000, [[1, 0, 0], [2, 100, 0]]),
        makeFormation(2000, 1000, [[1, 100, 0], [2, 0, 0]]),
      ],
      DANCERS,
    );
    // gap: 1000~2000, 중간점 1500 → ratio 0.5
    const pos = engine.calcPositionsAt(1500);
    expect(pos[0].x).toBe(50);
    expect(pos[1].x).toBe(50);
  });

  it('각도 보간: 최단 경로 회전', () => {
    engine.setFormations(
      [
        makeFormation(0, 1000, [[1, 0, 0, 350], [2, 0, 0, 10]]),
        makeFormation(2000, 1000, [[1, 0, 0, 10], [2, 0, 0, 350]]),
      ],
      DANCERS,
    );
    // 350→10: 최단 경로는 +20도 (350→360→10)
    // ratio 0.5 → 350 + 10 = 360 → 0
    const pos = engine.calcPositionsAt(1500);
    expect(pos[0].angle).toBeCloseTo(0, 0);
    // 10→350: 최단 경로는 -20도 (10→0→350)
    expect(pos[1].angle).toBeCloseTo(0, 0);
  });

  it('경유점 1개: Quadratic Bezier (t=0.5에서 경유점 통과)', () => {
    const wp = [{ x: 0, y: -100 }];
    engine.setFormations(
      [
        makeFormation(0, 1000, [[1, -100, 0], [2, 0, 0]]),
        makeFormation(2000, 1000, [[1, 100, 0, 0, wp], [2, 0, 0]]),
      ],
      DANCERS,
    );
    // t=0.5 → 경유점 (0, -100)을 정확히 통과
    const pos = engine.calcPositionsAt(1500);
    expect(pos[0].x).toBeCloseTo(0, 0);
    expect(pos[0].y).toBeCloseTo(-100, 0);
  });

  it('경유점 여러 개: piecewise linear', () => {
    const wp = [
      { x: -50, y: -50, t: 0.25 },
      { x: 50, y: -50, t: 0.75 },
    ];
    engine.setFormations(
      [
        makeFormation(0, 1000, [[1, -100, 0], [2, 0, 0]]),
        makeFormation(2000, 1000, [[1, 100, 0, 0, wp], [2, 0, 0]]),
      ],
      DANCERS,
    );
    // t=0.25 → 첫 경유점 (-50, -50)
    const pos025 = engine.calcPositionsAt(1250);
    expect(pos025[0].x).toBeCloseTo(-50, 0);
    expect(pos025[0].y).toBeCloseTo(-50, 0);
  });

  it('갭이 0인 인접 대형: 다음 대형 포지션 반환', () => {
    engine.setFormations(
      [
        makeFormation(0, 1000, [[1, 0, 0], [2, 0, 0]]),
        makeFormation(1000, 1000, [[1, 50, 50], [2, -50, -50]]),
      ],
      DANCERS,
    );
    // 갭 없이 바로 이어지면 두 번째 대형 시작
    const pos = engine.calcPositionsAt(1000);
    expect(pos[0]).toEqual({ x: 50, y: 50, angle: 0 });
  });

  it('댄서 수와 포지션 수 불일치: 누락된 댄서는 (0,0)', () => {
    engine.setFormations(
      [makeFormation(0, 1000, [[1, 100, 50]])], // 댄서 2의 포지션 없음
      DANCERS,
    );
    const pos = engine.calcPositionsAt(500);
    expect(pos[0]).toEqual({ x: 100, y: 50, angle: 0 });
    expect(pos[1]).toEqual({ x: 0, y: 0, angle: 0 });
  });

  it('대형 3개 이상: 중간 갭에서 올바른 보간', () => {
    engine.setFormations(
      [
        makeFormation(0, 500, [[1, 0, 0], [2, 0, 0]]),
        makeFormation(1000, 500, [[1, 100, 0], [2, 0, 0]]),
        makeFormation(2000, 500, [[1, 200, 0], [2, 0, 0]]),
      ],
      DANCERS,
    );
    // 두 번째 갭 중간 (1500~2000, ratio 0.5)
    const pos = engine.calcPositionsAt(1750);
    expect(pos[0].x).toBeCloseTo(150, 0);
  });

  it('정확히 대형 시작 시간: 해당 대형 포지션', () => {
    engine.setFormations(
      [
        makeFormation(0, 1000, [[1, 10, 20], [2, 30, 40]]),
        makeFormation(2000, 1000, [[1, 50, 60], [2, 70, 80]]),
      ],
      DANCERS,
    );
    const pos = engine.calcPositionsAt(2000);
    expect(pos[0]).toEqual({ x: 50, y: 60, angle: 0 });
  });
});
