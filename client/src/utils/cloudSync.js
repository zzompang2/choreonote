import { supabase } from '../store/supabase.js';
import { db } from '../store/db.js';
import { NoteStore } from '../store/NoteStore.js';
import { getCurrentUser } from './auth.js';
import { showToast } from './toast.js';
import { t } from './i18n.js';

/**
 * 클라우드 동기화 유틸리티
 * - IndexedDB가 항상 primary (source of truth)
 * - 로그인 시 저장하면 서버에도 업로드
 * - 새 기기에서 수동으로 가져오기
 */

// ── 노트를 서버에 업로드 (INSERT or UPDATE) ──

export async function uploadNote(noteId) {
  const user = await getCurrentUser();
  if (!user) return null;

  const jsonStr = await NoteStore.exportJSON(noteId);
  if (!jsonStr) return null;

  const noteJson = JSON.parse(jsonStr);
  const localNote = await db.notes.get(noteId);
  if (!localNote) return null;

  if (localNote.cloudId) {
    // 충돌 체크
    const conflict = await checkConflict(localNote.cloudId, localNote.cloudUpdatedAt);
    if (conflict) {
      return { conflict: true, serverNote: conflict };
    }

    // UPDATE
    const { data, error } = await supabase
      .from('notes')
      .update({
        title: localNote.title,
        note_json: noteJson,
        music_name: localNote.musicName || null,
      })
      .eq('id', localNote.cloudId)
      .select('updated_at')
      .single();

    if (error) throw error;

    await db.notes.update(noteId, {
      cloudUpdatedAt: data.updated_at,
    });

    return { conflict: false, cloudId: localNote.cloudId };
  } else {
    // INSERT
    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: user.id,
        title: localNote.title,
        note_json: noteJson,
        music_name: localNote.musicName || null,
      })
      .select('id, updated_at')
      .single();

    if (error) throw error;

    await db.notes.update(noteId, {
      cloudId: data.id,
      cloudUpdatedAt: data.updated_at,
    });

    return { conflict: false, cloudId: data.id };
  }
}

// ── 충돌 체크: 서버가 더 최신인지 확인 ──

