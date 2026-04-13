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
