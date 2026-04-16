import { supabase } from '../store/supabase.js';
import { getCurrentUser } from './auth.js';

const TABLE = 'market_presets';
const PAGE_SIZE = 20;

/**
 * 마켓 프리셋 목록 조회.
 * @param {Object} opts
 * @param {number} opts.page - 0-based 페이지 번호
 * @param {'created_at'|'download_count'} opts.sortBy
 * @param {number|null} opts.dancerCountMin - 인원수 필터 최소
 * @param {number|null} opts.dancerCountMax - 인원수 필터 최대
 * @returns {{ data, totalCount, hasMore }}
 */
export async function fetchPresets({ page = 0, sortBy = 'created_at', dancerCountMin = null, dancerCountMax = null } = {}) {
  let query = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .order(sortBy, { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (dancerCountMin != null) query = query.gte('dancer_count', dancerCountMin);
  if (dancerCountMax != null) query = query.lte('dancer_count', dancerCountMax);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    data: data || [],
    totalCount: count || 0,
    hasMore: (page + 1) * PAGE_SIZE < (count || 0),
  };
}

/** 프리셋 단건 조회 */
export async function fetchPresetById(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 프리셋 업로드.
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.description
 * @param {Object} opts.presetData - buildPresetData로 생성된 데이터
 */
export async function uploadPreset({ title, description = '', presetData }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('로그인이 필요합니다');

  const { error } = await supabase.from(TABLE).insert({
    user_id: user.id,
    title,
    description,
    dancer_count: presetData.dancers.length,
    formation_count: presetData.formations.length,
    preset_data: presetData,
  });

  if (error) throw new Error(error.message);
}

/** 다운로드 수 증가 (RPC) */
export async function incrementDownload(presetId) {
  supabase.rpc('increment_download_count', { preset_id: presetId }).then();
}

/** 본인 프리셋 삭제 */
export async function deletePreset(presetId) {
  const { error } = await supabase.from(TABLE).delete().eq('id', presetId);
  if (error) throw new Error(error.message);
}

/**
 * 노트 데이터에서 선택한 대형만 추출해 마켓용 preset_data 생성.
 * @param {Object} noteData - NoteStore.loadNote()로 가져온 데이터
 * @param {number[]} selectedFormationIds - 선택한 formation ID 목록
 * @returns {Object} preset_data (v2 기반, 음악 제외)
 */
export function buildPresetData(noteData, selectedFormationIds) {
  const { note, dancers, formations } = noteData;

  const selected = formations
    .filter(f => selectedFormationIds.includes(f.id))
    .sort((a, b) => a.order - b.order);

  // 선택된 대형에 포함된 댄서만 추출
  const usedDancerIds = new Set();
  for (const f of selected) {
    for (const p of f.positions) {
      usedDancerIds.add(p.dancerId);
    }
  }

  const filteredDancers = dancers.filter(d => usedDancerIds.has(d.id));
  const dancerIndexMap = new Map(filteredDancers.map((d, i) => [d.id, i]));

  return {
    version: 2,
    note: {
      stageWidth: note.stageWidth,
      stageHeight: note.stageHeight,
      dancerScale: note.dancerScale,
      audienceDirection: note.audienceDirection,
      dancerShape: note.dancerShape,
      gridGap: note.gridGap,
      showWings: note.showWings,
    },
    dancers: filteredDancers.map(d => ({ name: d.name, color: d.color })),
    formations: selected.map((f, i) => ({
      startTime: i === 0 ? 0 : f.startTime - selected[0].startTime,
      duration: f.duration,
      positions: f.positions
        .filter(p => usedDancerIds.has(p.dancerId))
        .map(p => ({
          dancerIndex: dancerIndexMap.get(p.dancerId),
          x: p.x,
          y: p.y,
          angle: p.angle || 0,
          waypoints: p.waypoints || undefined,
        })),
    })),
  };
}