async function checkConflict(cloudId, localCloudUpdatedAt) {
  const { data, error } = await supabase
    .from('notes')
    .select('id, title, note_json, music_name, updated_at')
    .eq('id', cloudId)
    .single();

  if (error) {
    // 서버에서 삭제됨 → 충돌 아님, 새로 INSERT
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  if (!localCloudUpdatedAt) return null;

  const serverTime = new Date(data.updated_at).getTime();
  const localTime = new Date(localCloudUpdatedAt).getTime();

  if (serverTime > localTime) {
    return data; // 충돌: 서버가 더 최신
  }

  return null; // 충돌 없음
}

// ── 서버 노트가 로컬보다 최신인지 확인 (에디터 진입 시) ──

export async function checkServerNewer(noteId) {
  const user = await getCurrentUser();
  if (!user) return null;

  const localNote = await db.notes.get(noteId);
  if (!localNote?.cloudId) return null;

  const { data, error } = await supabase
    .from('notes')
    .select('updated_at')
    .eq('id', localNote.cloudId)
    .single();

  if (error) return null;

  if (!localNote.cloudUpdatedAt) return null;

  const serverTime = new Date(data.updated_at).getTime();
  const localTime = new Date(localNote.cloudUpdatedAt).getTime();

  return serverTime > localTime;
}

// ── 충돌 해결: 로컬로 덮어쓰기 ──

export async function resolveOverwriteServer(noteId) {
  const localNote = await db.notes.get(noteId);
  if (!localNote?.cloudId) return;

  const jsonStr = await NoteStore.exportJSON(noteId);
  const noteJson = JSON.parse(jsonStr);

  const { data, error } = await supabase
    .from('notes')
    .update({
      title: localNote.title,
      note_json: noteJson,
      music_name: localNote.musicName || null,
    })
    .eq('id', localNote.cloudId)
    .select('updated_at')
    .single();

  if (error) throw error;

  await db.notes.update(noteId, {
    cloudUpdatedAt: data.updated_at,
  });
}

// ── 충돌 해결: 서버 버전으로 교체 ──

export async function resolveUseServer(noteId, serverNote) {
  const noteJson = serverNote.note_json;

  // 기존 로컬 데이터 삭제 후 서버 데이터로 교체
  const formations = await db.formations.where('noteId').equals(noteId).toArray();
  for (const f of formations) {
    await db.positions.where('formationId').equals(f.id).delete();
  }
  await db.formations.where('noteId').equals(noteId).delete();
  await db.dancers.where('noteId').equals(noteId).delete();

  // 서버 JSON에서 댄서/대형/포지션 복원
  const dancerIds = [];
  for (let i = 0; i < noteJson.dancers.length; i++) {
    const d = noteJson.dancers[i];
    const did = await db.dancers.add({ noteId, name: d.name, color: d.color, order: i });
    dancerIds.push(did);
  }

  for (let i = 0; i < noteJson.formations.length; i++) {
    const f = noteJson.formations[i];
    const fid = await db.formations.add({ noteId, startTime: f.startTime, duration: f.duration, order: i });
    for (const pos of f.positions) {
      if (pos.dancerIndex >= 0 && pos.dancerIndex < dancerIds.length) {
        await db.positions.add({
          formationId: fid,
          dancerId: dancerIds[pos.dancerIndex],
          x: pos.x,
          y: pos.y,
          angle: pos.angle || 0,
          waypoints: pos.waypoints || undefined,
        });
      }
    }
  }

  // 노트 메타 업데이트
  await db.notes.update(noteId, {
    title: noteJson.note.title,
    duration: noteJson.note.duration,
    musicName: serverNote.music_name,
    stageWidth: noteJson.note.stageWidth,
    stageHeight: noteJson.note.stageHeight,
    dancerScale: noteJson.note.dancerScale,
    audienceDirection: noteJson.note.audienceDirection,
    dancerShape: noteJson.note.dancerShape,
    gridGap: noteJson.note.gridGap,
    showWings: noteJson.note.showWings,
    markers: noteJson.note.markers,
    cloudUpdatedAt: serverNote.updated_at,
    editedAt: new Date(),
  });
}

// ── 충돌 해결: 둘 다 유지 (서버 버전을 사본으로 생성) ──

export async function resolveKeepBoth(noteId, serverNote) {
  // 서버 버전을 새 노트로 가져오기
  const noteJson = serverNote.note_json;
  noteJson.note.title = (noteJson.note.title || '노트') + ' (서버 사본)';
  const newNoteId = await NoteStore.importJSON(JSON.stringify(noteJson));

  // 새 노트의 cloudId는 null (독립 노트)
  // 기존 노트를 서버에 강제 업로드
  await resolveOverwriteServer(noteId);

  return newNoteId;
}

// ── 서버에서 내 노트 목록 조회 ──

export async function fetchCloudNotes() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('notes')
    .select('id, title, note_json, music_name, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ── 클라우드 노트를 로컬에 다운로드 ──

export async function downloadCloudNote(cloudNote) {
  const noteJson = cloudNote.note_json;
  const newNoteId = await NoteStore.importJSON(JSON.stringify(noteJson));

  // cloudId 연결
  await db.notes.update(newNoteId, {
    cloudId: cloudNote.id,
    cloudUpdatedAt: cloudNote.updated_at,
  });

  showToast(t('cloudDownloaded'));
  return newNoteId;
}

// ── 서버에서 노트 삭제 ──

export async function deleteCloudNote(cloudId) {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', cloudId);

  if (error) throw error;
}

// ── 노트 동기화 상태 확인 ──

export function getSyncStatus(note) {
  if (!note.cloudId) return 'local'; // 로컬 전용
  if (!note.cloudUpdatedAt) return 'unsynced'; // cloudId는 있지만 동기화 안 됨
  if (new Date(note.editedAt) > new Date(note.cloudUpdatedAt)) return 'unsynced'; // 로컬이 더 최신
  return 'synced'; // 동기화 완료
}

// ── 노트 요약 (충돌 모달용) ──

export function summarizeNote(noteJson) {
  return {
    dancerCount: noteJson.dancers?.length || 0,
    formationCount: noteJson.formations?.length || 0,
    dancerNames: (noteJson.dancers || []).map(d => d.name).join(', '),
  };
}
