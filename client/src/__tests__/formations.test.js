import { describe, it, expect } from 'vitest';
import { PRESETS, applyPreset } from '../utils/formations.js';

describe('PRESETS', () => {
  const presetNames = Object.keys(PRESETS);

  it.each(presetNames)('%s: 요청한 수만큼 포지션 반환', (name) => {
    for (const n of [1, 3, 5, 8]) {
      const positions = PRESETS[name](n, 40);
      expect(positions).toHaveLength(n);
      for (const p of positions) {
        expect(p).toHaveProperty('x');
        expect(p).toHaveProperty('y');
        expect(typeof p.x).toBe('number');
        expect(typeof p.y).toBe('number');
      }
    }
  });

  it('일자: 균등 간격 배치', () => {
    const pos = PRESETS['일자'](3, 60);
    // 간격 60, 중앙 정렬: -60, 0, 60
    expect(pos[0].x).toBe(-60);
    expect(pos[1].x).toBe(0);
    expect(pos[2].x).toBe(60);
    // 모두 y=0
    expect(pos.every(p => p.y === 0)).toBe(true);
  });

  it('원형: 댄서 1명이면 반지름 위 1개 점', () => {
    const pos = PRESETS['원형'](1, 40);
    expect(pos).toHaveLength(1);
  });
});

describe('applyPreset', () => {
  it('센터 정렬: 중심이 (0,0) 근처', () => {
    const pos = applyPreset('일자', 4, 40);
    const cx = pos.reduce((s, p) => s + p.x, 0) / pos.length;
    const cy = pos.reduce((s, p) => s + p.y, 0) / pos.length;
    expect(Math.abs(cx)).toBeLessThanOrEqual(1);
    expect(Math.abs(cy)).toBeLessThanOrEqual(1);
  });

  it('무대 범위 초과 시 축소', () => {
    // 작은 무대에 큰 간격 → 축소 적용
    const pos = applyPreset('일자', 10, 100, 100, 100);
    for (const p of pos) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(100);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(100);
    }
  });

  it('존재하지 않는 프리셋은 null 반환', () => {
    expect(applyPreset('없는프리셋', 3, 40)).toBeNull();
  });
});
