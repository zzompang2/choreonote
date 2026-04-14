import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../store/db.js';
import { NoteStore } from '../store/NoteStore.js';

beforeEach(async () => {
  await db.notes.clear();
  await db.dancers.clear();
  await db.formations.clear();
  await db.positions.clear();
  await db.musicFiles.clear();
});

describe('NoteStore CRUD', () => {
  it('createNote: 기본 댄서 3명, 대형 2개 생성', async () => {
    const noteId = await NoteStore.createNote('테스트 노트');
    expect(noteId).toBeGreaterThan(0);

    const data = await NoteStore.loadNote(noteId);
    expect(data.note.title).toBe('테스트 노트');
    expect(data.dancers).toHaveLength(3);
    expect(data.formations).toHaveLength(1);

    // 각 대형에 댄서 수만큼 포지션 존재
    for (const f of data.formations) {
      expect(f.positions).toHaveLength(3);
    }
  });

  it('loadNote: 존재하지 않는 노트는 null 반환', async () => {
    const data = await NoteStore.loadNote(9999);
    expect(data).toBeNull();
  });

  it('updateNoteTitle: 제목 변경', async () => {
    const noteId = await NoteStore.createNote('원래 제목');
    await NoteStore.updateNoteTitle(noteId, '새 제목');

    const data = await NoteStore.loadNote(noteId);
    expect(data.note.title).toBe('새 제목');
  });

  it('deleteNote: 노트 및 관련 데이터 삭제', async () => {
    const noteId = await NoteStore.createNote();
    await NoteStore.deleteNote(noteId);

    const data = await NoteStore.loadNote(noteId);
    expect(data).toBeNull();

    // 관련 데이터도 삭제됨
    const dancers = await db.dancers.where('noteId').equals(noteId).count();
    const formations = await db.formations.where('noteId').equals(noteId).count();
    expect(dancers).toBe(0);
    expect(formations).toBe(0);
  });

  it('saveNote: 댄서/대형 업데이트', async () => {
    const noteId = await NoteStore.createNote();

    await NoteStore.saveNote(noteId, {
      dancers: [
        { name: 'A', color: '#FF0000' },
        { name: 'B', color: '#00FF00' },
      ],
      formations: [
        {
          startTime: 0,
          duration: 2000,
          positions: [
            { dancerIndex: 0, x: 10, y: 20 },
            { dancerIndex: 1, x: -10, y: -20 },
          ],
        },
      ],
    });

    const data = await NoteStore.loadNote(noteId);
    expect(data.dancers).toHaveLength(2);
    expect(data.formations).toHaveLength(1);
    expect(data.formations[0].positions).toHaveLength(2);
  });

  it('createNote: 중복 이름 시 자동 번호 부여', async () => {
    await NoteStore.createNote('테스트');
    await NoteStore.createNote('테스트');
    await NoteStore.createNote('테스트');

    const notes = await NoteStore.getAllNotes('title');
    const titles = notes.map(n => n.title).sort();
    expect(titles).toContain('테스트');
    expect(titles).toContain('테스트 2');
    expect(titles).toContain('테스트 3');
  });

  it('getAllNotes: 최신순 정렬', async () => {
    await NoteStore.createNote('첫 번째');
    await NoteStore.createNote('두 번째');

    const notes = await NoteStore.getAllNotes();
    expect(notes).toHaveLength(2);
    // 나중에 생성된 것이 먼저
    expect(notes[0].title).toBe('두 번째');
  });

  it('exportJSON / importJSON 라운드트립', async () => {
    const noteId = await NoteStore.createNote('내보내기 테스트');
    const json = await NoteStore.exportJSON(noteId);
    expect(json).toBeTruthy();

    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(2);
    expect(parsed.dancers).toHaveLength(3);

    // 가져오기
    const newNoteId = await NoteStore.importJSON(json);
    const data = await NoteStore.loadNote(newNoteId);
    expect(data.note.title).toBe('내보내기 테스트');
    expect(data.dancers).toHaveLength(3);
    expect(data.formations).toHaveLength(1);
  });
});

describe('NoteStore 레거시 임포트 (sparse array 변환)', () => {
  it('sparse array에서 null 필터링 + 인덱스 리맵', async () => {
    // 레거시 포맷: [dancers(sparse), formations, noteInfo]
    const legacyData = [
      // dancers: index 0은 null (sparse), 실제 댄서는 index 1, 2
      [null, { id: 1, name: '댄서A', color: '#FF0000' }, { id: 2, name: '댄서B', color: '#0000FF' }],
      // formations
      [
        {
          start: 0,
          duration: 1000,
          positionsAtSameTime: [null, { x: 10, y: 20 }, { x: -10, y: -20 }],
        },
      ],
      // noteInfo
      { title: '레거시 노트', duration: 15000 },
    ];

    const noteId = await NoteStore.importJSON(JSON.stringify(legacyData));
    const data = await NoteStore.loadNote(noteId);

    expect(data.note.title).toBe('레거시 노트');
    expect(data.dancers).toHaveLength(2);
    expect(data.dancers[0].name).toBe('댄서A');
    expect(data.dancers[1].name).toBe('댄서B');

    expect(data.formations).toHaveLength(1);
    expect(data.formations[0].positions).toHaveLength(2);
  });

  it('잘못된 형식은 에러', async () => {
    await expect(NoteStore.importJSON('{"invalid": true}')).rejects.toThrow();
  });
});
