import Dexie from 'dexie';

export const db = new Dexie('ChoreoNote');

db.version(1).stores({
  notes: '++id, title, editedAt, createdAt',
  dancers: '++id, noteId',
  formations: '++id, noteId, order',
  positions: '++id, formationId, [formationId+dancerId]',
  musicFiles: '++id, noteId',
});

// v2: 클라우드 동기화 필드 추가
db.version(2).stores({
  notes: '++id, title, editedAt, createdAt, cloudId',
  dancers: '++id, noteId',
  formations: '++id, noteId, order',
  positions: '++id, formationId, [formationId+dancerId]',
  musicFiles: '++id, noteId',
});

// v3: 폴더 모델 — location('local' | 'cloud') 필드 추가
// 기존 노트는 cloudId 유무로 위치 판별해 백필
db.version(3).stores({
  notes: '++id, title, editedAt, createdAt, cloudId, location',
  dancers: '++id, noteId',
  formations: '++id, noteId, order',
  positions: '++id, formationId, [formationId+dancerId]',
  musicFiles: '++id, noteId',
}).upgrade(async (tx) => {
  await tx.table('notes').toCollection().modify((note) => {
    if (!note.location) {
      note.location = note.cloudId ? 'cloud' : 'local';
    }
  });
});
