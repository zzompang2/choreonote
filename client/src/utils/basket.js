import { supabase } from '../store/supabase.js';
import { getCurrentUser } from './auth.js';

const TABLE = 'user_baskets';

/**
 * 바구니에 추가. 이미 담겨 있으면 { duplicated: true } 반환.
 * @param {string} presetId
 */
export async function addToBasket(presetId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('로그인이 필요합니다');

  const { error } = await supabase.from(TABLE).insert({
    user_id: user.id,
    preset_id: presetId,
  });

  if (error) {
    if (error.code === '23505') return { duplicated: true };
    throw new Error(error.message);
  }
  return { duplicated: false };
}

/** 바구니에서 제거 */
export async function removeFromBasket(presetId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('로그인이 필요합니다');

  const { error } = await supabase.from(TABLE)
    .delete()
    .eq('user_id', user.id)
    .eq('preset_id', presetId);

  if (error) throw new Error(error.message);
}

/**
 * 바구니 조회 (market_presets JOIN, 최신순).
 * 원본 preset이 삭제된 항목은 자동 제외 (CASCADE로 함께 삭제되지만 안전망).
 * @returns {Array<{ basketId, addedAt, preset }>}
 */
export async function fetchBasket() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase.from(TABLE)
    .select('id, added_at, preset_id, market_presets(*)')
    .eq('user_id', user.id)
    .order('added_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data || [])
    .filter(row => row.market_presets)
    .map(row => ({
      basketId: row.id,
      addedAt: row.added_at,
      preset: row.market_presets,
    }));
}

/** 특정 preset이 바구니에 담겨 있는지 (단건 체크) */
export async function isInBasket(presetId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data, error } = await supabase.from(TABLE)
    .select('id')
    .eq('user_id', user.id)
    .eq('preset_id', presetId)
    .maybeSingle();

  if (error) return false;
  return !!data;
}
