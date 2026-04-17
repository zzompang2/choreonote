// Formation presets: returns array of {x, y} for given dancer count
// spacing parameter = grid gap from renderer

export const PRESETS = {
  '일자': (n, s) => {
    const startX = -(n - 1) * s / 2;
    return Array.from({ length: n }, (_, i) => ({ x: startX + i * s, y: 0 }));
  },

  '세로': (n, s) => {
    const startY = -(n - 1) * s / 2;
    return Array.from({ length: n }, (_, i) => ({ x: 0, y: startY + i * s }));
  },

  'V자': (n, s) => {
    return Array.from({ length: n }, (_, i) => {
      if (i === 0) return { x: 0, y: 0 };
      const row = Math.ceil(i / 2);
      const side = i % 2 === 1 ? -1 : 1;
      return { x: side * row * s * 0.6, y: row * s * 0.7 };
    });
  },

  '역V자': (n, s) => {
    return Array.from({ length: n }, (_, i) => {
      if (i === 0) return { x: 0, y: 0 };
      const row = Math.ceil(i / 2);
      const side = i % 2 === 1 ? -1 : 1;
      return { x: side * row * s * 0.6, y: -row * s * 0.7 };
    });
  },

  '원형': (n, s) => {
    const radius = Math.max(s, n * s * 0.35);
    return Array.from({ length: n }, (_, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
    });
  },

  '대각선': (n, s) => {
    const startX = -(n - 1) * s / 2;
    const startY = -(n - 1) * s / 2;
    return Array.from({ length: n }, (_, i) => ({
      x: startX + i * s * 0.7,
      y: startY + i * s * 0.5,
    }));
  },

  '역대각선': (n, s) => {
    const startX = -(n - 1) * s / 2;
    const startY = (n - 1) * s / 2;
    return Array.from({ length: n }, (_, i) => ({
      x: startX + i * s * 0.7,
      y: startY - i * s * 0.5,
    }));
  },

  '삼각형': (n, s) => {
    const positions = [];
    let row = 0;
    let placed = 0;
    while (placed < n) {
      const count = row + 1;
      const startX = -(count - 1) * s * 0.5;
      for (let j = 0; j < count && placed < n; j++) {
        positions.push({ x: startX + j * s, y: -s + row * s });
        placed++;
      }
      row++;
    }
    return positions;
  },

  '2열': (n, s) => {
    const rowSize = Math.ceil(n / 2);
    return Array.from({ length: n }, (_, i) => {
      const row = Math.floor(i / rowSize);
      const col = i % rowSize;
      const startX = -(rowSize - 1) * s / 2;
      return { x: startX + col * s, y: row * s - s / 2 };
    });
  },

  '지그재그': (n, s) => {
    const startX = -(n - 1) * s / 2 * 0.5;
    return Array.from({ length: n }, (_, i) => ({
      x: startX + i * s * 0.5,
      y: (i % 2 === 0 ? -s * 0.6 : s * 0.6),
    }));
  },
};

const CUSTOM_STORAGE_KEY = 'choreonote-custom-presets';

export function getPresetNames() {
  return Object.keys(PRESETS);
}

export function getCustomPresets() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY)) || {};
  } catch { return {}; }
}

export function saveCustomPreset(name, positions) {
  const custom = getCustomPresets();
  // Store relative positions (centered)
  const minX = Math.min(...positions.map(p => p.x));
  const maxX = Math.max(...positions.map(p => p.x));
  const minY = Math.min(...positions.map(p => p.y));
  const maxY = Math.max(...positions.map(p => p.y));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  custom[name] = positions.map(p => ({ x: Math.round(p.x - cx), y: Math.round(p.y - cy) }));
  localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(custom));
}

export function deleteCustomPreset(name) {
  const custom = getCustomPresets();
  delete custom[name];
  localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(custom));
}

export function applyPreset(name, dancerCount, spacing, stageW = 300, stageH = 200) {
  const fn = PRESETS[name];
  if (!fn) return null;
  let positions = fn(dancerCount, spacing);

  // (1) Center align
  const minX = Math.min(...positions.map(p => p.x));
  const maxX = Math.max(...positions.map(p => p.x));
  const minY = Math.min(...positions.map(p => p.y));
  const maxY = Math.max(...positions.map(p => p.y));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  positions = positions.map(p => ({ x: Math.round(p.x - cx), y: Math.round(p.y - cy) }));

  // (2) Scale down if exceeding stage bounds
  const newMinX = Math.min(...positions.map(p => p.x));
  const newMaxX = Math.max(...positions.map(p => p.x));
  const newMinY = Math.min(...positions.map(p => p.y));
  const newMaxY = Math.max(...positions.map(p => p.y));
  const scaleX = (newMaxX - newMinX) > 0 ? (stageW * 2 * 0.85) / (newMaxX - newMinX) : 1;
  const scaleY = (newMaxY - newMinY) > 0 ? (stageH * 2 * 0.85) / (newMaxY - newMinY) : 1;
  const scale = Math.min(1, scaleX, scaleY);
  if (scale < 1) {
    positions = positions.map(p => ({ x: Math.round(p.x * scale), y: Math.round(p.y * scale) }));
  }

  return positions;
}

/**
 * 헝가리안 알고리즘으로 현재 위치 → 목표 위치 최적 매칭.
 * 전체 이동 거리 합을 최소화하는 할당을 반환한다.
 * @param {{x:number,y:number}[]} currentPositions - 댄서들의 현재 좌표
 * @param {{x:number,y:number}[]} targetPositions - 프리셋 목표 좌표
 * @returns {number[]} assignment[i] = 댄서 i가 이동할 targetPositions 인덱스
 */
export function matchNearest(currentPositions, targetPositions) {
  const n = currentPositions.length;
  if (n === 0) return [];

  // 비용 행렬: 유클리드 거리의 제곱 (제곱근 불필요, 순서만 중요)
  const cost = [];
  for (let i = 0; i < n; i++) {
    cost[i] = [];
    for (let j = 0; j < n; j++) {
      const dx = currentPositions[i].x - targetPositions[j].x;
      const dy = currentPositions[i].y - targetPositions[j].y;
      cost[i][j] = dx * dx + dy * dy;
    }
  }

  // 헝가리안 알고리즘 (Jonker-Volgenant style, O(n³))
  const INF = 1e18;
  const u = new Float64Array(n + 1); // row potentials
  const v = new Float64Array(n + 1); // col potentials
  const p = new Int32Array(n + 1);   // col -> row assignment
  const way = new Int32Array(n + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(INF);
    const used = new Uint8Array(n + 1);

    do {
      used[j0] = 1;
      let i0 = p[j0], delta = INF, j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else { minv[j] -= delta; }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  // p[j] = row(1-indexed) assigned to col j → 변환: assignment[row] = col
  const assignment = new Array(n);
  for (let j = 1; j <= n; j++) {
    assignment[p[j] - 1] = j - 1;
  }
  return assignment;
}
