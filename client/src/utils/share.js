import { NoteStore } from '../store/NoteStore.js';
import { supabase } from '../store/supabase.js';

function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/**
 * 노트를 Supabase에 저장하고 공유 URL 반환
 */
export async function generateShareURL(noteId) {
  const json = await NoteStore.exportJSON(noteId);
  if (!json) return null;

  const noteData = JSON.parse(json);
  const id = generateId();

  const { error } = await supabase.from('shares').insert({
    id,
    title: noteData.note.title || '',
    note_json: noteData,
  });

  if (error) throw new Error(error.message);
  return `${window.location.origin}/#/share/${id}`;
}

/**
 * 공유 ID로 노트 데이터 조회
 */
export async function loadShareData(shareId) {
  const { data, error } = await supabase
    .from('shares')
    .select('note_json, title, view_count')
    .eq('id', shareId)
    .single();

  if (error || !data) return null;

  // 조회수 증가 (비동기, 실패해도 무시)
  supabase.from('shares').update({ view_count: (data.view_count || 0) + 1 }).eq('id', shareId).then();

  return data.note_json;
}
