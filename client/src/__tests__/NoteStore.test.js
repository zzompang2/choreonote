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

  it('deleteNote: 소프트 삭제 (deletedAt 설정)', async () => {
    const noteId = await NoteStore.createNote();
    await NoteStore.deleteNote(noteId);

    // 소프트 삭제: loadNote는 여전히 데이터 반환
    const data = await NoteStore.loadNote(noteId);
    expect(data).not.toBeNull();
    expect(data.note.deletedAt).toBeTruthy();

    // getAllNotes에서는 제외됨
    const notes = await NoteStore.getAllNotes();
    expect(notes.find(n => n.id === noteId)).toBeUndefined();

    // getDeletedNotes에서 조회됨
    const deleted = await NoteStore.getDeletedNotes();
    expect(deleted.find(n => n.id === noteId)).toBeTruthy();
  });

  it('restoreNote: 삭제된 노트 복원', async () => {
    const noteId = await NoteStore.createNote();
    await NoteStore.deleteNote(noteId);
    await NoteStore.restoreNote(noteId);

    const notes = await NoteStore.getAllNotes();
    expect(notes.find(n => n.id === noteId)).toBeTruthy();
  });

  it('permanentlyDeleteNote: 영구 삭제', async () => {
    const noteId = await NoteStore.createNote();
    await NoteStore.permanentlyDeleteNote(noteId);

    const data = await NoteStore.loadNote(noteId);
    expect(data).toBeNull();

    const dancers = await db.dancers.where('noteId').equals(noteId).count();
    expect(dancers).toBe(0);
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

describe('NoteStore JSON 임포트 호환성', () => {
  // --- Legacy format tests ---

  it('Legacy: sparse dancers (index 0 null, 중간 gap)', async () => {
    // dancerIdRemap은 d.id || i 를 키로 사용하므로, id가 있는 경우 id로 매핑됨
    // positionsAtSameTime은 원본 배열 인덱스(did)로 순회
    // 따라서 id 필드가 인덱스와 일치하는 경우만 포지션이 매핑됨
    const legacyData = [
      // index 0 null, index 1 dancer (id=1), index 2 null (gap), index 3 dancer (id=3)
      [null, { id: 1, name: 'First', color: '#111' }, null, { id: 3, name: 'Second', color: '#333' }],
      [
        {
          start: 500,
          duration: 2000,
          positionsAtSameTime: [null, { x: 5, y: 10 }, null, { x: -5, y: -10 }],
        },
      ],
      { title: 'Sparse 테스트', duration: 20000 },
    ];

    const noteId = await NoteStore.importJSON(JSON.stringify(legacyData));
    const data = await NoteStore.loadNote(noteId);

    expect(data.dancers).toHaveLength(2);
    expect(data.dancers[0].name).toBe('First');
    expect(data.dancers[1].name).toBe('Second');
    expect(data.formations).toHaveLength(1);
    expect(data.formations[0].positions).toHaveLength(2);

    // 포지션 좌표 확인
    const posMap = {};
    for (const p of data.formations[0].positions) {
      const dancer = data.dancers.find(d => d.id === p.dancerId);
      posMap[dancer.name] = { x: p.x, y: p.y };
    }
    expect(posMap['First']).toEqual({ x: 5, y: 10 });
    expect(posMap['Second']).toEqual({ x: -5, y: -10 });
  });

  it('Legacy: noteInfo 누락 시 기본값 사용', async () => {
    const legacyData = [
      [null, { id: 1, name: 'Solo', color: '#ABC' }],
      [{ start: 0, duration: 1000, positionsAtSameTime: [null, { x: 0, y: 0 }] }],
      // noteInfo 없음 (undefined)
    ];

    const noteId = await NoteStore.importJSON(JSON.stringify(legacyData));
    const data = await NoteStore.loadNote(noteId);

    expect(data.note.title).toBe('가져온 노트');
    expect(data.note.duration).toBe(30000);
    expect(data.note.musicName).toBeNull();
  });

  it('Legacy: formations 배열이 비어있을 때', async () => {
    const legacyData = [
      [null, { id: 1, name: 'A', color: '#FFF' }],
      [], // 빈 formations
      { title: '빈 대형', duration: 5000 },
    ];

    const noteId = await NoteStore.importJSON(JSON.stringify(legacyData));
    const data = await NoteStore.loadNote(noteId);

    expect(data.note.title).toBe('빈 대형');
    expect(data.dancers).toHaveLength(1);
    expect(data.formations).toHaveLength(0);
  });

  // --- V2 format tests ---

  it('V2: optional 필드 누락 (waypoints, angle, stageWidth 등)', async () => {
    const v2Data = {
      version: 2,
      note: {
        title: 'Minimal V2',
        duration: 10000,
        musicName: null,
        // stageWidth, stageHeight, dancerScale, audienceDirection, dancerShape, gridGap, showWings, markers 모두 생략
      },
      dancers: [
        { name: 'X', color: '#F00' },
        { name: 'Y', color: '#0F0' },
      ],
      formations: [
        {
          startTime: 0,
          duration: 3000,
          positions: [
            { dancerIndex: 0, x: 10, y: 20 },          // angle, waypoints 없음
            { dancerIndex: 1, x: -10, y: -20 },
          ],
        },
      ],
    };

    const noteId = await NoteStore.importJSON(JSON.stringify(v2Data));
    const data = await NoteStore.loadNote(noteId);

    expect(data.note.title).toBe('Minimal V2');
    expect(data.note.duration).toBe(10000);
    expect(data.dancers).toHaveLength(2);
    expect(data.formations).toHaveLength(1);
    expect(data.formations[0].positions).toHaveLength(2);

    // angle 기본값 0 확인
    for (const p of data.formations[0].positions) {
      expect(p.angle).toBe(0);
      expect(p.waypoints).toBeUndefined();
    }
  });

  it('V2: 알 수 없는 추가 필드가 있어도 정상 동작', async () => {
    const v2Data = {
      version: 2,
      unknownTopLevel: 'should be ignored',
      note: {
        title: 'Extra Fields',
        duration: 8000,
        musicName: null,
        futureField: 42,
        anotherFuture: { nested: true },
      },
      dancers: [
        { name: 'D1', color: '#AAA', unknownProp: 'ignored' },
      ],
      formations: [
        {
          startTime: 0,
          duration: 1500,
          extraFormationField: 'ignored',
          positions: [
            { dancerIndex: 0, x: 0, y: 0, angle: 45, unknownPosProp: true },
          ],
        },
      ],
    };

    const noteId = await NoteStore.importJSON(JSON.stringify(v2Data));
    const data = await NoteStore.loadNote(noteId);

    expect(data.note.title).toBe('Extra Fields');
    expect(data.dancers).toHaveLength(1);
    expect(data.dancers[0].name).toBe('D1');
    expect(data.formations).toHaveLength(1);
    expect(data.formations[0].positions).toHaveLength(1);
    expect(data.formations[0].positions[0].x).toBe(0);
  });

  it('V2: 범위 밖 dancerIndex는 건너뛰기', async () => {
    const v2Data = {
      version: 2,
      note: {
        title: 'Bad Index',
        duration: 5000,
        musicName: null,
      },
      dancers: [
        { name: 'Only', color: '#000' },
      ],
      formations: [
        {
          startTime: 0,
          duration: 2000,
          positions: [
            { dancerIndex: 0, x: 1, y: 2 },       // 유효 (0 < 1)
            { dancerIndex: 5, x: 99, y: 99 },      // 범위 초과 — 무시
            { dancerIndex: -1, x: -99, y: -99 },   // 음수 — 무시
            { dancerIndex: 1, x: 50, y: 50 },       // 범위 초과 (댄서 1명뿐) — 무시
          ],
        },
      ],
    };

    const noteId = await NoteStore.importJSON(JSON.stringify(v2Data));
    const data = await NoteStore.loadNote(noteId);

    expect(data.dancers).toHaveLength(1);
    expect(data.formations).toHaveLength(1);
    // 유효한 포지션은 dancerIndex 0 하나뿐
    expect(data.formations[0].positions).toHaveLength(1);
    expect(data.formations[0].positions[0].x).toBe(1);
    expect(data.formations[0].positions[0].y).toBe(2);
  });
});
