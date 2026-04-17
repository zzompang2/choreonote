import { supabase } from '../store/supabase.js';
import { db } from '../store/db.js';
import { NoteStore } from '../store/NoteStore.js';
import { getCurrentUser } from './auth.js';
import { showToast } from './toast.js';
import { t } from './i18n.js';

/**
 * 클라우드 동기화 유틸리티
 * - IndexedDB가 primary, 폴더 모델(location='local' | 'cloud')로 서버와 연결
 * - location='cloud' 노트는 저장 시 자동 업로드 (uploadOnSave)
 * - 로그인 직후 클라우드 노트 자동 다운로드/병합, 충돌은 호출자가 모달로 해결 (downloadAllOnLogin)
 * - 폴더 간 이동은 moveNoteToCloud / moveNoteToLocal
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
// @deprecated 폴더 모델로 전환 중. 위치(note.location)가 상태를 대체한다. Dashboard 리팩터 후 제거.

export function getSyncStatus(note) {
  if (!note.cloudId) return 'local'; // 로컬 전용
  if (!note.cloudUpdatedAt) return 'unsynced'; // cloudId는 있지만 동기화 안 됨
  if (new Date(note.editedAt) > new Date(note.cloudUpdatedAt)) return 'unsynced'; // 로컬이 더 최신
  return 'synced'; // 동기화 완료
}

// ─────────────────────────────────────────────────────
// 폴더 모델 API
// ─────────────────────────────────────────────────────

/**
 * 저장 시 자동 업로드. note.location === 'cloud' 일 때만 실제 업로드한다.
 * 성공 시 cloudUploadPending 해제, 실패(throw) 시 플래그 세움.
 * 반환: null (no-op) 또는 uploadNote 결과 ({ conflict, serverNote? | cloudId })
 */
export async function uploadOnSave(noteId) {
  const localNote = await db.notes.get(noteId);
  if (!localNote || localNote.location !== 'cloud') return null;
  try {
    const result = await uploadNote(noteId);
    if (result && !result.conflict && localNote.cloudUploadPending) {
      await db.notes.update(noteId, { cloudUploadPending: false });
    }
    return result;
  } catch (err) {
    await db.notes.update(noteId, { cloudUploadPending: true });
    throw err;
  }
}

/**
 * 노트를 클라우드 폴더로 이동: location 플립 + 서버 업로드.
 * 로그인 필요. 결과는 uploadNote 결과와 동일 구조.
 * 업로드 실패 시 cloudUploadPending 플래그만 세우고 재throw (location은 'cloud' 유지 → 다음 저장 때 재시도).
 */
export async function moveNoteToCloud(noteId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('not-authenticated');

  await db.notes.update(noteId, { location: 'cloud' });
  try {
    const result = await uploadNote(noteId);
    if (result && !result.conflict) {
      await db.notes.update(noteId, { cloudUploadPending: false });
    }
    return result;
  } catch (err) {
    await db.notes.update(noteId, { cloudUploadPending: true });
    throw err;
  }
}

/**
 * 노트를 내 기기 폴더로 이동: 서버에서도 삭제, cloudId/cloudUpdatedAt 제거, location='local'.
 * 서버 삭제 실패는 경고만 남기고 로컬 전환은 진행한다.
 */
export async function moveNoteToLocal(noteId) {
  const localNote = await db.notes.get(noteId);
  if (!localNote) return;

  if (localNote.cloudId) {
    try {
      await deleteCloudNote(localNote.cloudId);
    } catch (err) {
      console.warn('Cloud delete failed during moveNoteToLocal:', err);
    }
  }

  await db.notes.update(noteId, {
    location: 'local',
    cloudId: undefined,
    cloudUpdatedAt: undefined,
  });
}

/**
 * 로그인 직후 호출. 서버의 모든 노트를 훑으며:
 *  - 로컬에 cloudId 매칭 없음 → 새로 다운로드 (location='cloud')
 *  - 매칭 있고 서버만 최신 → 서버 버전으로 덮어씀 + 승격
 *  - 매칭 있고 양쪽 다 변경 → conflicts에 push (호출자가 모달)
 *  - 매칭 있고 로컬이 최신/동일 → 폴더만 'cloud'로 승격
 * 반환: { downloaded, merged, conflicts: [{noteId, serverNote}], errors }
 */
export async function downloadAllOnLogin() {
  const result = { downloaded: 0, merged: 0, conflicts: [], errors: [] };

  const user = await getCurrentUser();
  if (!user) return result;

  let cloudNotes;
  try {
    cloudNotes = await fetchCloudNotes();
  } catch (err) {
    console.error('downloadAllOnLogin: fetch failed', err);
    result.errors.push({ error: err });
    return result;
  }

  const allLocalNotes = await db.notes.toArray();
  const localByCloudId = new Map();
  for (const n of allLocalNotes) {
    if (n.cloudId) localByCloudId.set(n.cloudId, n);
  }

  for (const cn of cloudNotes) {
    try {
      const local = localByCloudId.get(cn.id);
      if (!local) {
        const newNoteId = await NoteStore.importJSON(JSON.stringify(cn.note_json));
        await db.notes.update(newNoteId, {
          cloudId: cn.id,
          cloudUpdatedAt: cn.updated_at,
          location: 'cloud',
        });
        result.downloaded++;
        continue;
      }

      const serverTime = new Date(cn.updated_at).getTime();
      const localCloudTime = local.cloudUpdatedAt ? new Date(local.cloudUpdatedAt).getTime() : 0;
      const localEditedTime = local.editedAt ? new Date(local.editedAt).getTime() : 0;

      const serverChanged = serverTime > localCloudTime;
      const localChanged = localEditedTime > localCloudTime;

      if (serverChanged && localChanged) {
        result.conflicts.push({ noteId: local.id, serverNote: cn });
      } else if (serverChanged) {
        await resolveUseServer(local.id, cn);
        await db.notes.update(local.id, { location: 'cloud' });
        result.merged++;
      } else {
        await db.notes.update(local.id, { location: 'cloud' });
        result.merged++;
      }
    } catch (err) {
      console.error('downloadAllOnLogin: merge failed for', cn.id, err);
      result.errors.push({ cloudId: cn.id, error: err });
    }
  }

  return result;
}

// ── 노트 요약 (충돌 모달용) ──

export function summarizeNote(noteJson) {
  return {
    dancerCount: noteJson.dancers?.length || 0,
    formationCount: noteJson.formations?.length || 0,
    dancerNames: (noteJson.dancers || []).map(d => d.name).join(', '),
  };
}
