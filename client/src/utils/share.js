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
  // DEV: mock data for testing
  if (shareId === '_test') {
    return {
      note: { title: '테스트 안무', duration: 16000, stageWidth: 600, stageHeight: 400, audienceDirection: 'top' },
      dancers: [
        { name: 'Ham', color: '#E74C3C' },
        { name: 'Chance', color: '#3498DB' },
        { name: 'Luna', color: '#2ECC71' },
      ],
      formations: [
        { startTime: 0, duration: 4000, positions: [
          { dancerIndex: 0, x: -80, y: 0 },
          { dancerIndex: 1, x: 0, y: 0 },
          { dancerIndex: 2, x: 80, y: 0 },
        ]},
        { startTime: 5000, duration: 4000, positions: [
          { dancerIndex: 0, x: 0, y: -60 },
          { dancerIndex: 1, x: -60, y: 40 },
          { dancerIndex: 2, x: 60, y: 40 },
        ]},
      ],
    };
  }

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
